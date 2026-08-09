import { DEFAULT_CONFIG, type Config } from './config'
import { DeletionLog } from './deletion-log'
import type { EngineDom, PhotoTile } from './dom-adapter'
import { shouldSelectTile, type PhotoFilter } from './photo-filter'
import { diagnostics } from './diagnostics'
import type { RunStatus } from './status'
import { describeButton } from './utils'

const LOG = '[gpdt]'

/** Thrown internally when the user requests a stop mid-wait. */
export class StopRequested extends Error {
  constructor() {
    super('stop requested')
    this.name = 'StopRequested'
  }
}

export interface Progress {
  deleted: number
  selected: number
  status: RunStatus
  startedAt: number
  error?: string
  /** Gallery total; set when known (dry-run scan). */
  total?: number
}

export interface EngineOptions {
  /** DOM adapter (browser or fake). Required — the engine is DOM-free. */
  dom: EngineDom
  config?: Partial<Config>
  /** Type filter for selection and dry-run counting. */
  filter?: PhotoFilter
  onProgress?: (progress: Progress) => void
}


/**
 * Core deletion engine — shared between extension and standalone script.
 *
 * Runs on an injected {@link EngineDom} adapter so the entire loop is
 * unit-testable. Supports three-state control: run → pause → resume / stop.
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
 * Stop is abort-aware: every wait yields to `stop()`, and a stopped run
 * resolves with status 'idle', NEVER 'error'. The `finally` block flushes
 * whatever selection remains (unless stopped or errored), so the last
 * partial batch is always deleted (or counted, in dry-run).
 */
export class DeleteEngine {
  private readonly config: Config
  private readonly dom: EngineDom
  private readonly filter: PhotoFilter
  private readonly onProgress?: (progress: Progress) => void

  private progress: Progress
  private stopped = false
  private paused = false
  private pausePromise: Promise<void> | null = null
  private pauseResolve: (() => void) | null = null

  private counterFallbackUsed = false
  private flapRecoveries = 0
  private dryRunLabelsArr: string[] = []

  /** Deletion log for rate tracking. */
  readonly log = new DeletionLog()

  /**
   * Labels harvested by the last dry-run scan (for Pro CSV export).
   * Empty for real-delete runs and before any dry-run completes.
   */
  getDryRunLabels(): readonly string[] {
    return this.dryRunLabelsArr
  }

  constructor(options: EngineOptions) {
    this.dom = options.dom
    this.config = { ...DEFAULT_CONFIG, ...options.config }
    this.filter = options.filter ?? { kind: 'all' }
    this.onProgress = options.onProgress
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
  }

  /** Resume a paused deletion process. */
  resume(): void {
    if (!this.paused) return
    this.paused = false
    this.pauseResolve?.()
    this.pausePromise = null
    this.pauseResolve = null
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
    this.progress = {
      deleted: 0,
      selected: 0,
      status: 'selecting',
      startedAt: Date.now(),
    }
    this.log.start()
    this.emitProgress()

    // Dry-run takes a fundamentally different path: scroll through the
    // gallery without clicking ANY checkbox, harvesting each photo's
    // stable aria-label into a Set. The Set's size is the total count.
    if (this.config.dryRun) {
      return this.runDryRunScan()
    }

    const effectiveMax = this.config.maxCount
    let consecutiveNoProgress = 0

    console.log(
      `${LOG} run() start — url=${this.dom.pathname} ` +
      `maxCount=${effectiveMax} filter=${JSON.stringify(this.filter)}`,
    )

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
        // we've hit that cap — treat it as "batch full" and flush.
        const cappedByGoogle = clicked > 0 && counterGain === 0 && currentCount > 0

        if (counterGain < 0) {
          this.flapRecoveries++
          console.warn(
            `${LOG} selection counter regressed ${beforeCount}→${currentCount} ` +
            `(flap) — wave selection will re-click still-unchecked tiles`,
          )
        }

        this.progress.selected = currentCount
        this.emitProgress()

        // Phase 2: if the batch is full, delete it now.
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

        // Detect end-of-gallery: no real progress this iteration.
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
          await this.dom.sleep(this.config.pollDelay)
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
      if (err instanceof StopRequested) {
        // User stop: never surface as an error.
        console.log(`${LOG} run() stopped by user`)
      } else {
        console.error(`${LOG} run() error:`, err)
        const msg = err instanceof Error ? err.message : String(err)
        this.progress.status = 'error'
        this.progress.error = msg
        this.emitProgress()
      }
    } finally {
      // Flush remaining selection — this handles the "last partial batch".
      const runFailed = this.progress.status === 'error'
      if (!runFailed && !this.stopped) {
        try {
          const remaining = this.getCount()
          if (remaining > 0) {
            console.log(`${LOG} flushing final batch of ${remaining}`)
            await this.deleteSelected()
          }
        } catch (err) {
          if (!(err instanceof StopRequested)) {
            const msg = err instanceof Error ? err.message : String(err)
            console.error(`${LOG} final flush failed:`, err)
            if (this.progress.status !== 'error') {
              this.progress.status = 'error'
              this.progress.error = msg
              this.emitProgress()
            }
          }
        }
      }

      if (this.progress.status !== 'error') {
        this.progress.status = this.stopped ? 'idle' : 'done'
      }
      this.emitProgress()
      if (this.progress.status === 'done') {
      }

      diagnostics.setEngine({
        status: this.progress.status,
        error: this.progress.error,
        deleted: this.progress.deleted,
        selected: this.progress.selected,
        counterFallbackUsed: this.counterFallbackUsed,
        flapRecoveries: this.flapRecoveries,
      })

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
   * ancestor) into a Set. Final tally = Set size. Never clicks anything.
   *
   * Two coverage measures keep us from missing photos that briefly
   * appear in the DOM during a scroll and disappear before we look:
   *   1. We harvest IDs continuously while waiting for each scroll
   *      to settle, not just once before/after.
   *   2. The scroll step is ~50% of one viewport so consecutive
   *      windows overlap — a photo at the boundary between two
   *      windows still gets at least one full pass.
   */
  private async runDryRunScan(): Promise<Progress> {
    console.log(
      `${LOG} run() start (dry-run scan) — url=${this.dom.pathname} ` +
      `filter=${JSON.stringify(this.filter)}`,
    )

    const seen = new Set<string>()
    this.dryRunLabelsArr = []
    let consecutiveNoProgress = 0
    let consecutiveEmptyWindows = 0
    let missingIdWarned = false

    this.progress.status = 'scrolling'
    this.emitProgress()

    // Start from the top — running a dry-run from mid-gallery would
    // skip everything above the viewport otherwise.
    const target = this.dom.findScrollTarget()
    if (target) {
      target.scrollTo({ top: 0, left: 0, behavior: 'auto' })
      await this.dom.sleep(this.config.scrollSettleMs)
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
          // Shortcut: already visually at the bottom of all loaded content.
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
          await this.dom.sleep(this.config.pollDelay)
        } else if (scrolled && gained === 0 && !heightGrew) {
          // Scrolled past content but found nothing new and the page
          // isn't lazy-loading more. After two such windows, done.
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
      if (err instanceof StopRequested) {
        console.log(`${LOG} [dry-run] stopped by user`)
      } else {
        console.error(`${LOG} runDryRunScan() error:`, err)
        const msg = err instanceof Error ? err.message : String(err)
        this.progress.status = 'error'
        this.progress.error = msg
        this.emitProgress()
      }
    } finally {
      if (this.progress.status !== 'error') {
        this.progress.status = this.stopped ? 'idle' : 'done'
      }
      this.progress.deleted = seen.size
      this.progress.total = seen.size
      this.dryRunLabelsArr = [...seen]
      this.emitProgress()
      if (this.progress.status === 'done') {
      }
      if (missingIdWarned) {
        console.warn(`${LOG} [dry-run] some photos had no aria-label ancestor — count may be approximate`)
      }
      diagnostics.setEngine({
        status: this.progress.status,
        error: this.progress.error,
        deleted: this.progress.deleted,
        selected: 0,
        counterFallbackUsed: this.counterFallbackUsed,
        flapRecoveries: this.flapRecoveries,
      })
      console.log(
        `${LOG} run() finished (dry-run scan) — status=${this.progress.status}, ` +
        `counted=${seen.size}`,
      )
    }

    return this.progress
  }

  /**
   * Final settle pass before declaring the dry-run done: keep
   * harvesting for a couple of seconds at the resting position.
   */
  private async finalDryRunSettle(seen: Set<string>, onWarn: (missing: boolean) => void): Promise<void> {
    const beforeSize = seen.size
    const pollMs = Math.min(this.config.pollDelay, 200)
    const settleDeadline = Date.now() + 2000
    while (Date.now() < settleDeadline && !this.stopped) {
      await this.dom.sleep(pollMs)
      this.harvestVisibleIds(seen, onWarn)
    }
    if (seen.size > beforeSize) {
      console.log(`${LOG} [dry-run] final settle picked up ${seen.size - beforeSize} more`)
      this.progress.deleted = seen.size
      this.emitProgress()
    }
  }

  /**
   * Harvest every photo ID currently in the DOM into `seen`, honoring
   * the active type filter. Reports back via `onWarn(true)` the first
   * time a tile has no aria-label ancestor.
   */
  private harvestVisibleIds(seen: Set<string>, onWarn: (missing: boolean) => void): void {
    const tiles: readonly PhotoTile[] = [
      ...this.dom.uncheckedTiles(),
      ...this.dom.checkedTiles(),
    ]
    for (const tile of tiles) {
      const label = tile.label()
      if (!label) {
        onWarn(true)
        continue
      }
      if (!shouldSelectTile(label, this.filter)) continue
      seen.add(label)
      diagnostics.addLabelSample(label)
    }
  }

  /**
   * Dry-run's scroll primitive. Scrolls forward by ~50% of one viewport
   * (overlap with the previous window so boundary photos aren't missed)
   * and harvests IDs continuously while waiting for the new content to
   * settle. Returns whether the scroll moved at all.
   */
  private async scrollAndHarvest(seen: Set<string>, onWarn: (missing: boolean) => void): Promise<boolean> {
    const target = this.dom.findScrollTarget()
    if (!target) {
      this.harvestVisibleIds(seen, onWarn)
      return false
    }

    const beforeTop = target.scrollTop
    const beforeHeight = target.scrollHeight
    const step = Math.max(200, Math.floor((target.clientHeight || 800) * 0.5))
    target.scrollBy({ top: step, left: 0, behavior: 'auto' })

    // Poll for the duration of scrollSettleMs, harvesting at every poll.
    const pollMs = Math.min(this.config.pollDelay, 200)
    const start = Date.now()
    while (Date.now() - start < this.config.scrollSettleMs) {
      await this.dom.sleep(pollMs)
      this.harvestVisibleIds(seen, onWarn)
    }
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

  // ─── Private helpers ───────────────────────────────────────────

  /** Wait while paused (resolves on resume or stop). */
  private async checkPause(): Promise<void> {
    if (this.pausePromise) {
      await this.pausePromise
    }
  }

  private emitProgress(): void {
    const snapshot = { ...this.progress }
    this.onProgress?.(snapshot)
  }

  /**
   * Read the selected-count. Primary: the toolbar counter element.
   * Fallback (with diagnostics): the number of rendered checked tiles,
   * used when the counter element is missing or reads 0 while tiles are
   * visibly checked (stale/moved counter markup).
   */
  private getCount(): number {
    const text = this.dom.counterText()
    const checked = this.dom.checkedTiles().length
    if (text === null) {
      if (checked > 0) this.noteCounterFallback()
      return checked
    }
    const digitsOnly = text.replace(/[^\d]/g, '')
    const parsed = parseInt(digitsOnly, 10) || 0
    if (parsed > 0) return parsed
    if (checked > 0) {
      this.noteCounterFallback()
      return checked
    }
    return 0
  }

  private noteCounterFallback(): void {
    if (!this.counterFallbackUsed) {
      this.counterFallbackUsed = true
      console.warn(
        `${LOG} selected-count element missing or stale — falling back to rendered checked-checkbox count`,
      )
    }
  }

  /**
   * Wave-based selection: repeatedly query still-unchecked tiles, click
   * up to a small wave, and re-query after a short settle. Because every
   * wave only ever clicks tiles that are CURRENTLY unchecked, an
   * async aria-checked update can never cause a re-click of an
   * already-selected tile (the historical "checkbox flap" that toggled
   * selections off). Returns the number of clicks performed.
   */
  private async selectVisibleCheckboxes(maxToSelect: number): Promise<number> {
    if (maxToSelect <= 0) return 0

    const deadline = Date.now() + this.config.selectionSettleMs
    let clicked = 0

    while (Date.now() < deadline && clicked < maxToSelect) {
      const remaining = maxToSelect - clicked
      const candidates = this.dom.uncheckedTiles()
        .filter(tile => shouldSelectTile(tile.label(), this.filter))
        .slice(0, remaining)
      if (candidates.length === 0) break
      for (const tile of candidates) {
        this.dom.click(tile)
      }
      clicked += candidates.length
      if (clicked >= maxToSelect) break
      await this.dom.sleep(50)
    }

    // Final settle so the counter reflects the last wave.
    await this.dom.sleep(50)
    console.log(
      `${LOG} selected ${clicked} new item(s) ` +
      `(counter: ${this.getCount()}, filter: ${JSON.stringify(this.filter)})`,
    )
    return clicked
  }

  /**
   * Attempt to scroll the gallery to expose more photos.
   * Returns true if scrolling produced any observable change.
   */
  private async tryScrollForMore(): Promise<boolean> {
    const target = this.dom.findScrollTarget()
    if (!target) {
      console.log(`${LOG} scroll: no scrollable target (gallery may be empty)`)
      return false
    }

    const measure = (): { top: number; height: number; checkboxes: number } => ({
      top: target.scrollTop,
      height: target.scrollHeight,
      checkboxes: this.dom.uncheckedTiles().length,
    })

    const before = measure()
    const step = Math.max(200, target.clientHeight || 800)
    target.scrollBy({ top: step, left: 0, behavior: 'auto' })

    const start = Date.now()
    while (Date.now() - start < this.config.scrollSettleMs) {
      await this.dom.sleep(Math.min(this.config.pollDelay, 200))
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
   * Delete the currently selected photos. Locale-aware: finds the
   * toolbar button and confirm-button via the selector pack.
   * All waits are abort-aware — Stop interrupts immediately and the
   * run resolves to 'idle', never 'error'.
   */
  private async deleteSelected(): Promise<void> {
    const count = this.getCount()
    if (count <= 0) return

    this.progress.status = 'deleting'
    this.emitProgress()
    console.log(`${LOG} deleting batch of ${count}`)

    // 1. Click the toolbar "move to trash" / "delete" button.
    const deleteBtn = await this.waitFor(
      () => this.dom.findDeleteToolbarButton(),
      this.config.actionTimeout,
      `Delete/trash button not found in toolbar after ${this.config.actionTimeout}ms. ` +
      `Make sure you're on photos.google.com with photos selected. ` +
      `If your UI language isn't supported yet, please open an issue with the ` +
      `aria-label of the delete button (right-click → inspect).`,
    )
    console.log(`${LOG} toolbar delete button found: ${describeButton(deleteBtn)}`)
    this.dom.click(deleteBtn)

    // 2. Wait for the confirmation dialog to open.
    const dialog = await this.waitFor(
      () => this.dom.findConfirmDialog(),
      this.config.actionTimeout,
      `Confirmation dialog did not appear after ${this.config.actionTimeout}ms. ` +
      `The first click may not have registered, or Google Photos changed its ` +
      `dialog markup. Try increasing pollDelay or reload the page.`,
    )

    // 3. Find and click the destructive-action button inside the dialog.
    const confirmBtn = await this.waitFor(
      () => this.dom.findConfirmButton(dialog),
      this.config.actionTimeout,
      `Confirm button not found inside the confirmation dialog after ` +
      `${this.config.actionTimeout}ms. If your UI is in an unsupported ` +
      `language, please open an issue with the dialog's button text.`,
    )
    console.log(`${LOG} confirm button found: ${describeButton(confirmBtn)}`)
    this.dom.click(confirmBtn)

    // 4. Wait for the counter to reset, meaning deletion has completed.
    try {
      await this.waitFor(
        () => this.getCount() === 0,
        this.config.actionTimeout,
        `Selected-count never returned to 0 within ${this.config.actionTimeout}ms after ` +
        `clicking confirm. Google Photos may be slow or the click did not register.`,
      )
    } catch (err) {
      if (err instanceof StopRequested) throw err
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
    console.log(`${LOG} batch deleted — total now ${this.progress.deleted}`)

    // Best-effort: scroll the photo container back to the top so the
    // next batch starts from the same anchor. Failure is non-fatal.
    const scrollTarget = this.dom.findScrollTarget()
    if (scrollTarget) {
      scrollTarget.scrollTop = 0
      console.log(`${LOG} scrolled gallery back to top for next batch`)
    }
  }

  /**
   * Abort-aware wait: polls `condition` until truthy, throws
   * {@link StopRequested} immediately when the user stops, holds while
   * paused, and throws a descriptive error on timeout.
   */
  private async waitFor<T>(
    condition: () => T | null | undefined,
    timeoutMs: number,
    what: string,
  ): Promise<NonNullable<T>> {
    const start = Date.now()
    while (true) {
      if (this.stopped) throw new StopRequested()
      const result = condition()
      if (result) return result as NonNullable<T>
      if (Date.now() - start >= timeoutMs) {
        throw new Error(`Timed out after ${timeoutMs}ms: ${what}`)
      }
      if (this.paused) {
        await this.pausePromise
      }
      await this.dom.sleep(this.config.pollDelay)
    }
  }
}
