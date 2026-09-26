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
