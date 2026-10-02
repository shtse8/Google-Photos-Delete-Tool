import { describe, it, expect, beforeEach } from 'vitest'
import { DeleteEngine } from '../src/core/delete-engine'
import type { ClickTarget, EngineDom, PhotoTile, ScrollTarget } from '../src/core/dom-adapter'
import { diagnostics } from '../src/core/diagnostics'

/**
 * Pass-loop and observer-wait regressions on a small scripted grid:
 *  - the final flush is a batch, and the run reports done only after a pass
 *    from the top that deleted nothing (photos left after confirm, 374/500);
 *  - a pass that deletes as many photos as the previous one stops with an error;
 *  - a dry run on a busy page keeps waiting for rows when the page settles
 *    without any new row (an unrelated mutation must not end the settle).
 */

class Tile {
  checked = false
  constructor(readonly id: string) {}
}

class GridDom implements EngineDom {
  pathname = '/'
  tiles: Tile[] = []
  /** Tiles that appear right after a confirm (rows re-rendered late). */
  afterConfirm: string[] = []
  /** When false, confirm clears the selection but the photos stay. */
  confirmRemoves = true
  clicks: string[] = []
  private top = 0
  /** Observer fake: resolves true at once, without any new row. */
  observerNoise = false
  waitForDomQuiet?: (maxMs: number, quietMs: number) => Promise<boolean>
  /** Lazy chunks revealed one per `revealEverySleeps` sleeps after a scroll. */
  lazy: string[][] = []
  revealEverySleeps = 0
  private sleepsSinceScroll = 0
  private scrolled = false
  private dialogOpen = false

  constructor(ids: string[]) {
    this.tiles = ids.map((id) => new Tile(id))
  }

  counterText(): string | null {
    return String(this.tiles.filter((t) => t.checked).length)
  }
  private labels: Map<string, string> | null = null
  private noIdMode = false
  /** Use these labels, optionally with unreadable ids. */
  useLabels(labels: Map<string, string>, noIds: boolean): void { this.labels = labels; this.noIdMode = noIds }
  protected tileId(id: string): string | null { return id }
  /** Tiles that stay in the gallery after every confirm, rendered only once scrolled down. */
  stickyBelow: string[] = []
  private wrap(t: Tile): PhotoTile {
    return {
      click: () => { t.checked = !t.checked; this.clicks.push(`tile:${t.id}`) },
      label: () => this.labels?.get(t.id) ?? `Photo - ${t.id}`,
      id: () => (this.noIdMode ? null : this.tileId(t.id)),
    }
  }
  uncheckedTiles(): PhotoTile[] { return this.tiles.filter((t) => !t.checked).map((t) => this.wrap(t)) }
  checkedTiles(): PhotoTile[] { return this.tiles.filter((t) => t.checked).map((t) => this.wrap(t)) }
  private deleteBtn: ClickTarget = { click: () => { this.dialogOpen = true; this.clicks.push('delete') } }
  private confirmBtn: ClickTarget = {
    click: () => {
      this.clicks.push('confirm')
      if (this.confirmRemoves) this.tiles = this.tiles.filter((t) => !t.checked)
      else for (const t of this.tiles) t.checked = false
      for (const id of this.afterConfirm.splice(0)) this.tiles.push(new Tile(id))
      this.stickyBelow = this.stickyBelow.filter((id) => !this.tiles.some((x) => x.id === id) && (this.tiles.push(new Tile(id)), true))
      this.dialogOpen = false
    },
  }
  findDeleteToolbarButton(): ClickTarget | null { return this.tiles.some((t) => t.checked) ? this.deleteBtn : null }
  findConfirmDialog(): ClickTarget | null { return this.dialogOpen ? { click: () => undefined } : null }
  findConfirmButton(): ClickTarget | null { return this.dialogOpen ? this.confirmBtn : null }
  findScrollTarget(): ScrollTarget | null {
    const self = this
    const height = () => 800 * (1 + self.lazy.length + (self.scrolled ? 0 : 0)) + 800
    return {
      get scrollTop() { return self.top },
      set scrollTop(v: number) { self.top = v },
      get scrollHeight() { return height() },
      get clientHeight() { return 800 },
      scrollBy: () => {
        self.top = Math.min(self.top + 400, height() - 800)
        self.scrolled = true
        self.sleepsSinceScroll = 0
      },
      scrollTo: (o) => { self.top = o.top },
    }
  }
  click(target: ClickTarget): void { target.click() }
  async sleep(): Promise<void> {
    if (!this.scrolled || this.lazy.length === 0 || this.revealEverySleeps === 0) return
    if (++this.sleepsSinceScroll >= this.revealEverySleeps) {
      const chunk = this.lazy.shift()!
      for (const id of chunk) this.tiles.push(new Tile(id))
      this.scrolled = false
    }
  }
}

const CONFIG = { maxCount: 500, pollDelay: 200, actionTimeout: 2000, endOfListAttempts: 2, scrollSettleMs: 1000, selectionSettleMs: 1 }
const engineOn = (dom: GridDom, dryRun = false) => new DeleteEngine({ dom, config: { ...CONFIG, dryRun } })

beforeEach(() => diagnostics.reset())

describe('DeleteEngine — passes until a pass deletes nothing', () => {
  it('deletes rows that re-render after the final flush and only then reports done', async () => {
    const dom = new GridDom(['a', 'b', 'c'])
    dom.afterConfirm = ['d', 'e']
    const result = await engineOn(dom).run()
    expect(result.status).toBe('done')
    expect(result.deleted).toBe(5)
    expect(dom.tiles).toHaveLength(0)
  })

  it('(A) 300 then 600 arriving late both finish done with everything deleted', async () => {
    const dom = new GridDom(Array.from({ length: 300 }, (_, i) => `a${i}`))
    dom.afterConfirm = Array.from({ length: 600 }, (_, i) => `b${i}`)
    const result = await engineOn(dom).run()
    expect(result.status).toBe('done')
    expect(result.deleted).toBe(900)
    expect(dom.tiles).toHaveLength(0)
  })

  it('(A2) 500 then 500 finish done with everything deleted', async () => {
    const dom = new GridDom(Array.from({ length: 500 }, (_, i) => `a${i}`))
    dom.afterConfirm = Array.from({ length: 500 }, (_, i) => `b${i}`)
    const result = await engineOn(dom).run()
    expect(result.status).toBe('done')
    expect(result.deleted).toBe(1000)
    expect(dom.tiles).toHaveLength(0)
  })

  it('(B) photos that stay after confirm end with an error, not a loop', async () => {
    const dom = new GridDom(Array.from({ length: 400 }, (_, i) => `a${i}`))
    dom.confirmRemoves = false
    const result = await engineOn(dom).run()
    expect(result.status).toBe('error')
    expect(result.error).toMatch(/still in the gallery/)
    expect(result.deleted).toBeLessThanOrEqual(500)
    expect(dom.clicks.filter((c) => c === 'confirm')).toHaveLength(1)
  })

  it('(B) 600 photos that stay stop after one cap of confirms each, never forever', async () => {
    const dom = new GridDom(Array.from({ length: 600 }, (_, i) => `a${i}`))
    dom.confirmRemoves = false
    const result = await engineOn(dom).run()
    expect(result.status).toBe('error')
    expect(result.deleted).toBeLessThanOrEqual(600)
    expect(dom.clicks.filter((c) => c === 'confirm').length).toBeLessThanOrEqual(2)
  })

  it('a clean gallery run still reports exactly what was deleted', async () => {
    const dom = new GridDom(['a', 'b'])
    const result = await engineOn(dom).run()
    expect(result.status).toBe('done')
    expect(result.deleted).toBe(2)
  })
})

describe('DeleteEngine — photos that cannot be told apart', () => {
  class LabelDom extends GridDom {
    labelOf = new Map<string, string>()
    noIds = true
    protected override tileId(id: string): string | null { return this.noIds ? null : id }
  }

  it('burst shots sharing a label and no id never end done with one left behind', async () => {
    const ids = [...Array.from({ length: 100 }, (_, i) => `n${i}`), 'dup1', 'dup2']
    const dom = new LabelDom(ids.slice(0, 101))
    dom.afterConfirm = ['dup2']
    for (const id of ids) dom.labelOf.set(id, id.startsWith('dup') ? 'Screenshot - Mar 1, 2024, 10:00:00' : `Photo - ${id}`)
    dom.useLabels(dom.labelOf, true)
    const engine = new DeleteEngine({ dom, config: { ...CONFIG, dryRun: false }, filter: { kind: 'type', type: 'screenshot' } })
    const result = await engine.run()
    expect(dom.tiles.some((t) => t.id === 'dup2')).toBe(true)
    expect(result.status).toBe('error')
    expect(result.error).toMatch(/cannot be told apart/)
  })

  it('photos stuck below the first screen end in an error', async () => {
    const dom = new GridDom(['a', 'b'])
    dom.stickyBelow = ['x1', 'x2']
    const result = await engineOn(dom).run()
    expect(result.status).toBe('error')
    expect(result.error).toMatch(/still in the gallery/)
    expect(dom.tiles.some((t) => t.id === 'x1')).toBe(true)
  })
})

describe('DeleteEngine — observer waits on a busy page', () => {
  it('a dry run keeps waiting for rows when the page settles without a new row', async () => {
    const dom = new GridDom(['a', 'b'])
    dom.lazy = [['c', 'd'], ['e', 'f'], ['g', 'h']]
    dom.revealEverySleeps = 3
    dom.waitForDomQuiet = async () => true // unrelated mutation: settled, but no new row
    const result = await engineOn(dom, true).run()
    expect(result.status).toBe('done')
    expect(result.total).toBe(8)
    expect(dom.clicks).toHaveLength(0)
  })
})
