import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DeleteEngine, StopRequested } from '../src/core/delete-engine'
import type { ClickTarget, EngineDom, PhotoTile, ScrollTarget } from '../src/core/dom-adapter'
import type { RunStatus } from '../src/core/status'
import { diagnostics } from '../src/core/diagnostics'

/**
 * Full-loop engine tests on a scripted DOM fake.
 *
 * The whole point of the DOM-adapter refactor: the complete run loop
 * (select → cap-flush → scroll → end-of-list → flush-last →
 * stop/pause/error) is now testable without a browser. Every test below
 * drives a deterministic fake that behaves like Google Photos within the
 * rules we model (selection counter cap, lazy scroll, confirm dialog).
 */

class FakeTile {
  checked = false
  constructor(readonly label: string) {}
}

interface FakeScrollState {
  top: number
  height: number
  client: number
}

class FakeDom implements EngineDom {
  pathname = '/'
  tiles: FakeTile[] = []
  cap = Number.MAX_SAFE_INTEGER
  /** When true, the counter element is absent from the DOM. */
  counterMissing = false
  /** When set, overrides the counter text verbatim. */
  counterOverride: string | null = null
  /** Counter hook — scripted value; wins over everything when set. */
  counterHook: ((checked: number) => number | null) | null = null
  /** Scripted counter reads, consumed in order; falls back to computed. */
  counterScript: (string | null)[] = []
  dialogOpen = false
  dialogHasConfirm = true
  manualSleep = false
  clicks: string[] = []
  scrollState: FakeScrollState = { top: 0, height: 1200, client: 800 }
  private sleepResolvers: (() => void)[] = []

  setTiles(labels: string[], checked = false): void {
    this.tiles = labels.map((label) => {
      const t = new FakeTile(label)
      t.checked = checked
      return t
    })
  }

  selectedCount(): number {
    return this.tiles.filter((t) => t.checked).length
  }

  private counterValue(): number {
    return Math.min(this.selectedCount(), this.cap)
  }

  reads: (string | null)[] = []
  counterText(): string | null {
    let v: string | null
    if (this.counterScript.length > 0) {
      v = this.counterScript.shift()!
    } else if (this.counterHook) {
      const hv = this.counterHook(this.selectedCount())
      v = hv === null ? null : String(hv)
    } else if (this.counterMissing) {
      v = null
    } else if (this.counterOverride !== null) {
      v = this.counterOverride
    } else {
      const c = this.counterValue()
      v = c > 0 ? String(c) : '0'
    }
    this.reads.push(v)
    return v
  }

  private wrap(t: FakeTile): PhotoTile {
    return {
      click: () => this.clickTile(t),
      label: () => t.label,
    }
  }

  uncheckedTiles(): PhotoTile[] {
    return this.tiles.filter((t) => !t.checked).map((t) => this.wrap(t))
  }

  checkedTiles(): PhotoTile[] {
    return this.tiles.filter((t) => t.checked).map((t) => this.wrap(t))
  }

  private deleteBtn: ClickTarget = {
    click: () => {
      this.dialogOpen = true
      this.clicks.push('delete')
    },
  }
  private confirmBtn: ClickTarget = {
    click: () => {
      this.clicks.push('confirm')
      // Deletion REMOVES the checked photos from the gallery DOM.
      this.tiles = this.tiles.filter((t) => !t.checked)
      this.dialogOpen = false
    },
  }

  findDeleteToolbarButton(): ClickTarget | null {
    return this.selectedCount() > 0 ? this.deleteBtn : null
  }

  findConfirmDialog(): ClickTarget | null {
    return this.dialogOpen ? { click: () => undefined } : null
  }

  findConfirmButton(_dialog: ClickTarget): ClickTarget | null {
    return this.dialogOpen && this.dialogHasConfirm ? this.confirmBtn : null
  }

  findScrollTarget(): ScrollTarget | null {
    if (this.scrollState.height > this.scrollState.client) {
      const s = this.scrollState
      return {
        get scrollTop() { return s.top },
        get scrollHeight() { return s.height },
        get clientHeight() { return s.client },
        scrollBy: () => {
          if (s.top < s.height - s.client) s.top += s.client
        },
        scrollTo: (opts) => { s.top = opts.top },
        set scrollTop(v: number) { s.top = v },
      }
    }
    return null
  }

  click(target: ClickTarget): void {
    target.click()
  }

  private clickTile(t: FakeTile): void {
    t.checked = !t.checked
    this.clicks.push(`tile:${t.label}`)
  }

  async sleep(_ms: number): Promise<void> {
    if (!this.manualSleep) return
    await new Promise<void>((resolve) => {
      this.sleepResolvers.push(resolve)
    })
  }

  releaseSleep(): void {
    for (const r of this.sleepResolvers.splice(0)) r()
  }
}

const FAST_CONFIG = {
  maxCount: 500,
  pollDelay: 1,
  actionTimeout: 5000,
  endOfListAttempts: 2,
  scrollSettleMs: 1,
  selectionSettleMs: 1,
}

const makeEngine = (
  dom: FakeDom,
  overrides: Record<string, unknown> = {},
  filter?: { kind: 'all' } | { kind: 'type'; type: string },
) => {
  const onProgress = vi.fn()
  const engine = new DeleteEngine({
    dom: dom as unknown as EngineDom,
    config: { ...FAST_CONFIG, ...overrides } as never,
    filter: filter as never,
    onProgress,
  })
  return { engine, onProgress }
}

const statusesOf = (onProgress: ReturnType<typeof vi.fn>): RunStatus[] =>
  onProgress.mock.calls.map((c) => (c[0] as { status: RunStatus }).status)

beforeEach(() => {
  diagnostics.reset()
})

describe('DeleteEngine — single-batch delete', () => {
  it('selects, deletes, and flushes a full batch to done', async () => {
    const dom = new FakeDom()
    dom.setTiles(['Photo - a', 'Photo - b', 'Photo - c'])
    const { engine, onProgress } = makeEngine(dom, { maxCount: 3 })

    const result = await engine.run()

    expect(result.status).toBe('done')
    expect(result.deleted).toBe(3)
    expect(dom.clicks).toContain('delete')
    expect(dom.clicks).toContain('confirm')
    // All tiles were selected then removed.
    expect(dom.tiles.every((t) => !t.checked)).toBe(true)
    expect(statusesOf(onProgress)).toContain('deleting')
    expect(statusesOf(onProgress)).toContain('done')
  })

  it('does nothing and reports done when the gallery is empty', async () => {
    const dom = new FakeDom()
    dom.setTiles([])
    const { engine } = makeEngine(dom)

    const result = await engine.run()

    expect(result.status).toBe('done')
    expect(result.deleted).toBe(0)
    expect(dom.clicks.filter((c) => c === 'confirm')).toHaveLength(0)
  })
})

describe('DeleteEngine — Google selection cap flush', () => {
  it('flushes when the counter plateaus at the cap, then deletes the remainder', async () => {
    const dom = new FakeDom()
    dom.cap = 500
    const labels = Array.from({ length: 600 }, (_, i) => `Photo - tile ${i}`)
    dom.setTiles(labels)
    const { engine } = makeEngine(dom, { maxCount: 500 })

    const result = await engine.run()

    expect(result.status).toBe('done')
    expect(result.deleted).toBe(600)
    // Two delete batches: the 500-cap flush plus the 100 remainder.
    const deletes = dom.clicks.filter((c) => c === 'delete')
    expect(deletes).toHaveLength(2)
  })
})

describe('DeleteEngine — end-of-list detection + final flush', () => {
  it('flushes the last partial batch after no-progress detection', async () => {
    const dom = new FakeDom()
    dom.setTiles(['Photo - a', 'Photo - b'])
    const { engine } = makeEngine(dom, { maxCount: 500 })

    const result = await engine.run()

    expect(result.status).toBe('done')
    expect(result.deleted).toBe(2)
    expect(dom.clicks.filter((c) => c === 'confirm')).toHaveLength(1)
  })
})

describe('DeleteEngine — abort-aware stop', () => {
  it('stop() during a delete wait resolves to idle, never error', async () => {
    const dom = new FakeDom()
    dom.manualSleep = true
    dom.setTiles(['Photo - a', 'Photo - b', 'Photo - c'])
    // Confirm button never appears → waitFor(confirm) holds on sleep.
    dom.dialogHasConfirm = false
    const { engine } = makeEngine(dom, { maxCount: 3, actionTimeout: 60_000 })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const runPromise = engine.run()
    // Let the run reach the held sleep inside waitFor(confirm).
    await new Promise((r) => setTimeout(r, 5))
    engine.stop()
    dom.releaseSleep()

    const result = await runPromise

    expect(result.status).toBe('idle')
    expect(result.error).toBeUndefined()
    errorSpy.mockRestore()
  })

  it('run() resets a previous stop so the engine can be started again', async () => {
    const dom = new FakeDom()
    dom.setTiles(['Photo - a'])
    const { engine } = makeEngine(dom)
    engine.stop()

    // `run()` clears the stop flag by design: a stop is run-scoped, and
    // starting again after a stop must be possible.
    const result = await engine.run()
    expect(result.status).toBe('done')
    expect(result.deleted).toBe(1)
  })

  it('StopRequested is exported and identifies user stops', () => {
    const e = new StopRequested()
    expect(e.name).toBe('StopRequested')
    expect(e.message).toBe('stop requested')
  })
})

describe('DeleteEngine — pause / resume', () => {
  it('pauses mid-run, reports paused status, and resumes to done', async () => {
    const dom = new FakeDom()
    dom.manualSleep = true
    dom.setTiles(['Photo - a', 'Photo - b', 'Photo - c'])
    const { engine, onProgress } = makeEngine(dom, { maxCount: 3 })

    const runPromise = engine.run()
    // Let the run reach the held sleep inside selectVisibleCheckboxes.
    await new Promise((r) => setTimeout(r, 5))

    engine.pause()
    expect(engine.isPaused).toBe(true)
    dom.releaseSleep()
    // The loop reaches checkPause() and holds on the pause promise.
    await new Promise((r) => setTimeout(r, 5))
    expect(statusesOf(onProgress)).toContain('paused')

    engine.resume()
    expect(engine.isPaused).toBe(false)

    // Pump manual sleeps until the run completes on its own.
    const pump = setInterval(() => dom.releaseSleep(), 1)
    try {
      const result = await runPromise
      expect(result.status).toBe('done')
      expect(result.deleted).toBe(3)
    } finally {
      clearInterval(pump)
    }
  })
})

describe('DeleteEngine — checkbox flap & counter fallback', () => {
  it('records a flap recovery when the counter regresses, and still completes', async () => {
    const dom = new FakeDom()
    dom.setTiles(['Photo - a', 'Photo - b', 'Photo - c', 'Photo - d', 'Photo - e'])
    // Script the reads: iteration 1 reads 0,5,5. Iteration 2 reads
    // before=5 but current=4 (the stale-counter regression). Everything
    // after falls back to the computed value.
    dom.counterScript = ['0', '5', '5', '5', '5', '4']
    const { engine } = makeEngine(dom, { maxCount: 500 })

    const result = await engine.run()
    expect(result.status).toBe('done')
    // The flush re-reads the counter (computed value) and deletes what it
    // sees; the important assertion is that the regression was recorded
    // and the run completed instead of corrupting the selection.
    expect(result.deleted).toBe(5)
    expect(diagnostics.blob().engine?.flapRecoveries).toBeGreaterThanOrEqual(1)
  })

  it('falls back to the rendered checked-tile count when the counter element is missing', async () => {
    const dom = new FakeDom()
    dom.counterMissing = true
    dom.setTiles(['Photo - a', 'Photo - b', 'Photo - c'])
    const { engine } = makeEngine(dom, { maxCount: 500 })

    const result = await engine.run()
    expect(result.status).toBe('done')
    expect(result.deleted).toBe(3)
    const snapshot = diagnostics.blob().engine
    expect(snapshot?.counterFallbackUsed).toBe(true)
  })
})

describe('DeleteEngine — type filter', () => {
  it('selects and deletes only matching tiles', async () => {
    const dom = new FakeDom()
    dom.setTiles(['Screenshot - shot', 'Video - clip', 'Photo - pic'])
    const { engine } = makeEngine(dom, { maxCount: 500 }, { kind: 'type', type: 'screenshot' })

    const result = await engine.run()
    expect(result.status).toBe('done')
    expect(result.deleted).toBe(1)
    // Only the screenshot tile was clicked.
    expect(dom.clicks).toContain('tile:Screenshot - shot')
    expect(dom.clicks).not.toContain('tile:Video - clip')
    expect(dom.clicks).not.toContain('tile:Photo - pic')
  })
})

describe('DeleteEngine — dry-run scan', () => {
  it('counts unique labels as browser observations, never clicks, reports total', async () => {
    const dom = new FakeDom()
    dom.setTiles(['Photo - a', 'Photo - b', 'Photo - c'])
    const { engine, onProgress } = makeEngine(dom, { maxCount: 500, dryRun: true })

    const result = await engine.run()

    expect(result.status).toBe('done')
    // The deduplicated label count is an observation (total), not a deletion.
    expect(result.total).toBe(3)
    expect(result.deleted).toBe(0)
    expect(dom.clicks.filter((c) => c === 'confirm')).toHaveLength(0)
    expect(dom.clicks.some((c) => c.startsWith('tile:'))).toBe(false)
    expect(engine.getDryRunLabels()).toHaveLength(3)
    expect(statusesOf(onProgress)).toContain('done')
    // Every live progress emission during the scan keeps deleted at 0 and
    // carries the observed count as total — never the reverse.
    for (const [snapshot] of onProgress.mock.calls) {
      expect(snapshot.deleted).toBe(0)
      if (snapshot.total !== undefined) {
        expect(snapshot.total).toBeGreaterThanOrEqual(snapshot.deleted)
      }
    }
  })

  it('dry-run with a type filter counts only matching labels as observations', async () => {
    const dom = new FakeDom()
    dom.setTiles(['Screenshot - shot', 'Video - clip', 'Photo - pic'])
    const { engine } = makeEngine(dom, { maxCount: 500, dryRun: true }, { kind: 'type', type: 'screenshot' })

    const result = await engine.run()
    expect(result.status).toBe('done')
    expect(result.total).toBe(1)
    expect(result.deleted).toBe(0)
  })

  it('deduplicates identical labels (burst-mode undercount is expected)', async () => {
    const dom = new FakeDom()
    dom.setTiles(['Photo - burst', 'Photo - burst', 'Photo - burst'])
    const { engine } = makeEngine(dom, { maxCount: 500, dryRun: true })

    const result = await engine.run()
    expect(result.total).toBe(1)
    expect(result.deleted).toBe(0)
  })

  it('stopping a dry-run resolves to idle, never deletes, and keeps the observation', async () => {
    const dom = new FakeDom()
    dom.manualSleep = true
    dom.setTiles(['Photo - a', 'Photo - b', 'Photo - c'])
    const { engine } = makeEngine(dom, { maxCount: 500, dryRun: true })

    const runPromise = engine.run()
    await new Promise((r) => setTimeout(r, 5))
    engine.stop()
    dom.releaseSleep()

    const result = await runPromise

    // A stopped dry-run is idle (never error), mutated nothing, and its
    // observed count is reported as total — it cannot become a delete.
    expect(result.status).toBe('idle')
    expect(result.error).toBeUndefined()
    expect(result.deleted).toBe(0)
    expect(dom.clicks.filter((c) => c === 'confirm')).toHaveLength(0)
    expect(dom.clicks.some((c) => c.startsWith('tile:'))).toBe(false)
    expect(engine.getDryRunLabels().length).toBeLessThanOrEqual(3)
  })
})

describe('DeleteEngine — error paths', () => {
  it('reports error when the toolbar delete button never appears', async () => {
    const dom = new FakeDom()
    dom.setTiles(['Photo - a', 'Photo - b', 'Photo - c'])
    // No delete button ever appears even with a selection.
    const engine = new DeleteEngine({
      dom: Object.assign(dom, {
        findDeleteToolbarButton: () => null,
      }) as unknown as EngineDom,
      config: { ...FAST_CONFIG, maxCount: 3, actionTimeout: 30 } as never,
    })

    const result = await engine.run()
    expect(result.status).toBe('error')
    expect(result.error).toMatch(/not found/)
  })

  it('reports error status when the delete flow fails', async () => {
    const dom = new FakeDom()
    dom.setTiles(['Photo - a'])
    const engine = new DeleteEngine({
      dom: Object.assign(dom, { findDeleteToolbarButton: () => null }) as unknown as EngineDom,
      config: { ...FAST_CONFIG, maxCount: 1, actionTimeout: 30 } as never,
    })

    const result = await engine.run()
    expect(result.status).toBe('error')
    expect(typeof result.error).toBe('string')
  })
})
