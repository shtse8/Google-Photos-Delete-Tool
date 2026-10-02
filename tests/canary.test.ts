// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildChecks, evaluateCheck, evaluateDrift, type CandidateCounts } from '../scripts/canary/evaluate'
import { assertSafeClick, destructiveSelectors, guardScript } from '../scripts/canary/safety'
import { PACK } from '../src/core/selector-pack'

const fixture = (name: string) => readFileSync(resolve(__dirname, 'fixtures', name), 'utf-8')

/** Same counting the live probe does, over a fixture DOM. */
function observe(html: string): Record<string, CandidateCounts> {
  document.body.innerHTML = html
  const n = (sel: string): number | null => {
    try {
      return document.querySelectorAll(sel).length
    } catch {
      return null
    }
  }
  const out: Record<string, CandidateCounts> = {}
  for (const s of buildChecks()) out[s.id] = { primary: n(s.primary), fallbacks: s.fallbacks.map(n) }
  return out
}

describe('drift evaluation', () => {
  it('reports ok on a healthy grid and treats the dialog as skipped, not drift', () => {
    const s = evaluateDrift(observe(fixture('canary-grid-healthy.html')))
    expect(s.verdict).toBe('ok')
    expect(s.drifted).toEqual([])
    expect(s.packVersion).toBe(PACK.version)
    expect(s.checks.find((c) => c.id === 'dialog')?.verdict).toBe('skipped')
    expect(s.checks.find((c) => c.id === 'mediaLink')?.matched).toBe('primary')
  })

  it('reports drift, naming each selector that no longer matches', () => {
    const s = evaluateDrift(observe(fixture('canary-grid-drifted.html')))
    expect(s.verdict).toBe('drift')
    expect(s.drifted).toEqual(expect.arrayContaining(['mediaLink', 'thumbnail', 'checkbox', 'checkboxChecked', 'counter', 'toolbarDelete']))
    expect(s.drifted).not.toContain('dialog')
  })

  it('a primary-only miss with a live fallback is a warning, not drift', () => {
    const r = evaluateCheck(buildChecks()[0], { primary: 0, fallbacks: [0, 3] })
    expect(r.verdict).toBe('fallback')
    const s = evaluateDrift({ ...observe(fixture('canary-grid-healthy.html')), mediaLink: { primary: 0, fallbacks: [4] } })
    expect(s.verdict).toBe('ok')
  })

  it('a missing observation or invalid selectors count as drift', () => {
    expect(evaluateCheck(buildChecks()[0], undefined).verdict).toBe('drift')
    const r = evaluateCheck(buildChecks()[0], { primary: null, fallbacks: [0] })
    expect(r.verdict).toBe('drift')
    expect(r.detail).toMatch(/invalid/)
  })

  it('derives its checks from the active pack', () => {
    const ids = buildChecks().map((c) => c.id)
    for (const k of Object.keys(PACK.selectors)) expect(ids).toContain(k)
    expect(ids).toContain('toolbarDelete')
  })
})

describe('canary never deletes', () => {
  it('assertSafeClick refuses every pack-owned destructive selector', () => {
    for (const sel of destructiveSelectors()) expect(() => assertSafeClick(sel)).toThrow(/canary safety/)
  })

  it('assertSafeClick refuses selectors naming delete, trash, empty, dialog or confirm', () => {
    for (const sel of ['button[aria-label="Move to trash"]', '[role="dialog"] button', '#confirm', 'a.delete', '.empty-bin']) {
      expect(() => assertSafeClick(sel)).toThrow(/canary safety/)
    }
  })

  it('assertSafeClick allows every checkbox selector in the pack', () => {
    for (const d of [PACK.selectors.checkbox, PACK.selectors.checkboxChecked]) {
      for (const sel of [d.primary, ...d.fallbacks]) expect(() => assertSafeClick(sel)).not.toThrow()
    }
  })

  it('the in-page guard swallows a click on the trash button and inside a dialog', () => {
    document.body.innerHTML = '<button aria-label="Move to trash" id="t">x</button><div role="dialog"><button id="c">Move to trash</button></div><div role="checkbox" id="k"></div>'
    new Function(guardScript())()
    let reached = 0
    for (const id of ['t', 'c', 'k']) document.getElementById(id)!.addEventListener('click', () => reached++)
    for (const id of ['t', 'c', 'k']) document.getElementById(id)!.click()
    expect(reached).toBe(1) // only the checkbox click got through
    expect((window as unknown as { __canaryBlocked: string[] }).__canaryBlocked.length).toBe(2)
  })

  it('the runner has exactly one click site, behind assertSafeClick, and never names a delete control', () => {
    const src = readFileSync(resolve(__dirname, '../scripts/canary/run.ts'), 'utf-8')
    const clicks = src.match(/\.(click|dblclick|dispatchEvent|press|check|tap)\(/g) ?? []
    expect(clicks).toEqual(['.click('])
    const fn = src.slice(src.indexOf('async function toggleCheckbox'), src.indexOf('async function main'))
    expect(fn).toContain('assertSafeClick(selector)')
    expect(fn.indexOf('assertSafeClick')).toBeLessThan(fn.indexOf('.click('))
    expect(src).not.toMatch(/toolbarDelete|emptyTrash|PACK\.actionButtons/)
  })
})
