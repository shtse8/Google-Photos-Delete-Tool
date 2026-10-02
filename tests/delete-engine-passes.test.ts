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
  private wrap(t: Tile): PhotoTile {
    return { click: () => { t.checked = !t.checked; this.clicks.push(`tile:${t.id}`) }, label: () => `Photo - ${t.id}`, id: () => t.id }
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

  it('stops with an error when photos stay after confirm instead of deleting forever', async () => {
    const dom = new GridDom(['a', 'b', 'c'])
    dom.confirmRemoves = false
    const result = await engineOn(dom).run()
    expect(result.status).toBe('error')
    expect(result.error).toMatch(/still in the gallery/)
    expect(result.deleted).toBeLessThanOrEqual(6)
  })

  it('a clean gallery run still reports exactly what was deleted', async () => {
    const dom = new GridDom(['a', 'b'])
    const result = await engineOn(dom).run()
    expect(result.status).toBe('done')
    expect(result.deleted).toBe(2)
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
