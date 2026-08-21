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

describe('permanent empty-trash acknowledgement contract', () => {
  it('popup, content, and page-runner use the same empty-trash acknowledgement key', () => {
    const popupTs = read('src/extension/popup/popup.ts')
    const contentTs = read('src/extension/content.ts')
    const runnerTs = read('src/core/page-runner.ts')
    const popupKey = popupTs.match(/EMPTY_TRASH_ACK_KEY = '([^']+)'/)?.[1]
    const contentKey = contentTs.match(/emptyTrashAck: '([^']+)'/)?.[1]
    const runnerKey = runnerTs.match(/EMPTY_TRASH_ACK_KEY = '([^']+)'/)?.[1]
    expect(popupKey).toBeTruthy()
    expect(contentKey).toBeTruthy()
    expect(runnerKey).toBeTruthy()
    expect(new Set([popupKey, contentKey, runnerKey]).size).toBe(1)
  })

  it('content refuses a permanent empty-trash run without the acknowledgement', () => {
    const contentTs = read('src/extension/content.ts')
    // The ack gate lives on the non-dry path and is read through the
    // same storage wrapper as the general consent.
    expect(contentTs).toContain('STORAGE_KEYS.emptyTrashAck')
    expect(contentTs).toContain('if (emptyTrashAfter)')
    expect(contentTs).toContain("error: 'Permanent empty-trash consent required")
    expect(contentTs).toContain("error: 'Could not read permanent empty-trash consent state.'")
  })

  it('page-runner refuses a permanent empty-trash run without the acknowledgement', () => {
    const runnerTs = read('src/core/page-runner.ts')
    expect(runnerTs).toContain('opts.emptyTrashAfter && !this.emptyTrashAcknowledged()')
    expect(runnerTs).toContain('export class PermanentActionRequiredError')
    expect(runnerTs).toContain('acknowledgeEmptyTrash(): void')
  })
})

describe('permanent empty-trash warning is visible on selection', () => {
  it('popup shows the permanent-action warning the moment Empty trash is selected', () => {
    const popupTs = read('src/extension/popup/popup.ts')
    const popupHtml = read('src/extension/popup/popup.html')
    expect(popupHtml).toMatch(/id="empty-trash-warning"/)
    expect(popupHtml).toMatch(/data-i18n="consent\.permanentNote"/)
    expect(popupTs).toContain("const emptyTrashWarning = document.getElementById('empty-trash-warning')")
    expect(popupTs).toContain("emptyTrashInput.addEventListener('change'")
    expect(popupTs).toContain("emptyTrashWarning.classList.toggle('hidden', !emptyTrashInput.checked)")
  })

  it('panel shows the permanent-action warning the moment Empty trash is selected', () => {
    const panelTs = read('src/ui/panel/panel.ts')
    expect(panelTs).toMatch(/id="gpdt-empty-warning"/)
    expect(panelTs).toContain("const emptyWarning = $<HTMLElement>('gpdt-empty-warning')")
    expect(panelTs).toContain("emptyInput.addEventListener('change'")
    expect(panelTs).toContain("emptyWarning.style.display = emptyInput.checked ? 'block' : 'none'")
  })

  it('popup and panel gate a permanent empty-trash run on the acknowledgement, not only on consent', () => {
    const popupTs = read('src/extension/popup/popup.ts')
    const panelTs = read('src/ui/panel/panel.ts')
    expect(popupTs).toContain('opts.emptyTrashAfter && !(await emptyTrashAcknowledged())')
    expect(panelTs).toContain('opts.emptyTrashAfter && !runner.emptyTrashAcknowledged()')
    // Both surfaces record the acknowledgement at the same confirm
    // moment where the permanent warning is visible.
    expect(popupTs).toContain("if (pendingStart?.emptyTrashAfter) await acknowledgeEmptyTrash()")
    expect(panelTs).toContain("if (pendingStart?.emptyTrashAfter) runner.acknowledgeEmptyTrash()")
  })
})
