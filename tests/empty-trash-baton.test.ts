import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  PENDING_EMPTY_TTL_MS,
  TRASH_PATH,
  evaluatePendingEmptyTrash,
  createLocalStorageBaton,
} from '../src/core/empty-trash-baton'
import { createChromeBaton } from '../src/extension/api'

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe('evaluatePendingEmptyTrash', () => {
  const now = Date.now()

  it('runs only when a fresh flag targets /trash', () => {
    expect(evaluatePendingEmptyTrash({ at: now }, now, TRASH_PATH)).toEqual({ shouldRun: true, reason: 'ok' })
  })

  it('skips when the flag is missing', () => {
    expect(evaluatePendingEmptyTrash(null, now, TRASH_PATH).reason).toBe('missing')
    expect(evaluatePendingEmptyTrash(undefined, now, TRASH_PATH).reason).toBe('missing')
    expect(evaluatePendingEmptyTrash({}, now, TRASH_PATH).reason).toBe('missing')
    expect(evaluatePendingEmptyTrash({ at: 'nope' as unknown as number }, now, TRASH_PATH).reason).toBe('missing')
  })

  it('skips when the flag has expired', () => {
    expect(evaluatePendingEmptyTrash({ at: now - PENDING_EMPTY_TTL_MS - 1 }, now, TRASH_PATH).reason).toBe('expired')
  })

  it('skips when not on /trash', () => {
    expect(evaluatePendingEmptyTrash({ at: now }, now, '/albums').reason).toBe('wrong-page')
    expect(evaluatePendingEmptyTrash({ at: now }, now, '/').reason).toBe('wrong-page')
  })

  it('rejects lookalike paths that merely contain /trash', () => {
    expect(evaluatePendingEmptyTrash({ at: now }, now, '/trashbin').reason).toBe('wrong-page')
    expect(evaluatePendingEmptyTrash({ at: now }, now, '/not-trash').reason).toBe('wrong-page')
  })

  it('accepts /trash and /trash/... subpaths', () => {
    expect(evaluatePendingEmptyTrash({ at: now }, now, '/trash').shouldRun).toBe(true)
    expect(evaluatePendingEmptyTrash({ at: now }, now, '/trash/').shouldRun).toBe(true)
  })
})

describe('createLocalStorageBaton', () => {
  const stubLocalStorage = () => {
    const store = new Map<string, string>()
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => { store.set(k, v) },
        removeItem: (k: string) => { store.delete(k) },
      },
    } as unknown as Window & typeof globalThis)
    return store
  }

  it('round-trips a pending flag through localStorage', async () => {
    stubLocalStorage()
    const b = createLocalStorageBaton('test-key')
    expect(await b.writePending(999)).toBe(true)
    expect(await b.readPending()).toEqual({ at: 999 })
    await b.clearPending()
    expect(await b.readPending()).toBeNull()
  })

  it('returns null on parse failure', async () => {
    const store = stubLocalStorage()
    store.set('gpdt_pendingEmpty', 'not-json')
    const b = createLocalStorageBaton()
    await expect(b.readPending()).resolves.toBeNull()
  })
})

describe('createChromeBaton (extension api wrapper)', () => {
  /**
   * The api.ts wrapper is CALLBACK-based (works in Chromium AND Firefox,
   * where chrome.* is callback-only). The stub therefore implements the
   * callback signature and flushes callbacks on demand.
   */
  const stubChromeStorage = () => {
    const store = new Map<string, unknown>()
    const callbacks: Array<() => void> = []
    vi.stubGlobal('chrome', {
      runtime: { lastError: undefined },
      storage: {
        local: {
          get: (keys: string[], cb: (data: Record<string, unknown>) => void) => {
            callbacks.push(() => cb(Object.fromEntries(keys.map((k) => [k, store.get(k)]))))
          },
          set: (items: Record<string, unknown>, cb: () => void) => {
            for (const [k, v] of Object.entries(items)) store.set(k, v)
            callbacks.push(cb)
          },
          remove: (keys: string[], cb: () => void) => {
            for (const k of keys) store.delete(k)
            callbacks.push(cb)
          },
        },
      },
    } as unknown as typeof chrome)
    return () => { while (callbacks.length) callbacks.shift()!() }
  }

  it('round-trips a pending flag', async () => {
    const flush = stubChromeStorage()
    const b = createChromeBaton()
    const writePromise = b.writePending(123)
    flush()
    expect(await writePromise).toBe(true)
    const readPromise = b.readPending()
    flush()
    expect(await readPromise).toEqual({ at: 123 })
    const clearPromise = b.clearPending()
    flush()
    await clearPromise
    const read2Promise = b.readPending()
    flush()
    expect(await read2Promise).toBeNull()
  })

  it('returns null on read failure without throwing', async () => {
    vi.stubGlobal('chrome', {
      runtime: { lastError: { message: 'boom' } },
      storage: {
        local: {
          get: (_keys: string[], cb: (data: Record<string, unknown>) => void) => cb({}),
          set: (_items: Record<string, unknown>, cb: () => void) => cb(),
          remove: (_keys: string[], cb: () => void) => cb(),
        },
      },
    } as unknown as typeof chrome)
    const b = createChromeBaton()
    await expect(b.readPending()).resolves.toBeNull()
  })

  it('reports false on write failure without throwing', async () => {
    vi.stubGlobal('chrome', {
      runtime: { lastError: { message: 'boom' } },
      storage: {
        local: {
          get: (_keys: string[], cb: (data: Record<string, unknown>) => void) => cb({}),
          set: (_items: Record<string, unknown>, cb: () => void) => cb(),
          remove: (_keys: string[], cb: () => void) => cb(),
        },
      },
    } as unknown as typeof chrome)
    const b = createChromeBaton()
    await expect(b.writePending()).resolves.toBe(false)
  })
})
