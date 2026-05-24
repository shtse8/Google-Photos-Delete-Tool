import { type Config, DEFAULT_CONFIG } from './config'
import {
  SELECTOR_DEFS,
  queryOne,
  queryAll,
  findDeleteToolbarButton,
  findConfirmDialog,
  findConfirmButton,
} from './selectors'
import { sleep, waitUntil } from './utils'
import { EventEmitter } from './event-emitter'
import { DeletionLog } from './deletion-log'

const LOG = '[gpdt]'

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
  /** Emitted after each batch deletion with the batch count */
  deleted: [number]
}

/**
 * Core deletion engine — shared between extension and standalone script.
 *
 * Supports three-state control: run → pause → resume / stop.
 *
 * The run loop:
 *   1. Selects every visible un-checked photo, up to the configured batch size.
 *   2. If the batch is full (count >= maxCount), deletes it and continues.
 *   3. Otherwise, scrolls to load more photos.
 *   4. If a scroll attempt yields no new content and no new selections
 *      can be made N times in a row, concludes we've reached the end of
 *      the gallery and breaks out of the loop. The `finally` block then
 *      flushes whatever is currently selected (so the final partial
 *      batch is still deleted).
 */
export class DeleteEngine extends EventEmitter<EngineEvents> {
  private config: Config
  private progress: Progress
  private onProgress?: ProgressCallback

  private stopped = false
  private paused = false
  private pausePromise: Promise<void> | null = null
  private pauseResolve: (() => void) | null = null

  /** Deletion log for rate tracking and ETA estimation. */
  readonly log = new DeletionLog()

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
    this.log.start()
    this.emitProgress()

    const url = typeof window !== 'undefined' ? window.location.pathname : '(no window)'
    // maxCount === 0 is the documented "no batch cap" sentinel. Internally
    // we treat it as Infinity so the math/comparisons stay natural; the
    // no-progress branch below knows to auto-flush instead of declaring
    // end-of-gallery in this mode.
    const isUnlimited = this.config.maxCount === 0
    const effectiveMax = isUnlimited ? Infinity : this.config.maxCount

    console.log(
      `${LOG} run() start — url=${url} ` +
      `maxCount=${this.config.maxCount}${isUnlimited ? ' (unlimited)' : ''} ` +
      `dryRun=${this.config.dryRun} actionTimeout=${this.config.actionTimeout}ms ` +
      `endOfListAttempts=${this.config.endOfListAttempts}`,
    )

    let consecutiveNoProgress = 0

    try {
      while (!this.stopped) {
        await this.checkPause()
        if (this.stopped) break

        // Phase 1: select what's visible (up to the effective batch cap).
        const beforeCount = this.getCount()
        const remainingCapacity = effectiveMax - beforeCount
        await this.selectVisibleCheckboxes(remainingCapacity)
        const currentCount = this.getCount()
        const counterGain = currentCount - beforeCount

        this.progress.selected = currentCount
        this.emitProgress()

        // Phase 2: if the batch is full, delete it now (or, in dry-run,
        // stop here — we can't deselect-and-recount without double-counting
        // the same visible photos forever).
        if (currentCount >= effectiveMax) {
          if (this.config.dryRun) {
            console.log(
              `${LOG} [dry-run] reached cap of ${this.config.maxCount} — stopping. ` +
              `Increase maxCount if you want to count more photos.`,
            )
            break
          }
          await this.deleteSelected()
          consecutiveNoProgress = 0
          continue
        }

        // Phase 3: not yet full — try to scroll for more photos.
        this.progress.status = 'scrolling'
        this.emitProgress()
        const scrolled = await this.tryScrollForMore()
        this.progress.status = 'selecting'
        this.emitProgress()

        // Detect end-of-gallery: we made no real progress this iteration
        // (the counter didn't grow AND scroll didn't reveal new content).
        // We require N consecutive failures so a transient page hiccup
        // doesn't cut the run short.
        if (counterGain <= 0 && !scrolled) {
          consecutiveNoProgress++
          console.log(
            `${LOG} no progress (${consecutiveNoProgress}/${this.config.endOfListAttempts}) ` +
            `— counter ${beforeCount}→${currentCount}, scroll did not advance`,
          )
          if (consecutiveNoProgress >= this.config.endOfListAttempts) {
            // Unlimited mode: this is most likely Google Photos' own
            // selection cap (~500) rather than the true end of the
            // gallery. Flush whatever is selected and try again — if
            // the next round also stalls with an empty counter, we'll
            // exit on the OUTER consecutiveNoProgress check (currentCount
            // will be 0 after the flush).
            if (isUnlimited && currentCount > 0) {
              console.log(
                `${LOG} unlimited mode: flushing ${currentCount} (likely GP cap) ` +
                `and continuing`,
              )
              await this.deleteSelected()
              consecutiveNoProgress = 0
              continue
            }
            console.log(
              `${LOG} end of gallery reached after ${this.config.endOfListAttempts} ` +
              `attempts with no progress; ${currentCount} selected ready to flush`,
            )
            break
          }
          // Brief pause before retrying — the page might just be slow.
          await sleep(this.config.pollDelay)
        } else {
          if (consecutiveNoProgress > 0) {
            console.log(
              `${LOG} progress resumed (was ${consecutiveNoProgress}, ` +
              `counter ${beforeCount}→${currentCount}, scrolled=${scrolled})`,
            )
          }
          consecutiveNoProgress = 0
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // Timed-out exceptions are treated as "no more photos" — not a fatal error.
      if (msg.includes('Timed out')) {
        console.log(`${LOG} timed out waiting for content — assuming end of gallery`)
      } else {
        console.error(`${LOG} run() error:`, err)
        this.progress.status = 'error'
        this.progress.error = msg
        this.emitProgress()
        this.emit('error', err instanceof Error ? err : new Error(msg))
      }
    } finally {
      // Flush remaining selection — this is what handles the "last partial batch".
      try {
        const remaining = this.getCount()
        if (remaining > 0 && !this.stopped && this.progress.status !== 'error') {
          console.log(`${LOG} flushing final batch of ${remaining}`)
          await this.deleteSelected()
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`${LOG} final flush failed:`, err)
        if (this.progress.status !== 'error') {
          this.progress.status = 'error'
          this.progress.error = msg
          this.emitProgress()
          this.emit('error', err instanceof Error ? err : new Error(msg))
        }
      }

      if (this.progress.status !== 'error') {
        this.progress.status = this.stopped ? 'idle' : 'done'
      }
      this.emitProgress()
      if (this.progress.status === 'done') {
        this.emit('done', { ...this.progress })
      }

      console.log(
        `${LOG} run() finished — status=${this.progress.status}, ` +
        `deleted=${this.progress.deleted}`,
      )
    }

    return this.progress
  }

  // ─── Private helpers ───────────────────────────────────────────

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

  /**
   * Read the selected-count badge. Robust to locale-specific number
   * formatting (e.g. "1 234" in French uses a non-breaking space).
   */
  private getCount(): number {
    const el = queryOne(SELECTOR_DEFS.counter)
    if (!el) return 0
    const digitsOnly = (el.textContent ?? '').replace(/[^\d]/g, '')
    return parseInt(digitsOnly, 10) || 0
  }

  /**
   * Click every un-checked checkbox currently in the DOM, up to maxToSelect.
   * Returns the number of clicks performed. Does NOT wait/poll — if no
   * checkboxes are visible right now it returns 0 immediately (the caller
   * is responsible for scrolling or concluding end-of-gallery).
   */
  private async selectVisibleCheckboxes(maxToSelect: number): Promise<number> {
    if (maxToSelect <= 0) return 0

    const checkboxes = queryAll(SELECTOR_DEFS.checkbox)
    if (checkboxes.length === 0) {
      return 0
    }

    const batch = checkboxes.slice(0, maxToSelect)
    for (const cb of batch) {
      (cb as HTMLElement).click()
    }

    await sleep(this.config.selectionSettleMs)

    if (batch.length > 0) {
      console.log(
        `${LOG} selected ${batch.length} new item(s) ` +
        `(visible unchecked: ${checkboxes.length}, counter: ${this.getCount()})`,
      )
    }
    return batch.length
  }

  /**
   * Attempt to scroll the gallery to expose more photos.
   * Returns true if scrolling produced any observable change (scrollTop
   * advanced, scrollHeight grew, or more unchecked checkboxes appeared);
   * false otherwise (i.e. we're at the end of the gallery).
   */
  private async tryScrollForMore(): Promise<boolean> {
    const target = this.findScrollTarget()
    if (!target) {
      console.warn(`${LOG} scroll: no scrollable target found`)
      return false
    }

    const measure = (): { top: number; height: number; checkboxes: number } => ({
      top: target.scrollTop,
      height: target.scrollHeight,
      checkboxes: queryAll(SELECTOR_DEFS.checkbox).length,
    })

    const before = measure()
    const step = Math.max(200, target.clientHeight || 800)
    target.scrollBy({ top: step, left: 0, behavior: 'auto' })

    const start = Date.now()
    while (Date.now() - start < this.config.scrollSettleMs) {
      await sleep(Math.min(this.config.pollDelay, 200))
      const after = measure()
      const movedScroll = after.top > before.top
      const grewHeight = after.height > before.height
      const moreCheckboxes = after.checkboxes > before.checkboxes
      if (movedScroll || grewHeight || moreCheckboxes) {
        console.log(
          `${LOG} scroll progress: top ${before.top}→${after.top}, ` +
          `height ${before.height}→${after.height}, ` +
          `unchecked ${before.checkboxes}→${after.checkboxes}`,
        )
        return true
      }
    }

    console.log(
      `${LOG} scroll yielded no new content (top=${before.top} of ${before.height}, ` +
      `unchecked=${before.checkboxes})`,
    )
    return false
  }

  /**
   * Find the element that actually scrolls when we want to load more
   * photos. Tries the photo container first, then the document scroll
   * element. Returns whichever is actually scrollable.
   */
  private findScrollTarget(): HTMLElement | null {
    const container = queryOne(SELECTOR_DEFS.photoContainer) as HTMLElement | null
    if (container && container.scrollHeight > container.clientHeight + 1) {
      return container
    }

    const docScroll = (document.scrollingElement || document.documentElement) as HTMLElement | null
    if (docScroll && docScroll.scrollHeight > docScroll.clientHeight + 1) {
      return docScroll
    }

    // As a last resort return whatever we found, even if it doesn't look scrollable.
    return container ?? docScroll ?? null
  }

  /**
   * Delete (or, in dry-run mode, count) the currently selected photos.
   * Locale-aware: finds the toolbar button and confirm-button by
   * keyword across multiple languages.
   */
  private async deleteSelected(): Promise<void> {
    const count = this.getCount()
    if (count <= 0) return

    // ─── Dry-run path: count and deselect, then return ────────────
    if (this.config.dryRun) {
      this.progress.deleted += count
      this.progress.selected = 0
      this.log.record(count)
      this.emitProgress()
      this.emit('deleted', count)
      console.log(
        `${LOG} [dry-run] would delete ${count} photos ` +
        `(total: ${this.progress.deleted}). Deselecting…`,
      )

      // Click every currently-checked checkbox to clear the selection.
      const checked = queryAll(SELECTOR_DEFS.checkboxChecked)
      for (const cb of checked) (cb as HTMLElement).click()
      await sleep(this.config.selectionSettleMs)
      return
    }

    // ─── Real deletion path ───────────────────────────────────────
    this.progress.status = 'deleting'
    this.emitProgress()
    console.log(`${LOG} deleting batch of ${count}`)

    // 1. Click the toolbar "move to trash" / "delete" button.
    const deleteBtn = await this.waitForToolbarDeleteButton()
    console.log(
      `${LOG} found toolbar delete button: ` +
      `aria-label="${deleteBtn.getAttribute('aria-label') ?? ''}" ` +
      `text="${(deleteBtn.textContent ?? '').trim().slice(0, 40)}"`,
    )
    deleteBtn.click()

    // 2. Wait for the confirmation dialog to open.
    const dialog = await this.waitForConfirmDialog()
    console.log(`${LOG} confirmation dialog opened`)

    // 3. Find and click the destructive-action button inside the dialog.
    const confirmBtn = await this.waitForDialogConfirmButton(dialog)
    console.log(
      `${LOG} confirm button: ` +
      `aria-label="${confirmBtn.getAttribute('aria-label') ?? ''}" ` +
      `text="${(confirmBtn.textContent ?? '').trim().slice(0, 40)}"`,
    )
    confirmBtn.click()

    // 4. Wait for the counter to reset, meaning deletion has completed.
    try {
      await waitUntil(
        () => this.getCount() === 0,
        this.config.actionTimeout,
        this.config.pollDelay,
      )
    } catch {
      throw new Error(
        `Deletion confirmation timed out: selected-count never returned to 0 ` +
        `within ${this.config.actionTimeout}ms after clicking confirm. ` +
        `Google Photos may be slow or the click did not register.`,
      )
    }

    this.progress.deleted += count
    this.progress.selected = 0
    this.log.record(count)
    this.emitProgress()
    this.emit('deleted', count)
    console.log(`${LOG} batch deleted — total now ${this.progress.deleted}`)

    // Best-effort: scroll the photo container back to the top so the
    // next batch starts from the same anchor. Failure is non-fatal.
    const scrollTarget = this.findScrollTarget()
    if (scrollTarget) scrollTarget.scrollTop = 0
  }

  private async waitForToolbarDeleteButton(): Promise<HTMLElement> {
    try {
      return await waitUntil(
        () => findDeleteToolbarButton(),
        this.config.actionTimeout,
        this.config.pollDelay,
      )
    } catch {
      throw new Error(
        `Delete/trash button not found in toolbar after ${this.config.actionTimeout}ms. ` +
        `Make sure you're on photos.google.com with photos selected. ` +
        `If your UI language isn't supported yet, please open an issue with the ` +
        `aria-label of the delete button (right-click → inspect).`,
      )
    }
  }

  private async waitForConfirmDialog(): Promise<HTMLElement> {
    try {
      return await waitUntil(
        () => findConfirmDialog(),
        this.config.actionTimeout,
        this.config.pollDelay,
      )
    } catch {
      throw new Error(
        `Confirmation dialog did not appear after ${this.config.actionTimeout}ms. ` +
        `The first click may not have registered, or Google Photos changed its ` +
        `dialog markup. Try increasing pollDelay or reload the page.`,
      )
    }
  }

  private async waitForDialogConfirmButton(dialog: HTMLElement): Promise<HTMLElement> {
    try {
      return await waitUntil(
        () => findConfirmButton(dialog),
        this.config.actionTimeout,
        this.config.pollDelay,
      )
    } catch {
      throw new Error(
        `Confirm button not found inside the confirmation dialog after ` +
        `${this.config.actionTimeout}ms. If your UI is in an unsupported ` +
        `language, please open an issue with the dialog's button text.`,
      )
    }
  }
}
