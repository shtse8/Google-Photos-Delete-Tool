import { DEFAULT_CONFIG, type Config } from './config'
import { DeletionLog } from './deletion-log'
import type { EngineDom, PhotoTile } from './dom-adapter'
import { dateFilterTypeMatches, describeFilter, parseLabelDay, tileMatchesFilter, type PhotoFilter } from './photo-filter'

/** Dry-run counts for a date-filtered scan (browser observations, deduplicated). */
export interface DateDryRunReport {
  /** Tiles a real run with this filter would select. */
  matched: number
  /** Tiles of the chosen type whose date could not be read; a real run skips them. */
  skippedUnreadable: number
  /** Every distinct tile the scan saw. */
  total: number
}
import { diagnostics } from './diagnostics'
import type { RunStatus } from './status'
import { describeButton } from './utils'
import { StopRequested } from './run-occupancy'

export { StopRequested }

const LOG = '[gpdt]'

/** Quiet window (ms) that ends an observer-driven settle once the page has changed. */
const OBSERVED_QUIET_MS = 80

/** Upper bound on passes from the top of the gallery in one run. */
const MAX_PASSES = 20

export interface Progress {
  /** Photos actually moved to Trash. Always 0 for a dry-run scan — a preview never mutates. */
  deleted: number
  selected: number
  status: RunStatus
  startedAt: number
  error?: string
  /**
   * Distinct matching labels observed by a dry-run scan. This is a
   * deduplicated *browser observation* (Set of aria-labels seen in the
   * DOM), never a deletion count, and it is set only by the dry-run
   * path. `deleted` stays 0 while `total` carries the observation.
   */
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
 * Dry-run takes a separate path (runDryRunScan) — see that method. It
 * scrolls and counts observed matching labels, reports the deduplicated
 * count as progress.total (a browser observation), and never reports it
 * as progress.deleted — a preview mutates nothing.
 *
 * Stop is abort-aware: every wait yields to `stop()`, and a stopped run
 * resolves with status 'idle', NEVER 'error'. The `finally` block flushes
 * whatever selection remains (unless stopped or errored), so the last
 * partial batch is always deleted (or counted, in dry-run).
 *
 * A run that clicked checkboxes without the page ever reporting a
 * selected photo resolves with status 'error' (selection drift), never
 * with 'done' — the tool cannot claim success it did not observe.
 */
export class DeleteEngine {
  private readonly config: Config
  private readonly dom: EngineDom
  private readonly filter: PhotoFilter
  /** Target ids for an id filter (duplicate review); null otherwise. */
  private readonly targetIds: ReadonlySet<string> | null
  /** Target ids clicked so far in this run. */
  private readonly clickedIds = new Set<string>()
  /** Identity (`id`, else label) of every photo confirmed into Trash this run; never clicked again. */
  private readonly trashedKeys = new Set<string>()
  /** Matching tiles skipped in the current pass because their key is in `trashedKeys`. */
  private passSkippedTrashed = new Set<string>()
  private readonly onProgress?: (progress: Progress) => void

  private progress: Progress
  private stopped = false
  private paused = false
  private pausePromise: Promise<void> | null = null
  private pauseResolve: (() => void) | null = null

  private counterFallbackUsed = false
  private flapRecoveries = 0
  private dryRunLabelsArr: string[] = []
  private readonly dryObserved = new Set<string>()
  private readonly dryUnreadable = new Set<string>()
  /** Checkbox clicks this run performed (drift evidence). */
  private clickedTiles = 0
  /** True once a run observed at least one selected photo. */
  private selectionObserved = false

  /** Deletion log for rate tracking. */
  readonly log = new DeletionLog()

  /**
   * Labels observed by the last dry-run scan (deduplicated browser
   * observations, for Pro CSV export). Empty for real-delete runs and
   * before any dry-run completes.
   */
  getDryRunLabels(): readonly string[] {
    return this.dryRunLabelsArr
  }

  /** Matched / skipped-unreadable / total of the last dry run; null unless a date filter is active. */
  getDateReport(): DateDryRunReport | null {
    if (this.filter.kind !== 'date') return null
    return {
      matched: this.dryRunLabelsArr.length,
      skippedUnreadable: this.dryUnreadable.size,
      total: this.dryObserved.size,
    }
  }

  constructor(options: EngineOptions) {
    this.dom = options.dom
    this.config = { ...DEFAULT_CONFIG, ...options.config }
    this.filter = options.filter ?? { kind: 'all' }
    this.targetIds = this.filter.kind === 'ids' ? new Set(this.filter.ids) : null
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
    this.clickedTiles = 0
    this.selectionObserved = false

    // Fail closed on a non-positive / non-finite batch limit. The batch
    // contract is a *positive* limit (`config.ts`: "Must be > 0"), and a
    // maxCount <= 0 would make every iteration satisfy
    // `currentCount >= maxCount` and flush a no-op "batch" forever — a
    // busy loop that never reaches scroll settle or end-of-list
    // detection. An invalid limit is a configuration error, never a
    // destructive run.
    if (!Number.isFinite(this.config.maxCount) || this.config.maxCount < 1) {
      this.progress = {
        deleted: 0,
        selected: 0,
        status: 'error',
        startedAt: Date.now(),
        error:
          `Invalid batch limit: maxCount must be a positive integer ` +
          `(got ${String(this.config.maxCount)}).`,
      }
      this.emitProgress()
      diagnostics.setEngine({
        status: 'error',
        error: this.progress.error,
        deleted: 0,
        selected: 0,
        counterFallbackUsed: false,
        flapRecoveries: 0,
      })
      return this.progress
    }

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
      `maxCount=${effectiveMax} filter=${describeFilter(this.filter)}`,
    )

    try {
      // An id run looks for specific items anywhere in the view, so it
      // starts from the top like a dry run.
      if (this.targetIds) {
        const top = this.dom.findScrollTarget()
        if (top) {
          top.scrollTo({ top: 0, left: 0, behavior: 'auto' })
          await this.sleepControlled(this.config.scrollSettleMs)
        }
      }

      // A run is a series of passes from the top of the gallery. It reports
      // done only after a full pass that deleted nothing: the final flush of
      // one pass counts as a batch, and Google can re-render rows after it.
      for (let pass = 0; ; pass++) {
      if (pass >= MAX_PASSES) {
        throw new Error(`Stopped after ${MAX_PASSES} passes over the gallery with photos still left; check the page and run again.`)
      }
      const deletedAtPassStart = this.progress.deleted
      const trashedAtPassStart = this.trashedKeys.size
      this.passSkippedTrashed = new Set()
      consecutiveNoProgress = 0
      if (pass > 0) await this.returnToTop()
      while (!this.stopped) {
        await this.awaitControl()

        // Phase 1: select what's visible (up to the effective batch cap).
        const beforeCount = this.getCount()
        const remainingCapacity = effectiveMax - beforeCount
        const clicked = await this.selectVisibleCheckboxes(remainingCapacity)
        const currentCount = this.getCount()
        const counterGain = currentCount - beforeCount
        // Drift evidence for the run: how many checkboxes we clicked and
        // whether the page ever admitted that any of them is selected.
        this.clickedTiles += clicked
        if (beforeCount > 0 || currentCount > 0) this.selectionObserved = true
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

        // Every chosen item is selected: no need to scroll further. The
        // final flush below moves the last batch to Trash.
        if (this.targetIds && this.clickedIds.size >= this.targetIds.size) {
          console.log(`${LOG} all ${this.targetIds.size} chosen item(s) selected; flushing`)
          break
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
          await this.sleepControlled(this.config.pollDelay)
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
      // End of pass: flush the last partial batch as a regular batch, then
      // go again from the top while passes keep deleting. An id run selects
      // exactly its chosen items and needs no second pass.
      if (this.stopped || this.targetIds) break
      if (this.getCount() > 0) await this.deleteSelected()
      const passDeleted = this.progress.deleted - deletedAtPassStart
      if (passDeleted === 0) {
        // Nothing new was deleted, and this pass scanned the whole gallery
        // from the top. A matching tile it skipped because its key was
        // already trashed is either a photo the page did not remove or a
        // different photo that cannot be told apart from one (same label, no
        // id): fail closed instead of reporting done.
        if (this.passSkippedTrashed.size > 0) {
          throw new Error(
            `${this.passSkippedTrashed.size} photo(s) already moved to Trash, or that cannot be told apart from them, ` +
            `are still in the gallery; run again.`,
          )
        }
        break
      }
      // Every pass must delete at least one photo not deleted before.
      if (this.trashedKeys.size === trashedAtPassStart) {
        throw new Error('A pass deleted photos that could not be told apart from earlier ones; stopping instead of looping.')
      }
      console.log(`${LOG} pass ${pass + 1} deleted ${passDeleted}; scanning again from the top`)
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

      // Selection drift fails closed. A run that clicked photo checkboxes
      // and never saw a single one reported as selected deleted nothing:
      // either Google Photos changed under the selector pack, or this
      // surface does not allow selection. Answering `done` would be a
      // false success for a destructive tool, so say what was observed
      // and let the diagnostic report carry the evidence.
      if (
        this.progress.status === 'done' &&
        this.progress.deleted === 0 &&
        this.clickedTiles > 0 &&
        !this.selectionObserved
      ) {
        this.progress.status = 'error'
        this.progress.error =
          `Clicked ${this.clickedTiles} photo checkbox(es) but Google Photos never ` +
          `showed any of them as selected, so nothing was deleted. The page may ` +
          `have changed — use Report issue to send the details.`
        console.warn(`${LOG} ${this.progress.error}`)
      }

      this.emitProgress()

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
   * The tally is a browser observation: progress.deleted stays 0 for the
   * whole scan and the deduplicated Set size is surfaced as
   * progress.total. Stop resolves to 'idle' and the scan never calls a
   * destructive path, so a stopped dry-run can never become a delete.
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
      `filter=${describeFilter(this.filter)}`,
    )

    const seen = new Set<string>()
    this.dryRunLabelsArr = []
    this.dryObserved.clear()
    this.dryUnreadable.clear()
    let consecutiveNoProgress = 0
    let consecutiveEmptyWindows = 0
    let missingIdWarned = false

    this.progress.status = 'scrolling'
    this.emitProgress()

    try {
      // Start from the top — running a dry-run from mid-gallery would
      // skip everything above the viewport otherwise. The settle wait
      // is inside the try so a user stop still resolves idle.
      const target = this.dom.findScrollTarget()
      if (target) {
        target.scrollTo({ top: 0, left: 0, behavior: 'auto' })
        await this.sleepControlled(this.config.scrollSettleMs)
      }

      // Initial harvest at the top before we touch the scroll target.
      // The deduplicated Set size is a browser observation → progress.total.
      // progress.deleted stays 0: nothing has been (or will be) deleted.
      this.harvestVisibleIds(seen, (warned) => { missingIdWarned = warned })
      this.progress.total = seen.size
      this.emitProgress()

      while (!this.stopped) {
        await this.awaitControl()

        const before = seen.size
        const heightBefore = target?.scrollHeight ?? 0
        const scrolled = await this.scrollAndHarvest(seen, (warned) => {
          if (warned) missingIdWarned = true
        })
        const gained = seen.size - before
        const heightGrew = target ? target.scrollHeight > heightBefore : false

        this.progress.total = seen.size
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
          await this.sleepControlled(this.config.pollDelay)
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
      // Report the observation, never a deletion count.
      this.progress.deleted = 0
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
    let remaining = 2000
    while (remaining > 0) {
      await this.awaitControl()
      await this.dom.sleep(pollMs)
      await this.awaitControl()
      remaining -= pollMs
      this.harvestVisibleIds(seen, onWarn)
    }
    if (seen.size > beforeSize) {
      console.log(`${LOG} [dry-run] final settle picked up ${seen.size - beforeSize} more`)
      this.progress.total = seen.size
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
      if (this.targetIds) {
        // Id run preview: count the chosen items that are present.
        const id = tile.id?.() ?? null
        if (id && this.targetIds.has(id)) seen.add(id)
        continue
      }
      const label = tile.label()
      if (!label) {
        onWarn(true)
        continue
      }
      if (this.filter.kind === 'date') {
        const key = tile.id?.() ?? label
        this.dryObserved.add(key)
        if (dateFilterTypeMatches(label, this.filter) && parseLabelDay(label) === null) {
          this.dryUnreadable.add(key)
        }
      }
      if (!tileMatchesFilter(tile, this.filter)) continue
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
    // Pause does not burn the settle budget — it holds the scan.
    const pollMs = Math.min(this.config.pollDelay, 200)
    let remaining = this.config.scrollSettleMs
    const sizeBefore = seen.size
    // Observer-driven early exit: only when the scroll position advanced and
    // the page then changed and went quiet. Anything else (no movement, no
    // change: possibly the end of the list) waits the full settle ceiling.
    if (this.dom.waitForDomQuiet && target.scrollTop > beforeTop) {
      await this.awaitControl()
      const startedAt = Date.now()
      const quiet = await this.dom.waitForDomQuiet(remaining, OBSERVED_QUIET_MS)
      await this.awaitControl()
      this.harvestVisibleIds(seen, onWarn)
      // Stop waiting only when the page settled AND the harvest actually grew:
      // an unrelated mutation on a busy page settles before the rows render.
      remaining = quiet && seen.size > sizeBefore ? 0 : remaining - Math.max(1, Date.now() - startedAt)
    }
    while (remaining > 0) {
      await this.awaitControl()
      await this.dom.sleep(pollMs)
      await this.awaitControl()
      remaining -= pollMs
      this.harvestVisibleIds(seen, onWarn)
    }
    await this.awaitControl()
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

  /**
   * Yield to pause/stop. Stop throws {@link StopRequested} so the run
   * resolves idle; pause holds until resume continues this same engine.
   */
  private async awaitControl(): Promise<void> {
    if (this.stopped) throw new StopRequested()
    if (this.pausePromise) {
      await this.pausePromise
    }
    if (this.stopped) throw new StopRequested()
  }

  /** Sleep that still yields to pause/stop before and after. */
  private async sleepControlled(ms: number): Promise<void> {
    await this.awaitControl()
    await this.dom.sleep(ms)
    await this.awaitControl()
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
  private keyOf(tile: PhotoTile): string | null {
    return tile.id?.() ?? tile.label()
  }

  private async selectVisibleCheckboxes(maxToSelect: number): Promise<number> {
    if (maxToSelect <= 0) return 0

    // Budget is wave-settle time, not wall-clock: pause must not eat it.
    let settleRemaining = this.config.selectionSettleMs
    let clicked = 0

    while (settleRemaining > 0 && clicked < maxToSelect) {
      await this.awaitControl()
      const remaining = maxToSelect - clicked
      const candidates = this.dom.uncheckedTiles()
        .filter(tile => tileMatchesFilter(tile, this.filter, this.targetIds ?? undefined))
        .filter(tile => {
          const k = this.keyOf(tile)
          if (k === null || !this.trashedKeys.has(k)) return true
          this.passSkippedTrashed.add(k)
          return false
        })
        .slice(0, remaining)
      if (candidates.length === 0) break
      for (const tile of candidates) {
        this.dom.click(tile)
        if (this.targetIds) {
          const id = tile.id?.()
          if (id) this.clickedIds.add(id)
        }
      }
      clicked += candidates.length
      if (clicked >= maxToSelect) break
      await this.dom.sleep(50)
      await this.awaitControl()
      settleRemaining -= 50
    }

    // Final settle so the counter reflects the last wave.
    await this.awaitControl()
    await this.dom.sleep(50)
    await this.awaitControl()
    console.log(
      `${LOG} selected ${clicked} new item(s) ` +
      `(counter: ${this.getCount()}, filter: ${describeFilter(this.filter)})`,
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

    // Progress means new tiles actually appeared, never just a scroll
    // position that moved while the grid is still rendering.
    const keyOf = (tile: PhotoTile): string | null => this.keyOf(tile)
    const snapshot = (): { top: number; height: number; keys: Set<string>; anonymous: boolean; count: number } => {
      const tiles = this.dom.uncheckedTiles()
      const keys = new Set<string>()
      let anonymous = false
      for (const tile of tiles) {
        const key = keyOf(tile)
        if (key === null) anonymous = true
        else keys.add(key)
      }
      return { top: target.scrollTop, height: target.scrollHeight, keys, anonymous, count: tiles.length }
    }

    await this.awaitControl()

    const before = snapshot()
    const step = Math.max(200, target.clientHeight || 800)
    target.scrollBy({ top: step, left: 0, behavior: 'auto' })

    let settleRemaining = this.config.scrollSettleMs
    while (settleRemaining > 0) {
      await this.awaitControl()
      settleRemaining -= await this.pollWait(Math.min(this.config.pollDelay, 200), OBSERVED_QUIET_MS)
      await this.awaitControl()
      const after = snapshot()
      let newTiles = false
      for (const key of after.keys) if (!before.keys.has(key)) { newTiles = true; break }
      // Tiles whose identity cannot be read fall back to the count.
      if (!newTiles && (before.anonymous || after.anonymous) && after.count > before.count) newTiles = true
      if (newTiles) {
        console.log(
          `${LOG} scroll progress: top ${before.top}→${after.top}, ` +
          `height ${before.height}→${after.height}, ` +
          `unchecked ${before.count}→${after.count}`,
        )
        return true
      }
    }

    console.log(
      `${LOG} scroll yielded no new content (top=${before.top} of ${before.height}, ` +
      `unchecked=${before.count})`,
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

    // Identity of what this batch trashes, read before any click.
    const batchKeys = this.dom.checkedTiles().map((t) => this.keyOf(t)).filter((k): k is string => k !== null)

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

    for (const k of batchKeys) this.trashedKeys.add(k)
    this.progress.deleted += count
    this.progress.selected = 0
    this.log.record(count)
    this.emitProgress()
    console.log(`${LOG} batch deleted — total now ${this.progress.deleted}`)

    // Best-effort: scroll the photo container back to the top so the
    // next batch starts from the same anchor. Failure is non-fatal.
    await this.returnToTop()
    await this.waitForTrashedToLeave()
  }

  /**
   * Google Photos removes trashed tiles from the grid a moment after the
   * selection clears. Wait (ceiling: the scroll settle time) until no tile of
   * the batch is still rendered, so the next scan does not mistake that lag
   * for a photo the page refused to remove. Tiles that really stay are still
   * caught by the fail-closed check at the end of a pass.
   */
  private async waitForTrashedToLeave(): Promise<void> {
    let remaining = this.config.scrollSettleMs
    while (remaining > 0) {
      await this.awaitControl()
      const lingering = [...this.dom.uncheckedTiles(), ...this.dom.checkedTiles()].some((tile) => {
        const k = this.keyOf(tile)
        return k !== null && this.trashedKeys.has(k)
      })
      if (!lingering) return
      remaining -= await this.pollWait(Math.min(this.config.pollDelay, 200), 0)
    }
  }

  /**
   * Scroll the gallery to the top and wait until tiles are on screen again
   * (ceiling: the scroll settle time). The grid re-renders the top rows after
   * the reset and a selection pass that starts before they exist skips them.
   */
  private async returnToTop(): Promise<void> {
    const scrollTarget = this.dom.findScrollTarget()
    if (!scrollTarget) return
    scrollTarget.scrollTop = 0
    console.log(`${LOG} scrolled gallery back to top`)
    let remaining = this.config.scrollSettleMs
    while (remaining > 0) {
      await this.awaitControl()
      const ready =
        this.dom.uncheckedTiles().some((tile) => {
          const k = this.keyOf(tile)
          return tileMatchesFilter(tile, this.filter, this.targetIds ?? undefined) && (k === null || !this.trashedKeys.has(k))
        }) ||
        this.dom.checkedTiles().length > 0
      if (ready) return
      remaining -= await this.pollWait(Math.min(this.config.pollDelay, 200), 0)
    }
  }

  /**
   * One poll wait. Observer-driven when the adapter supports it (returns
   * the time actually spent, `ms` is the ceiling), otherwise a fixed sleep.
   */
  private async pollWait(ms: number, quietMs: number): Promise<number> {
    if (this.dom.waitForDomQuiet) {
      const startedAt = Date.now()
      await this.dom.waitForDomQuiet(ms, quietMs)
      return Math.max(1, Date.now() - startedAt)
    }
    await this.dom.sleep(ms)
    return ms
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
    let remaining = timeoutMs
    while (true) {
      await this.awaitControl()
      const result = condition()
      if (result) return result as NonNullable<T>
      if (remaining <= 0) {
        throw new Error(`Timed out after ${timeoutMs}ms: ${what}`)
      }
      // Wake on the next page change instead of the fixed poll; the poll
      // interval stays the ceiling per wait and the timeout is wall-clock.
      remaining -= await this.pollWait(this.config.pollDelay, 0)
      await this.awaitControl()
    }
  }
}
