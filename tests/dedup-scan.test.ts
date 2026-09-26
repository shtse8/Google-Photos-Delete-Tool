/**
 * The duplicate scan loop on a scripted grid: scroll from the top, read
 * tiles as the grid lazy-loads them, hash in parallel, stop at the end of
 * the view, and cancel cleanly.
 */
import { describe, it, expect } from 'vitest'
import { parseLabelDate, scanView, type GridTile, type ScanDeps } from '../src/core/dedup/scan'
import type { ScrollTarget } from '../src/core/dom-adapter'

/** A virtualized grid: rows of `perRow` tiles, `visibleRows` rendered around the scroll position. */
class FakeGrid implements ScanDeps {
  top = 500
  readonly rowHeight = 100
  readonly client = 400
  inFlight = 0
  maxInFlight = 0
  fetched: string[] = []
  constructor(readonly tiles: GridTile[], readonly perRow = 4, readonly unreadable = new Set<string>()) {}

  get height(): number {
    return Math.ceil(this.tiles.length / this.perRow) * this.rowHeight
  }

  harvest(): GridTile[] {
    const first = Math.max(0, Math.floor(this.top / this.rowHeight) - 1) * this.perRow
    const last = Math.ceil((this.top + this.client) / this.rowHeight + 1) * this.perRow
    return this.tiles.slice(first, last)
  }

  findScrollTarget(): ScrollTarget | null {
    const grid = this
    return {
      get scrollTop() { return grid.top },
      set scrollTop(v: number) { grid.top = v },
      get scrollHeight() { return grid.height },
      get clientHeight() { return grid.client },
      scrollBy: (o) => { grid.top = Math.min(Math.max(0, grid.height - grid.client), grid.top + o.top) },
      scrollTo: (o) => { grid.top = o.top },
    }
  }

  async hashThumb(url: string): Promise<Uint8Array | null> {
    this.inFlight++
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight)
    this.fetched.push(url)
    await new Promise((r) => setTimeout(r, 0))
    this.inFlight--
    if (this.unreadable.has(url)) return null
    const n = Number(url.split('/').pop())
    return new Uint8Array([n & 255, n >> 8, 0, 0, 0, 0, 0, 0])
  }

  async sleep(): Promise<void> {
    await new Promise((r) => setTimeout(r, 0))
  }
}

const makeTiles = (n: number): GridTile[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `AF1Qip${String(i).padStart(4, '0')}`,
    label: `Photo - Landscape - Mar ${(i % 28) + 1}, 2024, 10:22:13 AM`,
    thumbUrl: `https://lh3.googleusercontent.com/pw/${i}`,
  }))

describe('scanView', () => {
  it('reads every tile once from the top, in view order, and hashes each', async () => {
    const grid = new FakeGrid(makeTiles(203))
    const phases: string[] = []
    const result = await scanView(grid, { pollMs: 1, scrollSettleMs: 5, concurrency: 4, onProgress: (p) => phases.push(p.phase) })
    expect(result.cancelled).toBe(false)
    expect(result.found).toBe(203)
    expect(result.items).toHaveLength(203)
    expect(result.items.map((i) => i.order)).toEqual([...Array(203).keys()])
    expect(new Set(grid.fetched).size).toBe(203)
    expect(grid.fetched).toHaveLength(203)
    expect(grid.maxInFlight).toBeLessThanOrEqual(4)
    expect(phases.at(-1)).toBe('done')
    expect(result.items[0].takenAt).toBe(Date.parse('Mar 1, 2024, 10:22:13 AM'))
  })

  it('counts unreadable thumbnails and leaves them out', async () => {
    const tiles = makeTiles(10)
    const grid = new FakeGrid(tiles, 4, new Set([tiles[3].thumbUrl, tiles[7].thumbUrl]))
    const result = await scanView(grid, { pollMs: 1, scrollSettleMs: 5 })
    expect(result.failed).toBe(2)
    expect(result.items.map((i) => i.id)).not.toContain(tiles[3].id)
    expect(result.items).toHaveLength(8)
  })

  it('stops scrolling and hashing when cancelled', async () => {
    const grid = new FakeGrid(makeTiles(5000))
    const ctrl = new AbortController()
    const result = await scanView(grid, {
      pollMs: 1,
      scrollSettleMs: 5,
      signal: ctrl.signal,
      onProgress: (p) => { if (p.found >= 100) ctrl.abort() },
    })
    expect(result.cancelled).toBe(true)
    expect(result.found).toBeLessThan(5000)
    expect(grid.fetched.length).toBeLessThan(5000)
  })

  it('works on a view with nothing to scroll', async () => {
    const grid = new FakeGrid(makeTiles(3))
    grid.top = 0
    grid.findScrollTarget = () => null
    const result = await scanView(grid, { pollMs: 1 })
    expect(result.items).toHaveLength(3)
  })
})

describe('parseLabelDate', () => {
  it('reads the capture time from an English tile label', () => {
    expect(parseLabelDate('Photo - Landscape - Mar 3, 2024, 10:22:13 AM')).toBe(Date.parse('Mar 3, 2024, 10:22:13 AM'))
    expect(parseLabelDate('Photo - Portrait - Mar 3, 2024, 10:22:13 PM')).toBe(Date.parse('Mar 3, 2024, 10:22:13 PM'))
  })

  it('returns null when no part of the label is a date', () => {
    expect(parseLabelDate(null)).toBeNull()
    expect(parseLabelDate('Photo - Landscape')).toBeNull()
    expect(parseLabelDate('Photo - xyz 2024 abc')).toBeNull()
  })
})
