// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { openDuplicateFinder, type FinderHost } from '../src/ui/dupes/finder'
import type { GridTile, ScanDeps } from '../src/core/dedup/scan'

// a0/a1 identical (100%, confident). b0/b1 differ by 3 bits (95.3%, needs review).
const bytes: Record<string, number[]> = {
  a0: [1, 2, 3, 4, 5, 6, 7, 8], a1: [1, 2, 3, 4, 5, 6, 7, 8],
  b0: [255, 0, 255, 0, 255, 0, 255, 0], b1: [254, 1, 255, 0, 255, 0, 255, 0],
}
const tiles: GridTile[] = Object.keys(bytes).map((k, i) => ({
  id: k,
  label: `Photo - Mar ${i + 1}, 2024, 10:00:00 AM`,
  thumbUrl: `https://lh3.googleusercontent.com/pw/${k}`,
}))
const scanDeps: ScanDeps = {
  harvest: () => tiles,
  findScrollTarget: () => ({
    scrollTop: 0, scrollHeight: 100, clientHeight: 400,
    scrollBy: () => undefined, scrollTo: () => undefined,
  }),
  hashThumb: async (url) => new Uint8Array(bytes[url.split('/').pop()!]),
  sleep: async () => undefined,
}

const waitFor = async (fn: () => boolean): Promise<void> => {
  for (let i = 0; i < 400 && !fn(); i++) await new Promise((r) => setTimeout(r, 5))
  expect(fn()).toBe(true)
}

let calls: { ids: string[]; dryRun: boolean }[]
const open = async (isPro?: boolean): Promise<ShadowRoot> => {
  const host: FinderHost = {
    runDelete: async (ids, dryRun) => { calls.push({ ids, dryRun }); return { ok: true } },
    stopRun: () => undefined,
    consentAcknowledged: async () => true,
    acknowledgeConsent: async () => undefined,
    onRunProgress: () => () => undefined,
    scanDeps,
    ...(isPro === undefined ? {} : { isPro: async () => isPro }),
  }
  openDuplicateFinder(host)
  const root = document.getElementById('gpdt-dupes-host')!.shadowRoot!
  ;[...root.querySelectorAll('button')].find((b) => b.textContent === 'Scan this view')!.click()
  await waitFor(() => /to Trash$/.test(root.querySelector('.danger')?.textContent ?? ''))
  return root
}
const trashLabel = (root: ShadowRoot): string => root.querySelector('.danger')!.textContent!
const btn = (root: ShadowRoot, text: RegExp): HTMLButtonElement =>
  [...root.querySelectorAll('button')].find((b) => text.test(b.textContent ?? '')) as HTMLButtonElement
const select = (root: ShadowRoot): HTMLSelectElement => root.querySelector('select')!
const autoBox = (root: ShadowRoot): HTMLInputElement => root.querySelector('.tools input[type=checkbox]')!

beforeEach(() => { document.body.innerHTML = ''; calls = [] })

describe('free users', () => {
  for (const label of ['no isPro on the host', 'isPro false']) {
    it(`keep today's behaviour and see disabled Pro controls (${label})`, async () => {
      const root = await open(label === 'isPro false' ? false : undefined)
      expect(trashLabel(root)).toBe('Move 2 to Trash')
      expect(select(root).disabled).toBe(true)
      expect(autoBox(root).disabled).toBe(true)
      expect(btn(root, /^Export CSV$/).disabled).toBe(true)
      const links = [...root.querySelectorAll<HTMLAnchorElement>('a.pro-tag')]
      expect(links).toHaveLength(3)
      for (const a of links) {
        expect(a.textContent).toBe('Pro')
        const u = new URL(a.href)
        expect(u.hash).toBe('#pro')
        expect(u.searchParams.get('utm_medium')).toBe('dupes')
      }
      // Forced events change nothing.
      select(root).value = 'newest'
      select(root).dispatchEvent(new Event('change'))
      autoBox(root).checked = true
      autoBox(root).dispatchEvent(new Event('change'))
      expect(trashLabel(root)).toBe('Move 2 to Trash')
      expect(root.querySelectorAll('.item.delete')).toHaveLength(2)
      expect(root.textContent).not.toMatch(/Approve this group/)
    })
  }
  it('a failing isPro check counts as free', async () => {
    const host: FinderHost = {
      runDelete: async () => ({ ok: true }), stopRun: () => undefined, consentAcknowledged: async () => true,
      acknowledgeConsent: async () => undefined, onRunProgress: () => () => undefined, scanDeps,
      isPro: async () => { throw new Error('storage') },
    }
    openDuplicateFinder(host)
    const root = document.getElementById('gpdt-dupes-host')!.shadowRoot!
    btn(root, /Scan this view/).click()
    await waitFor(() => !!root.querySelector('.danger'))
    expect(select(root).disabled).toBe(true)
  })
})

describe('Pro users', () => {
  it('apply a keep rule to all groups, still one keeper each', async () => {
    const root = await open(true)
    expect(select(root).disabled).toBe(false)
    expect(root.querySelector('a.pro-tag')).toBeNull()
    select(root).value = 'newest'
    select(root).dispatchEvent(new Event('change'))
    expect(trashLabel(root)).toBe('Move 2 to Trash')
    const trashed = [...root.querySelectorAll('.group')].map((g) => g.querySelectorAll('.item.keep').length)
    expect(trashed).toEqual([1, 1])
    expect(root.textContent).toMatch(/had no date data|Applied to 2 groups/)
  })

  it('auto-accept pre-approves confident groups; the rest need approval; the user still confirms', async () => {
    const root = await open(true)
    autoBox(root).checked = true
    autoBox(root).dispatchEvent(new Event('change'))
    expect(trashLabel(root)).toBe('Move 1 to Trash')
    expect(root.querySelectorAll('.group')).toHaveLength(1) // one combined review list
    btn(root, /^Approve this group$/).click()
    expect(trashLabel(root)).toBe('Move 2 to Trash')
    expect(calls).toHaveLength(0) // nothing moved without pressing the button
    btn(root, /^Move 2 to Trash$/).click()
    await waitFor(() => calls.length === 1)
    expect(calls[0].ids).toHaveLength(2)
    expect(calls[0].dryRun).toBe(false)
  })

  it('exports the groups as a local CSV with no network call', async () => {
    const root = await open(true)
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    let blob: Blob | undefined
    URL.createObjectURL = ((b: Blob) => { blob = b; return 'blob:test' }) as typeof URL.createObjectURL
    URL.revokeObjectURL = () => undefined
    btn(root, /^Export CSV$/).click()
    expect(blob).toBeDefined()
    const text = await blob!.text()
    const lines = text.trim().split('\n')
    expect(lines[0]).toBe('group_id,item_id,decision,similarity')
    expect(lines).toHaveLength(5)
    expect(lines.filter((l) => l.includes(',trashed,'))).toHaveLength(2)
    expect(fetchSpy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
