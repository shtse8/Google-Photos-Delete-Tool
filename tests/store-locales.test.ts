import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  DEFAULT_LOCALE,
  MESSAGE_KEYS,
  MESSAGE_LIMITS,
  ROOT,
  localeCodes,
  messageProblems,
  readMessages,
} from '../scripts/lib/locales'

const json = (p: string) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf-8'))
// Chrome's supported locale codes for the locales we ship
// (developer.chrome.com/docs/extensions/reference/api/i18n#locales).
const EXPECTED = ['de', 'en', 'es', 'fr', 'it', 'ja', 'nl', 'pt_BR', 'zh_CN', 'zh_TW']

describe('store locales', () => {
  it('ships the expected locale set including the default', () => {
    expect(localeCodes()).toEqual(EXPECTED)
    expect(localeCodes()).toContain(DEFAULT_LOCALE)
  })

  for (const code of EXPECTED) {
    it(`${code}: every key present and within store limits`, () => {
      const msgs = readMessages(code)
      expect(messageProblems(code, msgs)).toEqual([])
      expect(Object.keys(msgs).sort()).toEqual([...MESSAGE_KEYS].sort())
    })
  }

  it('flags missing keys, overlong text and bad placeholders', () => {
    const base = Object.fromEntries(MESSAGE_KEYS.map((k) => [k, { message: 'x' }]))
    expect(messageProblems('t', base)).toEqual([])
    expect(messageProblems('t', { ...base, appShortName: { message: 'x'.repeat(13) } })).toHaveLength(1)
    expect(messageProblems('t', { ...base, appName: { message: '' } })).toHaveLength(1)
    expect(messageProblems('t', { ...base, appName: { message: 'a $who$' } })).toHaveLength(1)
    expect(messageProblems('t', { ...base, appName: { message: '5$ off' } })).toHaveLength(1)
  })

  it('source manifest references message keys and sets default_locale', () => {
    const m = json('src/extension/manifest.json')
    expect(m.default_locale).toBe(DEFAULT_LOCALE)
    expect(m.name).toBe('__MSG_appName__')
    expect(m.short_name).toBe('__MSG_appShortName__')
    expect(m.description).toBe('__MSG_appDescription__')
    expect(m.action.default_title).toBe('__MSG_appActionTitle__')
    for (const ref of [m.name, m.short_name, m.description, m.action.default_title]) {
      expect(MESSAGE_KEYS).toContain(ref.slice(6, -2))
    }
  })

  it('English store name still matches the listing title', () => {
    expect(readMessages('en').appName.message).toBe(json('storefront/listing.json').cws.title)
    expect(MESSAGE_LIMITS.appNameEdge).toBeLessThanOrEqual(45)
  })

  const built = existsSync(resolve(ROOT, 'dist/extension-firefox/manifest.json'))
  describe.skipIf(!built)('built manifests (after bun run build)', () => {
    const nameKey = { extension: '__MSG_appName__', 'extension-edge': '__MSG_appNameEdge__', 'extension-firefox': '__MSG_appNameEdge__' }
    for (const [dir, name] of Object.entries(nameKey)) {
      it(`${dir} references __MSG keys and ships every locale`, () => {
        const m = json(`dist/${dir}/manifest.json`)
        expect(m.default_locale).toBe(DEFAULT_LOCALE)
        expect(m.name).toBe(name)
        expect(m.description).toBe('__MSG_appDescription__')
        for (const code of EXPECTED) {
          expect(existsSync(resolve(ROOT, `dist/${dir}/_locales/${code}/messages.json`))).toBe(true)
        }
      })
    }
    it('firefox keeps its gecko id', () => {
      expect(json('dist/extension-firefox/manifest.json').browser_specific_settings.gecko.id).toBe(
        'google-photos-delete-tool@shtse8.github.io',
      )
    })
  })
})
