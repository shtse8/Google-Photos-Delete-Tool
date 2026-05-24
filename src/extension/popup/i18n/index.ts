/**
 * Tiny custom i18n layer for the extension popup.
 *
 * The engine intentionally has its OWN locale-agnostic logic (it doesn't
 * use this module). This is purely for the popup chrome.
 *
 * French is the default; the user picks any of the supported languages
 * from the picker in the popup header, and the choice is persisted to
 * chrome.storage.local. On first run we try to match the browser language.
 */
import type { LocaleCode, LocaleEntry, Translations } from './types'
import fr from './locales/fr'
import en from './locales/en'
import es from './locales/es'
import de from './locales/de'
import it from './locales/it'
import pt from './locales/pt'
import nl from './locales/nl'
import ja from './locales/ja'
import zh from './locales/zh'

export type { LocaleCode, LocaleEntry, Translations } from './types'

/**
 * Available locales. French is listed first because it is the project's
 * default; the rest are sorted by native-name alphabetical order so the
 * picker is predictable.
 */
export const LOCALES: readonly LocaleEntry[] = Object.freeze([
  { code: 'fr', label: 'Français', translations: fr },
  { code: 'de', label: 'Deutsch', translations: de },
  { code: 'en', label: 'English', translations: en },
  { code: 'es', label: 'Español', translations: es },
  { code: 'it', label: 'Italiano', translations: it },
  { code: 'nl', label: 'Nederlands', translations: nl },
  { code: 'pt', label: 'Português', translations: pt },
  { code: 'zh', label: '中文', translations: zh },
  { code: 'ja', label: '日本語', translations: ja },
])

export const DEFAULT_LOCALE: LocaleCode = 'fr'

let currentCode: LocaleCode = DEFAULT_LOCALE
let currentTranslations: Translations = fr

/** Get the locale code that is currently active. */
export function getLocale(): LocaleCode {
  return currentCode
}

/** Switch the active locale. Falls back to the default if `code` is unknown. */
export function setLocale(code: LocaleCode | string): LocaleCode {
  const found = LOCALES.find(l => l.code === code)
  const entry = found ?? LOCALES.find(l => l.code === DEFAULT_LOCALE)!
  currentCode = entry.code
  currentTranslations = entry.translations
  return entry.code
}

/**
 * Resolve a dotted key like `'header.title'` to a translated string.
 * Returns the key itself (for debugging) if the path doesn't resolve.
 */
export function t(key: string): string {
  const parts = key.split('.')
  let val: unknown = currentTranslations
  for (const part of parts) {
    if (val && typeof val === 'object' && part in (val as Record<string, unknown>)) {
      val = (val as Record<string, unknown>)[part]
    } else {
      return key
    }
  }
  return typeof val === 'string' ? val : key
}

/**
 * Walk the DOM and apply the current locale's translations:
 *  - `[data-i18n="key"]`             → element.textContent
 *  - `[data-i18n-attr="attr:key"]`   → element.setAttribute(attr, t(key))
 *
 * The second form supports multiple attrs separated by `,` and is used for
 * things like `aria-label`, `title`, `placeholder`.
 */
export function applyTranslations(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n
    if (key) el.textContent = t(key)
  })
  root.querySelectorAll<HTMLElement>('[data-i18n-attr]').forEach(el => {
    const spec = el.dataset.i18nAttr
    if (!spec) return
    for (const pair of spec.split(',')) {
      const [attr, key] = pair.split(':').map(s => s.trim())
      if (attr && key) el.setAttribute(attr, t(key))
    }
  })
}

/**
 * Best-effort match between a navigator/browser locale (e.g. "fr-CA") and
 * our supported set. Returns the default locale if no match.
 */
export function detectBrowserLocale(): LocaleCode {
  const candidates: string[] = []
  if (typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage) {
    candidates.push(chrome.i18n.getUILanguage())
  }
  if (typeof navigator !== 'undefined') {
    if (navigator.language) candidates.push(navigator.language)
    if (navigator.languages) candidates.push(...navigator.languages)
  }
  for (const raw of candidates) {
    if (!raw) continue
    const short = raw.toLowerCase().split(/[-_]/)[0]
    const found = LOCALES.find(l => l.code === short)
    if (found) return found.code
  }
  return DEFAULT_LOCALE
}
