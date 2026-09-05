import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PageRunner, ConsentRequiredError, PermanentActionRequiredError, RunInProgressError } from '../src/core/page-runner'
import { runEmptyTrashFlow } from '../src/core/empty-trash'
import type { EngineDom, ClickTarget, PhotoTile, ScrollTarget } from '../src/core/dom-adapter'
import { TRASH_URL, type EmptyTrashBaton } from '../src/core/empty-trash-baton'
import { CONSENT_KEY, EMPTY_TRASH_ACK_KEY } from '../src/core/consent'
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
  holdSleep = false
  private sleepResolvers: Array<() => void> = []
  sleepGate: Promise<void> | null = null

  setTiles(labels: string[]): void {
    this.tiles = labels.map((label) => ({ label, checked: false }))
  }

  releaseSleep(): void {
    this.holdSleep = false
    for (const resolve of this.sleepResolvers.splice(0)) resolve()
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
  async sleep(): Promise<void> {
    if (this.sleepGate) await this.sleepGate
    if (!this.holdSleep) return
    await new Promise<void>((resolve) => { this.sleepResolvers.push(resolve) })
  }
}

const fakeBaton = (): EmptyTrashBaton & {
  pending: { at: number } | null
  writes: number
  writeOk: boolean
} => {
  const state: { pending: { at: number } | null; writes: number; writeOk: boolean } = {
    pending: null,
    writes: 0,
    writeOk: true,
  }
  return {
    get pending() { return state.pending },
    get writes() { return state.writes },
    get writeOk() { return state.writeOk },
    set writeOk(v: boolean) { state.writeOk = v },
    async readPending() { return state.pending },
    async writePending(at = Date.now()) {
      state.writes += 1
      if (!state.writeOk) return false
      state.pending = { at }
      return true
    },
    async clearPending() { state.pending = null },
  }
}

const stubWindow = (opts: { throwOnGet?: (key: string) => boolean } = {}) => {
  const store = new Map<string, string>()
  const location = { href: 'https://photos.google.com/' }
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k: string) => {
        if (opts.throwOnGet?.(k)) throw new Error('storage unreadable')
        return store.get(k) ?? null
      },
      setItem: (k: string, v: string) => { store.set(k, v) },
      removeItem: (k: string) => { store.delete(k) },
    },
    location,
  } as unknown as Window & typeof globalThis)
  return { store, location }
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

  it('refuses a destructive run when consent storage is unreadable', async () => {
    stubWindow({ throwOnGet: (key) => key === CONSENT_KEY })
    const runner = new PageRunner({ dom: new RunnerFakeDom() as unknown as EngineDom, baton: fakeBaton() })
    await expect(runner.start({ maxCount: 500, dryRun: false, emptyTrashAfter: false, filter: { kind: 'all' } }))
      .rejects.toBeInstanceOf(ConsentRequiredError)
    expect(runner.getStatus().running).toBe(false)
  })

  it('refuses an empty-trash run without the permanent acknowledgement', async () => {
    stubWindow()
    const runner = new PageRunner({ dom: new RunnerFakeDom() as unknown as EngineDom, baton: fakeBaton() })
    runner.acknowledgeConsent()
    await expect(runner.start({ maxCount: 500, dryRun: false, emptyTrashAfter: true, filter: { kind: 'all' } }))
      .rejects.toBeInstanceOf(PermanentActionRequiredError)
    expect(runner.getStatus().running).toBe(false)
  })

  it('refuses an empty-trash run when the permanent acknowledgement is unreadable', async () => {
    stubWindow({ throwOnGet: (key) => key === EMPTY_TRASH_ACK_KEY })
    const runner = new PageRunner({ dom: new RunnerFakeDom() as unknown as EngineDom, baton: fakeBaton() })
    runner.acknowledgeConsent()
    await expect(runner.start({ maxCount: 500, dryRun: false, emptyTrashAfter: true, filter: { kind: 'all' } }))
      .rejects.toBeInstanceOf(PermanentActionRequiredError)
    expect(runner.getStatus().running).toBe(false)
  })

  it('admits a dry-run without consent and never clicks', async () => {
    stubWindow()
    const dom = new RunnerFakeDom()
    dom.setTiles(['Photo - a'])
    const runner = new PageRunner({ dom: dom as unknown as EngineDom, baton: fakeBaton() })
    await runner.start({ maxCount: 500, dryRun: true, emptyTrashAfter: true, filter: { kind: 'all' } })
    expect(runner.getStatus().running).toBe(false)
    expect(dom.clicks).toHaveLength(0)
    expect(runner.getSummary()?.total).toBe(1)
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

describe('PageRunner — occupancy', () => {
  it('does not start a second engine while the first run is settling', async () => {
    stubWindow()
    const dom = new RunnerFakeDom()
    dom.holdSleep = true
    dom.setTiles(['Photo - a', 'Photo - b'])
    const runner = new PageRunner({ dom: dom as unknown as EngineDom, baton: fakeBaton() })
    runner.acknowledgeConsent()

    const first = runner.start({ maxCount: 500, dryRun: false, emptyTrashAfter: false, filter: { kind: 'all' } })
    expect(runner.getStatus().running).toBe(true)
    const second = runner.start({ maxCount: 500, dryRun: false, emptyTrashAfter: false, filter: { kind: 'all' } })
    await expect(second).rejects.toBeInstanceOf(RunInProgressError)
    expect(runner.getStatus().running).toBe(true)

    dom.releaseSleep()
    await first
    expect(runner.getStatus().running).toBe(false)
    expect(dom.clicks.filter((c) => c === 'confirm')).toHaveLength(1)
  })
})

describe('PageRunner — empty-trash chain', () => {
  it('navigates only after a clean real run that deleted at least one item', async () => {
    const { location } = stubWindow()
    const dom = new RunnerFakeDom()
    dom.setTiles(['Photo - a'])
    const baton = fakeBaton()
    const runner = new PageRunner({ dom: dom as unknown as EngineDom, baton })
    runner.acknowledgeConsent()
    runner.acknowledgeEmptyTrash()

    await runner.start({ maxCount: 500, dryRun: false, emptyTrashAfter: true, filter: { kind: 'all' } })

    expect(baton.writes).toBe(1)
    expect(baton.pending).not.toBeNull()
    expect(location.href).toBe(TRASH_URL)
  })

  it('does not navigate after a dry-run', async () => {
    const { location } = stubWindow()
    const dom = new RunnerFakeDom()
    dom.setTiles(['Photo - a'])
    const baton = fakeBaton()
    const runner = new PageRunner({ dom: dom as unknown as EngineDom, baton })

    await runner.start({ maxCount: 500, dryRun: true, emptyTrashAfter: true, filter: { kind: 'all' } })

    expect(baton.writes).toBe(0)
    expect(location.href).toBe('https://photos.google.com/')
  })

  it('does not navigate when a real run deleted nothing', async () => {
    const { location } = stubWindow()
    const dom = new RunnerFakeDom()
    const baton = fakeBaton()
    const runner = new PageRunner({ dom: dom as unknown as EngineDom, baton })
    runner.acknowledgeConsent()
    runner.acknowledgeEmptyTrash()

    await runner.start({ maxCount: 500, dryRun: false, emptyTrashAfter: true, filter: { kind: 'all' } })

    expect(baton.writes).toBe(0)
    expect(location.href).toBe('https://photos.google.com/')
  })

  it('does not navigate when the run is stopped', async () => {
    const { location } = stubWindow()
    const dom = new RunnerFakeDom()
    dom.holdSleep = true
    dom.setTiles(['Photo - a'])
    const baton = fakeBaton()
    const runner = new PageRunner({ dom: dom as unknown as EngineDom, baton })
    runner.acknowledgeConsent()
    runner.acknowledgeEmptyTrash()

    const started = runner.start({ maxCount: 500, dryRun: false, emptyTrashAfter: true, filter: { kind: 'all' } })
    expect(runner.getStatus().running).toBe(true)
    runner.stop()
    dom.releaseSleep()
    await started

    expect(baton.writes).toBe(0)
    expect(location.href).toBe('https://photos.google.com/')
  })

  it('does not navigate when the baton cannot be persisted', async () => {
    const { location } = stubWindow()
    const dom = new RunnerFakeDom()
    dom.setTiles(['Photo - a'])
    const baton = fakeBaton()
    baton.writeOk = false
    const runner = new PageRunner({ dom: dom as unknown as EngineDom, baton })
    runner.acknowledgeConsent()
    runner.acknowledgeEmptyTrash()

    await runner.start({ maxCount: 500, dryRun: false, emptyTrashAfter: true, filter: { kind: 'all' } })

    expect(baton.writes).toBe(1)
    expect(baton.pending).toBeNull()
    expect(location.href).toBe('https://photos.google.com/')
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

describe('PageRunner — second start refused while a run occupies the slot (GPDT-CONTROL)', () => {
  it('throws RunInProgressError on a second start while the first run is settling and does not confirm twice', async () => {
    stubWindow()
    const dom = new RunnerFakeDom()
    dom.setTiles(['Photo - a'])
    let release: () => void = () => undefined
    dom.sleepGate = new Promise<void>((r) => { release = r })
    const runner = new PageRunner({ dom: dom as unknown as EngineDom, baton: fakeBaton() })
    runner.acknowledgeConsent()

    const first = runner.start({ maxCount: 500, dryRun: false, emptyTrashAfter: false, filter: { kind: 'all' } })
    const startWait = Date.now()
    while (!runner.getStatus().running) {
      if (Date.now() - startWait > 1000) throw new Error('first start never occupied the slot')
      await new Promise((r) => setTimeout(r, 5))
    }

    await expect(
      runner.start({ maxCount: 500, dryRun: true, emptyTrashAfter: false, filter: { kind: 'all' } }),
    ).rejects.toBeInstanceOf(RunInProgressError)
    expect(dom.clicks.filter((c) => c === 'confirm')).toHaveLength(0)

    release()
    await first
    expect(dom.clicks.filter((c) => c === 'confirm')).toHaveLength(1)
    expect(runner.getStatus().running).toBe(false)
  })
})

describe('PageRunner — empty-trash occupancy and stop (GPDT-CONTROL)', () => {
  const pendingBaton = () => {
    const baton = fakeBaton()
    void baton.writePending()
    return baton
  }

  it('refuses a second start while empty-trash occupies the run slot', async () => {
    stubWindow()
    const dom = new RunnerFakeDom()
    dom.pathname = '/trash'
    let release: () => void = () => undefined
    const hang = new Promise<void>((r) => { release = r })
    let emptyStarts = 0
    const runner = new PageRunner({
      dom: dom as unknown as EngineDom,
      baton: pendingBaton(),
      runEmptyTrash: async ({ onStatus }) => {
        emptyStarts += 1
        onStatus?.('emptyingTrash')
        await hang
        onStatus?.('done')
      },
    })

    const emptying = runner.maybeRunPendingEmptyTrash()
    const startWait = Date.now()
    while (!runner.getStatus().running) {
      if (Date.now() - startWait > 1000) throw new Error('empty-trash never occupied the slot')
      await new Promise((r) => setTimeout(r, 5))
    }
    expect(runner.getStatus().progress?.status).toBe('emptyingTrash')

    await expect(
      runner.start({ maxCount: 500, dryRun: true, emptyTrashAfter: false, filter: { kind: 'all' } }),
    ).rejects.toBeInstanceOf(RunInProgressError)
    expect(emptyStarts).toBe(1)

    release()
    await emptying
    expect(emptyStarts).toBe(1)
    expect(runner.getStatus().running).toBe(false)
  })

  it('stop during an empty-trash wait resolves to idle, never done or error, and does not click confirm', async () => {
    stubWindow()
    const dom = new RunnerFakeDom()
    dom.pathname = '/trash'
    const statuses: string[] = []
    const runner = new PageRunner({
      dom: dom as unknown as EngineDom,
      baton: pendingBaton(),
      runEmptyTrash: (deps) => runEmptyTrashFlow({
        findEmptyTrashButton: () => null,
        findConfirmDialog: () => null,
        findConfirmButton: () => null,
        isTrashEmpty: () => false,
        ...deps,
      }),
    })
    const unsub = runner.onUpdate((s) => {
      if (s.progress) statuses.push(s.progress.status)
    })

    const emptying = runner.maybeRunPendingEmptyTrash()
    const startWait = Date.now()
    while (!runner.getStatus().running) {
      if (Date.now() - startWait > 1000) throw new Error('empty-trash never occupied the slot')
      await new Promise((r) => setTimeout(r, 5))
    }

    runner.stop()
    await emptying
    unsub()

    expect(runner.getStatus().running).toBe(false)
    expect(runner.getStatus().progress?.status).toBe('idle')
    expect(runner.getStatus().progress?.error).toBeUndefined()
    expect(statuses).not.toContain('done')
    expect(statuses).not.toContain('error')
  })
})
