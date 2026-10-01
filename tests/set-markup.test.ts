// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { setMarkup } from '../src/extension/popup/set-markup'

describe('setMarkup', () => {
  it('replaces children with parsed nodes, keeping SVG and inline markup', () => {
    const el = document.createElement('div')
    el.textContent = 'old'
    setMarkup(el, '<svg viewBox="0 0 1 1"><path d="M0 0"/></svg> <b>hi</b>')
    expect(el.querySelector('svg path')).not.toBeNull()
    expect(el.querySelector('b')?.textContent).toBe('hi')
    expect(el.textContent).not.toContain('old')
  })
})
