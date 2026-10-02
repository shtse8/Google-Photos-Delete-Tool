import { describe, it, expect, vi, afterEach } from 'vitest'
import { createChromeBaton, readProToken, writeProToken } from '../src/extension/api'

/**
 * The extension API is built on callback-style chrome.* (Firefox + Chrome
 * compatible). Tests stub the callback shape exactly.
 */

const stubChrome = (overrides: Partial<{
  get: (keys: string | string[], cb: (data: Record<string, unknown>) => void) => void
  set: (items: Record<string, unknown>, cb: () => void) => void
  remove: (keys: string[], cb: () => void) => void
  lastError: { message: string } | undefined
}> = {}) => {
  const store = new Map<string, unknown>()
  const chrome = {
    storage: {
      local: {
        get: overrides.get ?? ((keys: string[], cb: (d: Record<string, unknown>) => void) => {
          cb(Object.fromEntries(keys.map((k) => [k, store.get(k)])))
        }),
        set: overrides.set ?? ((items: Record<string, unknown>, cb: () => void) => {
          for (const [k, v] of Object.entries(items)) store.set(k, v)
          cb()
        }),
        remove: overrides.remove ?? ((keys: string[], cb: () => void) => {
          for (const k of keys) store.delete(k)
          cb()
        }),
      },
    },
    runtime: { lastError: overrides.lastError },
  }
  vi.stubGlobal('chrome', chrome as unknown as typeof chrome)
  return store
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createChromeBaton', () => {
  it('round-trips a pending flag', async () => {
    stubChrome()
    const b = createChromeBaton()
    expect(await b.writePending(123)).toBe(true)
    expect(await b.readPending()).toEqual({ at: 123 })
    await b.clearPending()
    expect(await b.readPending()).toBeNull()
  })

  it('returns null on read failure without throwing', async () => {
    stubChrome({
      get: (_keys, cb) => {
        vi.stubGlobal('chrome', {
          ...(vi.isMockFunction(() => {}) ? {} : {}),
        })
        // simulate lastError on the callback
        const c = globalThis.chrome as unknown as { runtime: { lastError: { message: string } | undefined } }
        c.runtime.lastError = { message: 'boom' }
        cb({})
      },
    })
    const b = createChromeBaton()
    await expect(b.readPending()).resolves.toBeNull()
  })

  it('reports false on write failure without throwing', async () => {
    stubChrome({
      set: (_items, cb) => {
        const c = globalThis.chrome as unknown as { runtime: { lastError: { message: string } | undefined } }
        c.runtime.lastError = { message: 'boom' }
        cb()
      },
    })
    const b = createChromeBaton()
    await expect(b.writePending()).resolves.toBe(false)
  })
})

describe('Pro token sync', () => {
  const KEY = 'proToken'
  const stubArea = (store: Map<string, unknown>, failing = false) => ({
    get: (keys: string[], cb: (d: Record<string, unknown>) => void) => cb(Object.fromEntries(keys.filter((k) => store.has(k)).map((k) => [k, store.get(k)]))),
    set: (items: Record<string, unknown>, cb: () => void) => {
      if (failing) { (globalThis as any).chrome.runtime.lastError = { message: 'QUOTA' }; cb(); (globalThis as any).chrome.runtime.lastError = undefined; return }
      for (const [k, v] of Object.entries(items)) store.set(k, v)
      cb()
    },
    remove: (keys: string[], cb: () => void) => { for (const k of keys) store.delete(k); cb() },
  })
  const setup = (opts: { sync?: Map<string, unknown>; local?: Map<string, unknown>; syncFails?: boolean; noSync?: boolean } = {}) => {
    const sync = opts.sync ?? new Map<string, unknown>()
    const local = opts.local ?? new Map<string, unknown>()
    vi.stubGlobal('chrome', {
      storage: { local: stubArea(local), ...(opts.noSync ? {} : { sync: stubArea(sync, opts.syncFails) }) },
      runtime: { lastError: undefined },
    })
    return { sync, local }
  }

  it('local wins over a stale sync value and is pushed up', async () => {
    const { sync } = setup({ sync: new Map([[KEY, 'stale-sync']]), local: new Map([[KEY, 'from-local']]) })
    expect(await readProToken()).toBe('from-local')
    expect(sync.get(KEY)).toBe('from-local')
  })

  it('reads a sync-only token', async () => {
    setup({ sync: new Map([[KEY, 'from-sync']]) })
    expect(await readProToken()).toBe('from-sync')
  })

  it('migrates a local-only token up to sync', async () => {
    const { sync } = setup({ local: new Map([[KEY, 'old-local']]) })
    expect(await readProToken()).toBe('old-local')
    expect(sync.get(KEY)).toBe('old-local')
  })

  it('returns null when neither area has a token', async () => {
    setup()
    expect(await readProToken()).toBeNull()
  })

  it('writes both areas', async () => {
    const { sync, local } = setup()
    await writeProToken('tok')
    expect(sync.get(KEY)).toBe('tok')
    expect(local.get(KEY)).toBe('tok')
  })

  it('falls back to local when sync is unavailable or over quota', async () => {
    const a = setup({ noSync: true, local: new Map([[KEY, 'loc']]) })
    expect(await readProToken()).toBe('loc')
    await writeProToken('new')
    expect(a.local.get(KEY)).toBe('new')
    const b = setup({ syncFails: true })
    await writeProToken('tok2')
    expect(b.local.get(KEY)).toBe('tok2')
    expect(b.sync.has(KEY)).toBe(false)
  })
})
