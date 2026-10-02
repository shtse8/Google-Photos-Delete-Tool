import { describe, it, expect } from 'vitest'
import { NOTHING_MOVED_TEXT, endedWithNothingMoved } from '../src/core/nothing-moved'
import { LOCALES, setLocale, t, type LocaleCode } from '../src/extension/popup/i18n'

describe('endedWithNothingMoved', () => {
  it('is true only for a done real run flagged nothingMoved', () => {
    expect(endedWithNothingMoved({ status: 'done', deleted: 0, nothingMoved: true })).toBe(true)
    expect(endedWithNothingMoved({ status: 'done', deleted: 0 })).toBe(false) // preview / empty trash
    expect(endedWithNothingMoved({ status: 'done', deleted: 3, nothingMoved: true })).toBe(false)
    expect(endedWithNothingMoved({ status: 'error', deleted: 0, nothingMoved: true })).toBe(false)
    expect(endedWithNothingMoved({ status: 'idle', deleted: 0, nothingMoved: true })).toBe(false)
  })
})

describe('nothing-moved copy', () => {
  it('English fallback names Report issue', () => {
    expect(NOTHING_MOVED_TEXT).toMatch(/Nothing was selected/)
    expect(NOTHING_MOVED_TEXT).toMatch(/Report issue/)
  })

  it('every shipped locale has a distinct, non-empty translation', () => {
    const seen = new Set<string>()
    for (const l of LOCALES) {
      setLocale(l.code as LocaleCode)
      const text = t('status.nothingMoved')
      expect(text.length).toBeGreaterThan(20)
      expect(text).not.toBe('status.nothingMoved')
      seen.add(text)
    }
    setLocale('en')
    expect(seen.size).toBe(LOCALES.length)
  })
})
