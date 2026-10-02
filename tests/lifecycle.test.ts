import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { handleInstalled, registerLifecycle, uninstallUrl, WELCOME_URL, SITE_URL } from '../src/extension/lifecycle'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

afterEach(() => vi.unstubAllGlobals())

function stub() {
  const created: Array<{ url?: string }> = []
  const uninstall: string[] = []
  let listener: ((d: { reason?: string }) => void) | undefined
  vi.stubGlobal('chrome', {
    tabs: { create: (p: { url?: string }, cb: (t: unknown) => void) => { created.push(p); cb({}) } },
    runtime: {
      lastError: undefined,
      getManifest: () => ({ version: '9.9.9' }),
      setUninstallURL: (u: string, cb: () => void) => { uninstall.push(u); cb() },
      onInstalled: { addListener: (l: (d: { reason?: string }) => void) => { listener = l } },
    },
  })
  return { created, uninstall, fire: (reason: string) => listener?.({ reason }) }
}

describe('lifecycle', () => {
  it('opens the how-to section on install only', () => {
    const s = stub()
    registerLifecycle()
    s.fire('update'); s.fire('chrome_update')
    expect(s.created).toEqual([])
    s.fire('install')
    expect(s.created).toEqual([{ url: WELCOME_URL }])
    expect(WELCOME_URL).toBe(`${SITE_URL}#how`)
  })

  it('sets the uninstall URL with the version only', () => {
    const s = stub()
    registerLifecycle()
    expect(s.uninstall).toEqual([uninstallUrl('9.9.9')])
    expect(s.uninstall[0]).toMatch(/\/bye\.html\?v=9\.9\.9$/)
  })

  it('does not throw when the tab cannot open', () => {
    vi.stubGlobal('chrome', { tabs: { create: () => { throw new Error('x') } }, runtime: { lastError: undefined } })
    expect(() => handleInstalled({ reason: 'install' })).not.toThrow()
  })

  it('adds no permission', () => {
    const m = JSON.parse(readFileSync(resolve(root, 'src/extension/manifest.json'), 'utf-8'))
    expect(m.permissions).toEqual(['storage'])
  })

  it('ships the bye page that exists on the site', () => {
    expect(readFileSync(resolve(root, 'site/bye.html'), 'utf-8')).toContain('data-page="bye"')
  })
})
