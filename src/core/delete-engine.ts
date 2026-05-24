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

/** Cap label/text logs so a 4 KB tooltip on some page can't flood devtools. */
const LABEL_LOG_CAP = 40

/** One-line description of a button for diagnostic logs. */
function describeButton(el: HTMLElement): string {
  const label = (el.getAttribute('aria-label') ?? '').slice(0, LABEL_LOG_CAP)
  const text = (el.textContent ?? '').trim().slice(0, LABEL_LOG_CAP)
  return `aria-label="${label}" text="${text}"`
}

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
 * The run loop iterates these phases:
 *   1. Select every visible un-checked photo, up to maxCount.
 *   2. If the batch is full, delete it and continue.
 *   3. Otherwise, try to scroll to load more photos.
 *   4. Detect end-of-gallery: when neither selection nor scroll moved
 *      anything N times in a row (`endOfListAttempts`), break the loop.
 *
 * Dry-run takes a separate path (runDryRunScan) — see that method.
 *
 * The `finally` block then flushes whatever selection remains, so the
 * last partial batch is always deleted (or counted, in dry-run).
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

    // Dry-run takes a fundamentally different path: scroll through the
    // gallery without clicking ANY checkbox, harvesting each photo's
    // stable aria-label into a Set. The Set's size is the total count.
    // This avoids the visible "select-all → deselect-all" cycle that
    // the legacy click-based approach produced, and works around Google
    // Photos' habit of pausing lazy-load while a selection is active.
    if (this.config.dryRun) {
      return this.runDryRunScan()
    }

    const url = typeof window !== 'undefined' ? window.location.pathname : '(no window)'
    const effectiveMax = this.config.maxCount

    console.log(
      `${LOG} run() start — url=${url} ` +
      `maxCount=${this.config.maxCount} ` +
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
        const clicked = await this.selectVisibleCheckboxes(remainingCapacity)
        const currentCount = this.getCount()
        const counterGain = currentCount - beforeCount
        // Google Photos caps its selection counter (~500 in practice).
        // When we click new checkboxes but the counter refuses to grow,
        // we've hit that cap — treat it as "batch full" and flush so
        // the next iteration sees a clean slate after deletion removes
        // the batch from the DOM.
        const cappedByGoogle = clicked > 0 && counterGain === 0 && currentCount > 0

        this.progress.selected = currentCount
        this.emitProgress()

        // Phase 2: if the batch is full, delete it now. Dry-run never
        // reaches this branch — it takes the runDryRunScan() path at
        // the top of run() and never clicks checkboxes.
        if (currentCount >= effectiveMax || cappedByGoogle) {
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
            console.log(`${LOG} end of gallery reached; ${currentCount} selected ready to flush`)
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
      // No silent-by-message swallow here. Real timeouts from
      // deleteSelected (delete button / dialog / confirm not found)
      // ARE actionable errors; end-of-gallery is detected explicitly
      // via consecutiveNoProgress instead. The only exception we
      // tolerate is a stop-then-throw race — caught below.
      console.error(`${LOG} run() error:`, err)
      const msg = err instanceof Error ? err.message : String(err)
      this.progress.status = 'error'
      this.progress.error = msg
      this.emitProgress()
      this.emit('error', err instanceof Error ? err : new Error(msg))
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

  /**
   * Dry-run path: scroll the gallery from top to bottom, collecting
   * each visible photo's stable identifier (aria-label of its labelled
   * ancestor, e.g. "Photo - Portrait - 10 mars 2012, 10:19:24") into
   * a Set. Final tally = Set size. Never clicks anything, so the user
   * sees no select-all flicker and Google Photos keeps lazy-loading
   * normally as we scroll.
   *
   * Two coverage measures keep us from missing photos that briefly
   * appear in the DOM during a scroll and disappear before we look:
   *   1. We harvest IDs continuously while waiting for each scroll
   *      to settle, not just once before/after.
   *   2. The scroll step is ~70% of one viewport so consecutive
   *      windows overlap — a photo at the boundary between two
   *      windows still gets at least one full pass.
   *
   * End conditions:
   *   - scroll can't advance AND no new IDs harvested for
   *     `endOfListAttempts` consecutive iterations → end of gallery.
   *   - the engine was stopped externally.
   */
  private async runDryRunScan(): Promise<Progress> {
    const url = typeof window !== 'undefined' ? window.location.pathname : '(no window)'
    console.log(
      `${LOG} run() start (dry-run scan) — url=${url} ` +
      `endOfListAttempts=${this.config.endOfListAttempts}`,
    )

    const seen = new Set<string>()
    let consecutiveNoProgress = 0
    let consecutiveEmptyWindows = 0
    let missingIdWarned = false

    this.progress.status = 'scrolling'
    this.emitProgress()

    // Start from the top — running a dry-run from mid-gallery would
    // skip everything above the viewport otherwise.
    const target = this.findScrollTarget()
    if (target) {
      target.scrollTo({ top: 0, left: 0, behavior: 'auto' })
      await sleep(this.config.scrollSettleMs)
    }

    // Initial harvest at the top before we touch the scroll target.
    this.harvestVisibleIds(seen, (warned) => { missingIdWarned = warned })
    this.progress.deleted = seen.size
    this.emitProgress()

    try {
      while (!this.stopped) {
        await this.checkPause()
        if (this.stopped) break

        const before = seen.size
        const heightBefore = target?.scrollHeight ?? 0
        const scrolled = await this.scrollAndHarvest(seen, (warned) => {
          if (warned) missingIdWarned = true
        })
        const gained = seen.size - before
        const heightGrew = target ? target.scrollHeight > heightBefore : false

        this.progress.deleted = seen.size
        if (gained > 0) this.log.record(gained)
        this.emitProgress()

        if (!scrolled && gained === 0) {
          // Shortcut: if scrollTop is already at its maximum (we're
          // visually at the bottom of all loaded content) and the
          // 1.5s scroll-settle wait didn't gain anything, there is
          // nothing left to find. Skip the multi-attempt timeout.
          if (target) {
            const atBottom = target.scrollTop + target.clientHeight + 4 >= target.scrollHeight
            if (atBottom) {
              await this.finalDryRunSettle(seen, (warned) => { if (warned) missingIdWarned = true })
              console.log(`${LOG} [dry-run] reached scroll bottom — final count: ${seen.size}`)
              break
            }
          }

          consecutiveNoProgress++
          console.log(
            `${LOG} [dry-run] no progress (${consecutiveNoProgress}/${this.config.endOfListAttempts}) ` +
            `— total so far: ${seen.size}`,
          )
          if (consecutiveNoProgress >= this.config.endOfListAttempts) {
            await this.finalDryRunSettle(seen, (warned) => { if (warned) missingIdWarned = true })
            console.log(`${LOG} [dry-run] end of gallery — final count: ${seen.size}`)
            break
          }
          await sleep(this.config.pollDelay)
        } else if (scrolled && gained === 0 && !heightGrew) {
          // We advanced past content but found nothing new and the
          // page isn't lazy-loading more. Either we've over-scrolled
          // past the last row (gallery ends here) or we're in a
          // sparse stretch. After two such windows in a row we can
          // safely call it done — a real gallery never has two empty
          // viewports in the middle.
          consecutiveEmptyWindows++
          console.log(
            `${LOG} [dry-run] empty window (${consecutiveEmptyWindows}/2) ` +
            `— scrolled past content, total: ${seen.size}`,
          )
          if (consecutiveEmptyWindows >= 2) {
            await this.finalDryRunSettle(seen, (warned) => { if (warned) missingIdWarned = true })
            console.log(`${LOG} [dry-run] gallery end inferred — final count: ${seen.size}`)
            break
          }
          consecutiveNoProgress = 0
        } else {
          consecutiveNoProgress = 0
          consecutiveEmptyWindows = 0
        }
      }
    } catch (err) {
      console.error(`${LOG} runDryRunScan() error:`, err)
      const msg = err instanceof Error ? err.message : String(err)
      this.progress.status = 'error'
      this.progress.error = msg
      this.emitProgress()
      this.emit('error', err instanceof Error ? err : new Error(msg))
    } finally {
      if (this.progress.status !== 'error') {
        this.progress.status = this.stopped ? 'idle' : 'done'
      }
      this.progress.deleted = seen.size
      this.emitProgress()
      if (this.progress.status === 'done') {
        this.emit('done', { ...this.progress })
      }
      if (missingIdWarned) {
        console.warn(`${LOG} [dry-run] some photos had no aria-label ancestor — count may be approximate`)
      }
      console.log(
        `${LOG} run() finished (dry-run scan) — status=${this.progress.status}, ` +
        `counted=${seen.size}`,
      )
    }

    return this.progress
  }

  /**
   * Final settle pass before declaring the dry-run done: keep
   * harvesting for a couple of seconds at the resting position to
   * pick up any photo whose lazy-load image landed just after the
   * scroll loop gave up. Inexpensive (only runs once per scan) and
   * eliminates the off-by-a-few undercount on slow page loads.
   */
  private async finalDryRunSettle(seen: Set<string>, onWarn: (missing: boolean) => void): Promise<void> {
    const beforeSize = seen.size
    const pollMs = Math.min(this.config.pollDelay, 200)
    const settleDeadline = Date.now() + 2000
    while (Date.now() < settleDeadline && !this.stopped) {
      await sleep(pollMs)
      this.harvestVisibleIds(seen, onWarn)
    }
    if (seen.size > beforeSize) {
      console.log(`${LOG} [dry-run] final settle picked up ${seen.size - beforeSize} more`)
      this.progress.deleted = seen.size
      this.emitProgress()
    }
  }

  /**
   * Harvest every photo ID currently in the DOM into `seen`. Reports
   * back via `onWarn(true)` the first time a checkbox has no
   * aria-label ancestor — the caller batches these into a single
   * end-of-run warning rather than spamming on every iteration.
   */
  private harvestVisibleIds(seen: Set<string>, onWarn: (missing: boolean) => void): void {
    const visible = [
      ...queryAll(SELECTOR_DEFS.checkbox),
      ...queryAll(SELECTOR_DEFS.checkboxChecked),
    ]
    for (const cb of visible) {
      const id = this.extractPhotoId(cb)
      if (id) {
        seen.add(id)
      } else {
        onWarn(true)
      }
    }
  }

  /**
   * Dry-run's scroll primitive. Scrolls forward by ~70% of one viewport
   * (overlap with the previous window so boundary photos aren't
   * missed) and harvests IDs continuously while waiting for the new
   * content to settle. Returns whether the scroll moved at all.
   */
  private async scrollAndHarvest(seen: Set<string>, onWarn: (missing: boolean) => void): Promise<boolean> {
    const target = this.findScrollTarget()
    if (!target) {
      this.harvestVisibleIds(seen, onWarn)
      return false
    }

    const beforeTop = target.scrollTop
    const beforeHeight = target.scrollHeight
    // 50% viewport step → 50% overlap. Each photo lands in two
    // consecutive windows on average, doubling the chances of being
    // caught while lazy-load was in flight at one of the two stops.
    // Costs an extra ~3s on a 100-photo gallery for noticeably more
    // reliable counts (was returning 97-100 instead of 100 at 70%).
    const step = Math.max(200, Math.floor((target.clientHeight || 800) * 0.5))
    target.scrollBy({ top: step, left: 0, behavior: 'auto' })

    // Poll for the duration of scrollSettleMs, harvesting at every
    // poll. Don't bail early on scrolled/grewHeight signals — we
    // WANT the full settle window so transient content gets seen.
    const pollMs = Math.min(this.config.pollDelay, 200)
    const start = Date.now()
    while (Date.now() - start < this.config.scrollSettleMs) {
      await sleep(pollMs)
      this.harvestVisibleIds(seen, onWarn)
    }
    // One last harvest, in case the final tick added content that
    // hadn't reached the DOM by the previous poll.
    this.harvestVisibleIds(seen, onWarn)

    const scrolled = target.scrollTop > beforeTop || target.scrollHeight > beforeHeight
    if (scrolled) {
      console.log(
        `${LOG} [dry-run] scroll: top ${beforeTop}→${target.scrollTop}, ` +
        `height ${beforeHeight}→${target.scrollHeight}, seen=${seen.size}`,
      )
    }
    return scrolled
  }

  /**
   * Pull a stable, per-photo identifier out of the DOM near a checkbox.
   * Google Photos labels each tile with an aria-label like
   * "Photo - Portrait - 10 mars 2012, 10:19:24" on an ancestor of the
   * checkbox. That label includes the timestamp down to the second,
   * which is unique-enough across a typical gallery (the only
   * collision risk is burst-mode shots that share both type AND second,
   * a corner case we accept as undercount).
   */
  private extractPhotoId(checkboxEl: Element): string | null {
    const labeled = checkboxEl.closest('[aria-label]')
    if (!labeled) return null
    const label = labeled.getAttribute('aria-label')
    if (!label || label.trim().length === 0) return null
    return label
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
   * Click every un-checked, ENABLED checkbox currently in the DOM, up
   * to `maxToSelect`. Returns the number of clicks performed.
   *
   * Does NOT wait/poll — if no checkboxes are visible right now it
   * returns 0 immediately and the caller is responsible for scrolling
   * or concluding end-of-gallery.
   *
   * We filter `[disabled]` / `[aria-disabled="true"]` because a recent
   * re-render of the photo grid may briefly mark some checkboxes as
   * disabled (e.g. shared photos the user can't modify); clicking
   * those would either do nothing or toggle them off later.
   */
  private async selectVisibleCheckboxes(maxToSelect: number): Promise<number> {
    if (maxToSelect <= 0) return 0

    const visible = queryAll(SELECTOR_DEFS.checkbox)
    const clickable = visible.filter((el) => {
      const he = el as HTMLElement
      if (he.hasAttribute('disabled')) return false
      if (he.getAttribute('aria-disabled') === 'true') return false
      return true
    })
    if (clickable.length === 0) return 0

    const batch = clickable.slice(0, maxToSelect)
    for (const cb of batch) {
      (cb as HTMLElement).click()
    }

    await sleep(this.config.selectionSettleMs)

    console.log(
      `${LOG} selected ${batch.length} new item(s) ` +
      `(visible unchecked: ${visible.length}, clickable: ${clickable.length}, counter: ${this.getCount()})`,
    )
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
      // Benign at the end of a real-delete run: once every photo has
      // moved to trash, the gallery is empty and there's nothing to
      // scroll. console.log (not warn) — no stack trace, no red icon,
      // no impression that something broke.
      console.log(`${LOG} scroll: no scrollable target (gallery may be empty)`)
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
   * element. Returns `null` if neither has more content than fits in
   * the viewport — the caller will then conclude end-of-gallery via
   * the no-progress counter rather than scrolling a non-scrollable
   * element.
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

    return null
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
    console.log(`${LOG} toolbar delete button found: ${describeButton(deleteBtn)}`)
    deleteBtn.click()

    // 2. Wait for the confirmation dialog to open.
    const dialog = await this.waitForConfirmDialog()
    console.log(`${LOG} confirmation dialog opened`)

    // 3. Find and click the destructive-action button inside the dialog.
    const confirmBtn = await this.waitForDialogConfirmButton(dialog)
    console.log(`${LOG} confirm button found: ${describeButton(confirmBtn)}`)
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
    // next batch starts from the same anchor. Google Photos re-anchors
    // the viewport after a large deletion, sometimes leaving us past
    // the end of remaining content; resetting is the safe default.
    // Failure (no scroll target) is non-fatal.
    const scrollTarget = this.findScrollTarget()
    if (scrollTarget) {
      scrollTarget.scrollTop = 0
      console.log(`${LOG} scrolled gallery back to top for next batch`)
    }
  }

  // ─── shared helpers ────────────────────────────────────────────

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
