import { describe, it, expect, beforeEach, vi, beforeAll, afterAll } from 'vitest'
import {
  LOCALES,
  DEFAULT_LOCALE,
  setLocale,
  getLocale,
  t,
  tHtml,
  type LocaleCode,
} from '../src/extension/popup/i18n'

// Several tests intentionally probe missing keys to verify the
// fallback behaviour; we silence the i18n module's "missing
// translation" warn so the test output stays clean.
let warnSpy: ReturnType<typeof vi.spyOn>
beforeAll(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})
afterAll(() => {
  warnSpy.mockRestore()
})

describe('LOCALES', () => {
  it('lists English first (it is the default)', () => {
    expect(LOCALES[0].code).toBe('en')
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
      'status.navigatingTrash', 'status.emptyingTrash',
      'stats.sectionLabel', 'stats.deleted', 'stats.rate', 'stats.elapsed', 'stats.eta',
      'settings.sectionLabel',
      'settings.maxCount.label', 'settings.maxCount.hint',
      'settings.dryRun.label', 'settings.dryRun.hint',
      'settings.emptyTrash.label', 'settings.emptyTrash.hint',
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

  it('defaults to English', () => {
    expect(DEFAULT_LOCALE).toBe('en')
    expect(getLocale()).toBe('en')
  })

  it('switches locales', () => {
    setLocale('fr')
    expect(getLocale()).toBe('fr')
    setLocale('ja')
    expect(getLocale()).toBe('ja')
  })

  it('falls back to default for unknown codes', () => {
    setLocale('xx-unknown' as LocaleCode)
    expect(getLocale()).toBe('en')
  })
})

describe('t()', () => {
  beforeEach(() => setLocale('fr'))

  it('resolves nested keys', () => {
    expect(t('header.title')).toMatch(/Photos/)
    expect(t('actions.start')).toBe('Démarrer')
    expect(t('status.paused')).toBe('En pause')
    expect(t('settings.emptyTrash.label')).toBe('Vider la corbeille')
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

describe('t() — parameter interpolation', () => {
  beforeEach(() => setLocale('en'))

  it('substitutes {name} placeholders', () => {
    // Picked the navigate-first note because it carries a real
    // {url} placeholder in every locale already.
    expect(t('notes.navigateFirst', { url: 'photos.google.com' }))
      .toBe('Open photos.google.com first.')
  })

  it('leaves unknown placeholders as literal text', () => {
    // `{unknown}` is not in the params object — must NOT be removed
    // or replaced with `undefined`; staying as-is makes the missing
    // param obvious in the rendered UI.
    expect(t('notes.navigateFirst', { other: 'x' }))
      .toBe('Open {url} first.')
  })

  it('HTML-escapes substituted values by default', () => {
    expect(t('notes.navigateFirst', { url: '<script>evil</script>' }))
      .toBe('Open &lt;script&gt;evil&lt;/script&gt; first.')
  })

  it('escapes all unsafe characters: < > & " \'', () => {
    setLocale('fr')
    expect(t('notes.navigateFirst', { url: `a&b<c>d"e'f` }))
      .toBe('Ouvrez d’abord a&amp;b&lt;c&gt;d&quot;e&#39;f.')
  })

  it('passing no params leaves placeholders intact', () => {
    expect(t('notes.navigateFirst')).toBe('Open {url} first.')
  })

  it('accepts numeric param values', () => {
    expect(t('notes.navigateFirst', { url: 42 })).toBe('Open 42 first.')
  })
})

describe('tHtml() — verbatim interpolation', () => {
  beforeEach(() => setLocale('en'))

  it('substitutes {name} placeholders without escaping', () => {
    const anchor = '<a href="https://photos.google.com/" target="_blank">photos.google.com</a>'
    expect(tHtml('notes.navigateFirst', { url: anchor }))
      .toBe(`Open ${anchor} first.`)
  })

  it('still leaves unknown placeholders intact', () => {
    expect(tHtml('notes.navigateFirst', { other: '<b>x</b>' }))
      .toBe('Open {url} first.')
  })

  it('matches t() when no HTML is involved', () => {
    expect(tHtml('notes.navigateFirst', { url: 'photos.google.com' }))
      .toBe(t('notes.navigateFirst', { url: 'photos.google.com' }))
  })

  it('returns the key unchanged for missing translations', () => {
    expect(tHtml('does.not.exist', { x: '<b>1</b>' })).toBe('does.not.exist')
  })
})

describe('every locale carries the {url} placeholder for the note', () => {
  // The popup uses the {url} substitution in every locale via
  // I18N_HTML_PARAMS. A locale missing the placeholder would render
  // its translation literally, dropping the link entirely. Guard it.
  for (const locale of LOCALES) {
    it(`locale "${locale.code}" includes {url} in notes.navigateFirst`, () => {
      setLocale(locale.code)
      expect(t('notes.navigateFirst')).toContain('{url}')
    })
  }
})
