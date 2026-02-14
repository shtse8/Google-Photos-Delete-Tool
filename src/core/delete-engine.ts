import { type Config, DEFAULT_CONFIG } from './config'
import { SELECTORS } from './selectors'
import { $, $$, sleep, waitUntil } from './utils'
import { EventEmitter } from './event-emitter'

export type EngineStatus =
  | 'idle'
  | 'selecting'
  | 'deleting'
  | 'scrolling'
  | 'paused'
  | 'done'
  | 'error'

export interface Progress {
  deleted: number
  selected: number
  status: EngineStatus
  startedAt: number
  error?: string
}

export type ProgressCallback = (progress: Progress) => void

/** Events emitted by DeleteEngine */
export interface EngineEvents {
  progress: [Progress]
  error: [Error]
  done: [Progress]
  paused: []
  resumed: []
}

/**
 * Core deletion engine — shared between extension and standalone script.
 *
 * Supports three-state control: run → pause → resume / stop.
 */
export class DeleteEngine extends EventEmitter<EngineEvents> {
  private config: Config
  private progress: Progress
  private onProgress?: ProgressCallback

  private stopped = false
  private paused = false
  private pausePromise: Promise<void> | null = null
  private pauseResolve: (() => void) | null = null

  constructor(config: Partial<Config> = {}, onProgress?: ProgressCallback) {
    super()
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.onProgress = onProgress
    this.progress = {
      deleted: 0,
      selected: 0,
      status: 'idle',
      startedAt: Date.now(),
    }
  }

  /** Pause the deletion process. Can be resumed with resume(). */
  pause(): void {
    if (this.paused || this.stopped) return
    this.paused = true
    this.pausePromise = new Promise<void>((resolve) => {
      this.pauseResolve = resolve
    })
    this.progress.status = 'paused'
    this.emitProgress()
    this.emit('paused')
  }

  /** Resume a paused deletion process. */
  resume(): void {
    if (!this.paused) return
    this.paused = false
    this.pauseResolve?.()
    this.pausePromise = null
    this.pauseResolve = null
    this.emit('resumed')
  }

  /** Stop the deletion process permanently. Cannot be resumed. */
  stop(): void {
    this.stopped = true
    // Also unblock any pause wait
    if (this.paused) {
      this.paused = false
      this.pauseResolve?.()
      this.pausePromise = null
      this.pauseResolve = null
    }
  }

  /** @deprecated Use stop() instead. Kept for backward compatibility. */
  abort(): void {
    this.stop()
  }

  /** Check if the engine is currently paused. */
  get isPaused(): boolean {
    return this.paused
  }

  /** Check if the engine has been stopped. */
  get isStopped(): boolean {
    return this.stopped
  }

  /** Run the full deletion loop */
  async run(): Promise<Progress> {
    this.stopped = false
    this.paused = false
    this.progress.startedAt = Date.now()
    this.progress.status = 'selecting'
    this.emitProgress()

    try {
      while (!this.stopped) {
        // Check for pause
        await this.checkPause()
        if (this.stopped) break

        const { count, lastCheckbox } = await this.selectBatch()

        if (count >= this.config.maxCount) {
          await this.deleteSelected()
        } else if (lastCheckbox) {
          this.progress.status = 'scrolling'
          this.emitProgress()
          const { top } = lastCheckbox.getBoundingClientRect()
          await this.scrollBy(top)
          this.progress.status = 'selecting'
          this.emitProgress()
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // Timeout just means we ran out of photos — not an error
      if (!msg.includes('Timed out')) {
        this.progress.status = 'error'
        this.progress.error = msg
        this.emitProgress()
        this.emit('error', err instanceof Error ? err : new Error(msg))
        console.error('[DeleteEngine]', err)
      }
    } finally {
      // Flush remaining selection
      await this.deleteSelected()
      this.progress.status = this.stopped ? 'idle' : 'done'
      this.emitProgress()
      if (this.progress.status === 'done') {
        this.emit('done', { ...this.progress })
      }
    }

    return this.progress
  }

  // --- Private helpers ---

  /** Wait while paused. */
  private async checkPause(): Promise<void> {
    if (this.pausePromise) {
      await this.pausePromise
    }
  }

  private emitProgress(): void {
    const snapshot = { ...this.progress }
    this.onProgress?.(snapshot)
    this.emit('progress', snapshot)
  }

  private getCount(): number {
    const el = $(SELECTORS.counter)
    return el ? parseInt(el.textContent ?? '0', 10) || 0 : 0
  }

  private getContainer(): HTMLElement {
    const el = $(SELECTORS.photoContainer) as HTMLElement | null
    if (!el) throw new Error('Photo container not found — are you on photos.google.com?')
    return el
  }

  private async selectBatch(): Promise<{ count: number; lastCheckbox: Element | null }> {
    const checkboxes = await waitUntil(
      () => {
        const els = $$(SELECTORS.checkbox)
        return els.length > 0 ? els : null
      },
      this.config.timeout,
      this.config.pollDelay,
    )

    const currentCount = this.getCount()
    const remaining = this.config.maxCount - currentCount
    const batch = checkboxes.slice(0, remaining)
    batch.forEach(cb => (cb as HTMLElement).click())

    await sleep(200)
    const newCount = this.getCount()
    this.progress.selected = newCount
    this.emitProgress()

    console.log(`[DeleteEngine] Selected ${newCount} photos`)
    return { count: newCount, lastCheckbox: batch[batch.length - 1] ?? null }
  }

  private async deleteSelected(): Promise<void> {
    const count = this.getCount()
    if (count <= 0) return

    // In dry run mode, just record the count and deselect
    if (this.config.dryRun) {
      this.progress.deleted += count
      this.progress.selected = 0
      this.emitProgress()
      console.log(`[DeleteEngine] Dry run: would delete ${count} photos (total: ${this.progress.deleted})`)

      // Deselect all by clicking the selected checkboxes
      const selected = $$(SELECTORS.checkbox.replace('false', 'true'))
      selected.forEach(cb => (cb as HTMLElement).click())
      await sleep(200)
      return
    }

    this.progress.status = 'deleting'
    this.emitProgress()
    console.log(`[DeleteEngine] Deleting ${count} photos...`)

    const deleteBtn = $(SELECTORS.deleteButton) as HTMLElement | null
    if (!deleteBtn) throw new Error('Delete button not found')
    deleteBtn.click()

    // Wait for confirmation dialog
    const confirmBtn = await waitUntil(
      () =>
        [...document.querySelectorAll('button')].find(
          btn => btn.textContent?.trim() === 'Move to trash',
        ),
      this.config.timeout,
      this.config.pollDelay,
    )
    confirmBtn.click()

    // Wait for count to reset
    await waitUntil(
      () => this.getCount() === 0,
      this.config.timeout,
      this.config.pollDelay,
    )

    this.progress.deleted += count
    this.progress.selected = 0
    this.emitProgress()

    // Scroll back to top for next batch
    this.getContainer().scrollTop = 0
  }

  private async scrollBy(height: number): Promise<void> {
    const container = this.getContainer()
    await waitUntil(
      () => {
        void container.scrollTop // Read to ensure layout
        container.scrollBy(0, height)
        return waitUntil(
          () => $(SELECTORS.checkbox),
          500,
          this.config.pollDelay,
        ).catch(() => null)
      },
      this.config.timeout,
      this.config.pollDelay,
    )
  }
}
