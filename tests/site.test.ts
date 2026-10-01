import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

const read = (f: string) => readFileSync(new URL(`../site/${f}`, import.meta.url), 'utf8')
const tracking = read('tracking.js')

type Call = unknown[]

async function run(page: 'index' | 'thanks', config: object, search = '') {
  const storage = new Map<string, string>()
  const appended: { src?: string }[] = []
  const listeners: Record<string, () => void> = {}
  const link = { href: '', addEventListener: (_: string, f: () => void) => { listeners.click = f } }
  const banner = {
    hidden: true,
    querySelector: () => ({ addEventListener: () => {} }),
  }
  const ctx: Record<string, unknown> = {
    document: {
      currentScript: { getAttribute: () => page },
      getElementById: (id: string) => (id === 'add-to-chrome' ? link : id === 'consent' ? banner : null),
      createElement: () => ({}),
      head: { appendChild: (e: { src?: string }) => appended.push(e) },
    },
    location: { search, origin: 'https://x.test', pathname: '/thanks.html' },
    localStorage: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v) },
    fetch: () => Promise.resolve({ json: () => Promise.resolve(config) }),
    URL,
    URLSearchParams,
    Object,
    Date,
    encodeURIComponent,
    window: {} as Record<string, unknown>,
  }
  ctx.window = ctx
  runInNewContext(tracking, ctx)
  await new Promise((r) => setTimeout(r, 10))
  const snapshot = () => ((ctx.dataLayer as unknown[]) ?? []).map((a) => Array.from(a as ArrayLike<unknown>)) as Call[]
  return { calls: snapshot(), snapshot, appended, link, click: listeners.click }
}

const real = {
  ga4MeasurementId: 'G-ABC123',
  adsConversionId: 'AW-123456',
  addToChromeSendTo: 'AW-123456/aaa',
  purchaseSendTo: 'AW-123456/bbb',
}

describe('site tracking', () => {
  it('ships placeholder ids and loads no tags with them', async () => {
    expect(JSON.parse(read('config.json')).ga4MeasurementId).toBe('G-XXXX')
    for (const page of ['index', 'thanks'] as const) {
      const r = await run(page, JSON.parse(read('config.json')), '?session_id=cs_live_abcdefgh12')
      expect(r.appended).toHaveLength(0)
      expect(r.calls).toHaveLength(0)
    }
    expect(read('index.html')).not.toMatch(/googletagmanager/)
    expect(read('thanks.html')).not.toMatch(/googletagmanager/)
  })

  it('sets consent defaults (denied in EEA/UK/CH, granted elsewhere) before config', async () => {
    const { calls, appended } = await run('index', real)
    expect(appended).toHaveLength(1)
    const firstConfig = calls.findIndex((c) => c[0] === 'config')
    const defaults = calls.map((c, i) => [c, i] as const).filter(([c]) => c[0] === 'consent' && c[1] === 'default')
    expect(defaults).toHaveLength(2)
    for (const [, i] of defaults) expect(i).toBeLessThan(firstConfig)
    const denied = defaults[0][0][2] as Record<string, unknown>
    for (const k of ['ad_storage', 'ad_user_data', 'ad_personalization', 'analytics_storage']) expect(denied[k]).toBe('denied')
    expect(denied.region).toEqual(expect.arrayContaining(['DE', 'GB', 'CH', 'FR']))
    expect((defaults[1][0][2] as Record<string, unknown>).ad_storage).toBe('granted')
  })

  it('records add_to_chrome_click and an Ads conversion, carrying UTM', async () => {
    const r = await run('index', real, '?utm_source=google&utm_campaign=c1&email=a@b.c')
    expect(r.link.href).toContain('utm_source=google')
    expect(r.link.href).not.toContain('email')
    r.click()
    const ev = r.snapshot().filter((c) => c[0] === 'event')
    expect(ev.map((c) => c[1])).toEqual(expect.arrayContaining(['add_to_chrome_click', 'conversion']))
  })

  it('thanks page sends purchase once with transaction_id and no personal data', async () => {
    const r = await run('thanks', real, '?session_id=cs_live_abcdefgh12')
    const purchase = r.calls.find((c) => c[0] === 'event' && c[1] === 'purchase')
    expect(purchase?.[2]).toEqual({ transaction_id: 'cs_live_abcdefgh12', value: 9.99, currency: 'USD' })
  })

  it('does not fire purchase for the unreplaced template or a missing id', async () => {
    for (const q of ['', '?session_id={CHECKOUT_SESSION_ID}']) {
      const r = await run('thanks', real, q)
      expect(r.calls.find((c) => c[1] === 'purchase')).toBeUndefined()
    }
  })

  it('renders the public stats from stats.json', () => {
    const s = JSON.parse(read('stats.json'))
    expect(s.users).toBe('10,000+')
    expect(s.rating).toBe(4.7)
    expect(s.source).toBeTruthy()
    expect(read('index.html')).toContain('Google Photos is a trademark of Google LLC')
  })
})
