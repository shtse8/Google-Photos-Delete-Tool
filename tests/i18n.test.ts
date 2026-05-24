import { describe, it, expect, beforeEach } from 'vitest'
import {
  LOCALES,
  DEFAULT_LOCALE,
  setLocale,
  getLocale,
  t,
  type LocaleCode,
} from '../src/extension/popup/i18n'

describe('LOCALES', () => {
  it('lists French first', () => {
    expect(LOCALES[0].code).toBe('fr')
  })

  it('exposes the supported set', () => {
    const codes = LOCALES.map(l => l.code)
    expect(codes).toContain('fr')
    expect(codes).toContain('en')
    expect(codes).toContain('es')
    expect(codes).toContain('de')
    expect(codes).toContain('it')
    expect(codes).toContain('pt')
    expect(codes).toContain('nl')
    expect(codes).toContain('ja')
    expect(codes).toContain('zh')
  })

  it('every locale has a native label', () => {
    for (const l of LOCALES) {
      expect(l.label).toBeTypeOf('string')
      expect(l.label.length).toBeGreaterThan(0)
    }
  })

  it('every locale has every UI string', () => {
    const required = [
      'header.title', 'header.subtitle',
      'status.ready', 'status.selecting', 'status.deleting',
      'status.scrolling', 'status.paused', 'status.done',
      'status.error', 'status.idle',
      'stats.deleted', 'stats.rate', 'stats.elapsed', 'stats.eta',
      'settings.sectionLabel',
      'settings.maxCount.label', 'settings.maxCount.hint',
      'settings.dryRun.label', 'settings.dryRun.hint',
      'settings.language.label', 'settings.language.trigger',
      'actions.start', 'actions.pause', 'actions.resume', 'actions.stop',
      'notes.navigateFirst',
    ]
    for (const locale of LOCALES) {
      setLocale(locale.code)
      for (const key of required) {
        const value = t(key)
        expect(value, `${locale.code}:${key}`).not.toBe(key) // not the fallback
        expect(typeof value).toBe('string')
        expect(value.length).toBeGreaterThan(0)
      }
    }
  })
})

describe('setLocale / getLocale', () => {
  beforeEach(() => {
    setLocale(DEFAULT_LOCALE)
  })

  it('defaults to French', () => {
    expect(DEFAULT_LOCALE).toBe('fr')
    expect(getLocale()).toBe('fr')
  })

  it('switches locales', () => {
    setLocale('en')
    expect(getLocale()).toBe('en')
    setLocale('ja')
    expect(getLocale()).toBe('ja')
  })

  it('falls back to default for unknown codes', () => {
    setLocale('xx-unknown' as LocaleCode)
    expect(getLocale()).toBe('fr')
  })
})

describe('t()', () => {
  beforeEach(() => setLocale('fr'))

  it('resolves nested keys', () => {
    expect(t('header.title')).toMatch(/Photos/)
    expect(t('actions.start')).toBe('Démarrer')
    expect(t('status.paused')).toBe('En pause')
  })

  it('returns the key as fallback for unknown paths', () => {
    expect(t('nonsense.path')).toBe('nonsense.path')
    expect(t('actions.fly')).toBe('actions.fly')
  })

  it('returns key for non-string leaves', () => {
    // 'actions' is an object, not a string
    expect(t('actions')).toBe('actions')
  })

  it('localizes when locale changes', () => {
    setLocale('fr'); expect(t('actions.start')).toBe('Démarrer')
    setLocale('en'); expect(t('actions.start')).toBe('Start')
    setLocale('de'); expect(t('actions.start')).toBe('Starten')
    setLocale('ja'); expect(t('actions.start')).toBe('開始')
  })
})
