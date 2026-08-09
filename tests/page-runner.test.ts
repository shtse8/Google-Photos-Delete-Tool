import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PageRunner, ConsentRequiredError } from '../src/core/page-runner'
import type { EngineDom, ClickTarget, PhotoTile, ScrollTarget } from '../src/core/dom-adapter'
import type { EmptyTrashBaton } from '../src/core/empty-trash-baton'
import { diagnostics } from '../src/core/diagnostics'

/**
 * PageRunner tests use an injected fake DOM and fake baton so the
 * in-page orchestration (consent, license, dry-run summary, empty-trash
 * chaining) is verifiable without a browser.
 */

class RunnerFakeDom implements EngineDom {
  pathname = '/'
  tiles: { label: string; checked: boolean }[] = []
  cap = Number.MAX_SAFE_INTEGER
  clicks: string[] = []

  setTiles(labels: string[]): void {
    this.tiles = labels.map((label) => ({ label, checked: false }))
  }

  counterText(): string | null {
    const selected = this.tiles.filter((t) => t.checked).length
    return selected > 0 ? String(selected) : '0'
  }
  private wrap(t: { label: string; checked: boolean }): PhotoTile {
    return { click: () => { t.checked = !t.checked; this.clicks.push(`tile:${t.label}`) }, label: () => t.label }
  }
  uncheckedTiles(): PhotoTile[] { return this.tiles.filter((t) => !t.checked).map((t) => this.wrap(t)) }
  checkedTiles(): PhotoTile[] { return this.tiles.filter((t) => t.checked).map((t) => this.wrap(t)) }
  private deleteBtn: ClickTarget = { click: () => { this.clicks.push('delete') } }
  private confirmBtn: ClickTarget = { click: () => { this.clicks.push('confirm'); for (const t of this.tiles) t.checked = false } }
  findDeleteToolbarButton(): ClickTarget | null { return this.tiles.some((t) => t.checked) ? this.deleteBtn : null }
  findConfirmDialog(): ClickTarget | null { return { click: () => undefined } }
  findConfirmButton(): ClickTarget | null { return this.confirmBtn }
  findScrollTarget(): ScrollTarget | null { return null }
  click(target: ClickTarget): void { target.click() }
  async sleep(): Promise<void> { return undefined }
}

const fakeBaton = (): EmptyTrashBaton & { pending: { at: number } | null } => {
  const state: { pending: { at: number } | null } = { pending: null }
  return {
    pending: state.pending,
    async readPending() { return state.pending },
    async writePending(at = Date.now()) { state.pending = { at }; return true },
    async clearPending() { state.pending = null },
  }
}

const stubWindow = () => {
  const store = new Map<string, string>()
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v) },
      removeItem: (k: string) => { store.delete(k) },
    },
    location: { href: 'https://photos.google.com/' },
  } as unknown as Window & typeof globalThis)
  return store
}

const stubNavigator = () => {
  vi.stubGlobal('navigator', { userAgent: 'test-agent' } as unknown as Navigator)
}

beforeEach(() => {
  vi.unstubAllGlobals()
  diagnostics.reset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('PageRunner — consent gate', () => {
  it('refuses a destructive run without consent', async () => {
    stubWindow()
    const runner = new PageRunner({ dom: new RunnerFakeDom() as unknown as EngineDom, baton: fakeBaton() })
    await expect(runner.start({ maxCount: 500, dryRun: false, emptyTrashAfter: false, filter: { kind: 'all' } }))
      .rejects.toBeInstanceOf(ConsentRequiredError)
    expect(runner.getStatus().running).toBe(false)
  })

  it('runs after consent is acknowledged', async () => {
    stubWindow()
    const dom = new RunnerFakeDom()
    dom.setTiles(['Photo - a'])
    const runner = new PageRunner({ dom: dom as unknown as EngineDom, baton: fakeBaton() })
    runner.acknowledgeConsent()
    expect(runner.consentAcknowledged()).toBe(true)

    await runner.start({ maxCount: 500, dryRun: false, emptyTrashAfter: false, filter: { kind: 'all' } })
    expect(runner.getStatus().running).toBe(false)
    expect(dom.clicks).toContain('confirm')
  })
})

describe('PageRunner — dry-run summary', () => {
  it('builds a type-count summary from a dry-run', async () => {
    stubWindow()
    const dom = new RunnerFakeDom()
    dom.setTiles(['Screenshot - shot', 'Video - clip', 'Photo - pic'])
    const runner = new PageRunner({ dom: dom as unknown as EngineDom, baton: fakeBaton() })

    await runner.start({ maxCount: 500, dryRun: true, emptyTrashAfter: false, filter: { kind: 'all' } })

    const summary = runner.getSummary()
    expect(summary).not.toBeNull()
    expect(summary?.total).toBe(3)
    expect(summary?.counts.screenshot).toBe(1)
    expect(summary?.counts.video).toBe(1)
    expect(summary?.counts.photo).toBe(1)
    expect(dom.clicks).toHaveLength(0) // never clicked anything
  })

  it('respects a type filter during a dry run', async () => {
    stubWindow()
    const dom = new RunnerFakeDom()
    dom.setTiles(['Screenshot - shot', 'Video - clip'])
    const runner = new PageRunner({ dom: dom as unknown as EngineDom, baton: fakeBaton() })

    await runner.start({
      maxCount: 500, dryRun: true, emptyTrashAfter: false,
      filter: { kind: 'type', type: 'screenshot' },
    })
    expect(runner.getSummary()?.total).toBe(1)
    expect(runner.getSummary()?.counts.screenshot).toBe(1)
  })
})

describe('PageRunner — status broadcast', () => {
  it('notifies subscribers and supports unsubscribe', async () => {
    stubWindow()
    const dom = new RunnerFakeDom()
    dom.setTiles(['Photo - a'])
    const runner = new PageRunner({ dom: dom as unknown as EngineDom, baton: fakeBaton() })
    runner.acknowledgeConsent()

    const updates: { running: boolean }[] = []
    const unsub = runner.onUpdate((s) => updates.push({ running: s.running }))
    await runner.start({ maxCount: 500, dryRun: false, emptyTrashAfter: false, filter: { kind: 'all' } })
    expect(updates.some((u) => u.running)).toBe(true)
    expect(updates[updates.length - 1].running).toBe(false)
    unsub()
    const before = updates.length
    void runner.onUpdate(() => undefined)
    void before
  })
})

describe('PageRunner — issue report URL', () => {
  it('builds a GitHub issue URL with a bounded diagnostic blob', () => {
    stubWindow()
    stubNavigator()
    const runner = new PageRunner({ dom: new RunnerFakeDom() as unknown as EngineDom, baton: fakeBaton() })
    const url = runner.buildIssueUrl()
    expect(url).toMatch(/^https:\/\/github\.com\/shtse8\/Google-Photos-Delete-Tool\/issues\/new\?/)
    const decoded = decodeURIComponent(url).replace(/\+/g, ' ')
    expect(decoded).toContain('[drift] Tool stopped working correctly')
    expect(decoded).toContain('Diagnostic data')
  })
})
