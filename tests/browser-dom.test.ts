// @vitest-environment happy-dom
/**
 * The real browser adapter on a DOM fixture. Regression: the engine sets
 * `scrollTop = 0` after every batch; a getter-only scroll target made that
 * throw, so every real run with more than one batch ended in an error.
 */
import { describe, it, expect } from 'vitest'
import { browserDom } from '../src/core/browser-dom'

describe('browserDom scroll target', () => {
  it('accepts a scrollTop reset', () => {
    document.body.innerHTML = '<div class="yDSiEe uGCjIb zcLWac" style="overflow:auto;height:100px"><div style="height:5000px"></div></div>'
    const el = document.querySelector<HTMLElement>('.yDSiEe')!
    Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => 5000 })
    Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => 100 })
    const target = browserDom.findScrollTarget()
    expect(target).not.toBeNull()
    el.scrollTop = 300
    expect(() => { target!.scrollTop = 0 }).not.toThrow()
    expect(el.scrollTop).toBe(0)
  })
})

describe('browserDom checked tiles and tile clicks', () => {
  it('finds a checked checkbox whose class names changed, via ARIA state', () => {
    document.body.innerHTML =
      '<div class="newcls" role="checkbox" aria-checked="true"></div>' +
      '<div class="newcls3" role="checkbox" aria-checked="false"></div>'
    expect(browserDom.checkedTiles().length).toBe(1)
    document.body.innerHTML = '<div class="x" role="checkbox" aria-pressed="true"></div>'
    expect(browserDom.checkedTiles().length).toBe(1)
    // A checked non-checkbox (menu item, toggle) is not a photo selection.
    document.body.innerHTML = '<div class="x" role="menuitemcheckbox" aria-checked="true"></div>'
    expect(browserDom.checkedTiles().length).toBe(0)
  })

  it('clicks a tile with the full pointer sequence', () => {
    document.body.innerHTML = '<div class="ckGgle" role="checkbox" aria-checked="false"></div>'
    const el = document.querySelector<HTMLElement>('.ckGgle')!
    const seen: string[] = []
    for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      el.addEventListener(t, () => seen.push(t))
    }
    browserDom.uncheckedTiles()[0].click()
    expect(seen).toEqual(['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'])
  })
})
