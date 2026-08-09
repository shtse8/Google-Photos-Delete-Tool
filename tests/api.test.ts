import { describe, it, expect, vi, afterEach } from 'vitest'
import { createChromeBaton } from '../src/extension/api'

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
