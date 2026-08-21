/**
 * Cross-surface wiring contracts.
 *
 * TypeScript cannot see DOM ids or message-action strings — a renamed id
 * or a mistyped action compiles fine and breaks at runtime (a null
 * element crash, or a popup button that silently does nothing). These
 * tests parse the actual sources and assert the contracts hold:
 *   1. Every getElementById/$() target exists in the HTML/template.
 *   2. Every message action the popup sends is handled by the content
 *      script, and vice versa.
 *   3. The consent storage key is identical across popup, content, and
 *      the in-page runner (a mismatch would make the consent gate
 *      permanently refuse real runs).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p: string): string => readFileSync(resolve(root, p), 'utf-8')

describe('popup DOM id binding', () => {
  const popupTs = read('src/extension/popup/popup.ts')
  const popupHtml = read('src/extension/popup/popup.html')

  it('every getElementById target exists in popup.html', () => {
    const refs = [...popupTs.matchAll(/getElementById\('([^']+)'\)/g)].map(m => m[1])
    const ids = new Set([...popupHtml.matchAll(/id="([^"]+)"/g)].map(m => m[1]))
    const missing = refs.filter(id => !ids.has(id))
    expect(missing).toEqual([])
  })

  it('every mountIcon target exists in popup.html', () => {
    const refs = [...popupTs.matchAll(/mountIcon\('([^']+)'/g)].map(m => m[1])
    const ids = new Set([...popupHtml.matchAll(/id="([^"]+)"/g)].map(m => m[1]))
    const missing = refs.filter(id => !ids.has(id))
    expect(missing).toEqual([])
  })
})

describe('panel DOM id binding', () => {
  const panelTs = read('src/ui/panel/panel.ts')

  it('every $() target exists in the panel template', () => {
    const refs = [...panelTs.matchAll(/\$\s*<[^>]+>\s*\('([^']+)'\)/g)].map(m => m[1])
    const ids = new Set([...panelTs.matchAll(/id="([^"]+)"/g)].map(m => m[1]))
    const missing = refs.filter(id => !ids.has(id))
    expect(missing).toEqual([])
  })
})

describe('content <-> popup message contract', () => {
  const popupTs = read('src/extension/popup/popup.ts')
  const contentTs = read('src/extension/content.ts')

  it('every action the popup sends is handled by content, and vice versa', () => {
    const sent = new Set([...popupTs.matchAll(/action:\s*'([^']+)'/g)].map(m => m[1]))
    const handled = new Set([...contentTs.matchAll(/case '([^']+)':/g)].map(m => m[1]))
    expect([...sent].sort()).toEqual([...handled].sort())
  })
})

describe('consent storage key contract', () => {
  it('popup, content, and page-runner use the same consent key', () => {
    const popupTs = read('src/extension/popup/popup.ts')
    const contentTs = read('src/extension/content.ts')
    const runnerTs = read('src/core/page-runner.ts')
    const popupKey = popupTs.match(/CONSENT_KEY = '([^']+)'/)?.[1]
    const contentKey = contentTs.match(/consent: '([^']+)'/)?.[1]
    const runnerKey = runnerTs.match(/CONSENT_KEY = '([^']+)'/)?.[1]
    expect(popupKey).toBeTruthy()
    expect(contentKey).toBeTruthy()
    expect(runnerKey).toBeTruthy()
    expect(new Set([popupKey, contentKey, runnerKey]).size).toBe(1)
  })
})

describe('GPDT-ENTER surface contract', () => {
  it('popup admits tabs via isSupportedPhotosUrl, not a substring includes', () => {
    const popupTs = read('src/extension/popup/popup.ts')
    expect(popupTs).toContain('isSupportedPhotosUrl')
    expect(popupTs).not.toMatch(/includes\(['"]photos\.google\.com['"]\)/)
  })

  it('userscript and standalone activate only through activateLocalSurface', () => {
    const userscript = read('src/userscript/google-photos-delete.user.ts')
    const standalone = read('src/standalone/inject.ts')
    expect(userscript).toContain('activateLocalSurface')
    expect(standalone).toContain('activateLocalSurface')
  })

  it('popup and panel offer a click-free dry-run control', () => {
    const popupHtml = read('src/extension/popup/popup.html')
    const panelTs = read('src/ui/panel/panel.ts')
    expect(popupHtml).toMatch(/id="dry-run"/)
    expect(panelTs).toMatch(/id="gpdt-dryrun"/)
  })

  it('popup names the current view as the action scope', () => {
    const popupHtml = read('src/extension/popup/popup.html')
    const popupTs = read('src/extension/popup/popup.ts')
    expect(popupHtml).toMatch(/id="scope"/)
    expect(popupTs).toContain('admitSurface')
    expect(popupTs).toContain('scope.actingOn')
  })
})

