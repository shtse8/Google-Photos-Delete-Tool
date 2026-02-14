import { type Config, DEFAULT_CONFIG } from './config'
import { SELECTORS } from './selectors'
import { $, $$, sleep, waitUntil } from './utils'

export interface Progress {
  deleted: number
  selected: number
  status: 'idle' | 'selecting' | 'deleting' | 'scrolling' | 'done' | 'error'
  startedAt: number
  error?: string
}

export type ProgressCallback = (progress: Progress) => void

/**
 * Core deletion engine — shared between extension and standalone script.
 */
export class DeleteEngine {
  private config: Config
  private progress: Progress
  private onProgress?: ProgressCallback
  private aborted = false

  constructor(config: Partial<Config> = {}, onProgress?: ProgressCallback) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.onProgress = onProgress
    this.progress = {
      deleted: 0,
      selected: 0,
      status: 'idle',
      startedAt: Date.now(),
    }
  }

  /** Stop the deletion process gracefully */
  abort(): void {
    this.aborted = true
  }

  /** Run the full deletion loop */
  async run(): Promise<Progress> {
    this.aborted = false
    this.progress.startedAt = Date.now()
    this.progress.status = 'selecting'
    this.emit()

    try {
      while (!this.aborted) {
        const { count, lastCheckbox } = await this.selectBatch()

        if (count >= this.config.maxCount) {
          await this.deleteSelected()
        } else if (lastCheckbox) {
          this.progress.status = 'scrolling'
          this.emit()
          const { top } = lastCheckbox.getBoundingClientRect()
          await this.scrollBy(top)
          this.progress.status = 'selecting'
          this.emit()
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // Timeout just means we ran out of photos — not an error
      if (!msg.includes('Timed out')) {
        this.progress.status = 'error'
        this.progress.error = msg
        this.emit()
        console.error('[DeleteEngine]', err)
      }
    } finally {
      // Flush remaining selection
      await this.deleteSelected()
      this.progress.status = this.aborted ? 'idle' : 'done'
      this.emit()
    }

    return this.progress
  }

  // --- Private helpers ---

  private emit(): void {
    this.onProgress?.({ ...this.progress })
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
    this.emit()

    console.log(`[DeleteEngine] Selected ${newCount} photos`)
    return { count: newCount, lastCheckbox: batch[batch.length - 1] ?? null }
  }

  private async deleteSelected(): Promise<void> {
    const count = this.getCount()
    if (count <= 0) return

    this.progress.status = 'deleting'
    this.emit()
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
    this.emit()

    // Scroll back to top for next batch
    this.getContainer().scrollTop = 0
  }

  private async scrollBy(height: number): Promise<void> {
    const container = this.getContainer()
    await waitUntil(
      () => {
        void container.scrollTop; // Read to ensure layout
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
