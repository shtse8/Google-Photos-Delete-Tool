/**
 * Type-safe i18n for the extension popup.
 *
 * Features
 * --------
 *
 *   • Compile-time enforced translations. The `Translations` interface
 *     is the source of truth; every locale file is typed `: Translations`
 *     so a missing key fails `tsc` rather than appearing as a runtime
 *     fallback in production.
 *
 *   • Browser-locale auto-detect on first run, user-pickable runtime
 *     switching, persisted in chrome.storage.local.
 *
 *   • Parameterised strings. A translation may contain `{name}`
 *     placeholders that {@link t} substitutes from a `params` object.
 *     Values are HTML-escaped because `t` is meant for `textContent`.
 *     For strings that splice trusted HTML (links, formatted spans)
 *     use {@link tHtml}; its substitutions go in verbatim.
 *
 *   • DOM helper. {@link applyTranslations} walks `root` and applies
 *     three attribute conventions:
 *
 *         [data-i18n="key"]             → element.textContent
 *         [data-i18n-html="key"]        → element.innerHTML
 *         [data-i18n-attr="attr:key"]   → element.setAttribute(attr, …)
 *
 *     Multiple `attr:key` pairs can be comma-separated.
 *     A `paramsFor(key)` callback supplies interpolation values.
 *
 * Scope
 * -----
 *
 *   Popup chrome only. The engine in `src/core/` is locale-agnostic
 *   by design: it matches Google Photos' action buttons against
 *   multilingual keyword dictionaries (see `src/core/selectors.ts`),
 *   never by relying on the popup's chosen language. Picking French
 *   in the popup must never change how we recognise the Photos UI.
 *
 * Note on `chrome.i18n`
 * --------------------
 *
 *   `chrome.i18n` + `_locales/` is the platform standard but resolves
 *   messages against the **browser** UI locale with no runtime-override
 *   API. The popup picker requires runtime switching independent of
 *   the browser, which this module provides. We still call
 *   `chrome.i18n.getUILanguage()` for the first-run auto-detect (see
 *   {@link detectBrowserLocale}); the two systems coexist.
 *
 * Adding a language
 * -----------------
 *
 *   See `docs/translations.md`.
 */

import type { LocaleCode, LocaleEntry, Translations } from './types'
import en from './locales/en'
import de from './locales/de'
import es from './locales/es'
import fr from './locales/fr'
import it from './locales/it'
import nl from './locales/nl'
import pt from './locales/pt'
import zh from './locales/zh'
import ja from './locales/ja'

export type { LocaleCode, LocaleEntry, Translations } from './types'

// ─── Registry ───────────────────────────────────────────────────

/**
 * Available locales. English is listed first because it is the
 * fallback; the rest follow native-name alphabetical order so the
 * picker is predictable across runs.
 */
export const LOCALES: readonly LocaleEntry[] = Object.freeze([
  { code: 'en', label: 'English',    translations: en },
  { code: 'de', label: 'Deutsch',    translations: de },
  { code: 'es', label: 'Español',    translations: es },
  { code: 'fr', label: 'Français',   translations: fr },
  { code: 'it', label: 'Italiano',   translations: it },
  { code: 'nl', label: 'Nederlands', translations: nl },
  { code: 'pt', label: 'Português',  translations: pt },
  { code: 'zh', label: '中文',        translations: zh },
  { code: 'ja', label: '日本語',      translations: ja },
])

/** Locale used when nothing matches the browser language. */
export const DEFAULT_LOCALE: LocaleCode = 'en'

// ─── Active locale state ────────────────────────────────────────

let currentCode: LocaleCode = DEFAULT_LOCALE
let currentTranslations: Translations = en

/** Currently active locale code. */
export function getLocale(): LocaleCode {
  return currentCode
}

/**
 * Switch the active locale. Falls back to {@link DEFAULT_LOCALE} for
 * unknown codes. Returns the code that was actually set.
 */
export function setLocale(code: LocaleCode | string): LocaleCode {
  const entry =
    LOCALES.find((l) => l.code === code) ??
    LOCALES.find((l) => l.code === DEFAULT_LOCALE)!
  currentCode = entry.code
  currentTranslations = entry.translations
  return entry.code
}

// ─── Lookup + interpolation ─────────────────────────────────────

/** Values accepted as placeholder substitutions. */
export type I18nParams = Readonly<Record<string, string | number>>

/**
 * Resolve a dotted key like `'header.title'` against the active
 * locale's translations. Returns the key itself when no value is
 * found, which makes a typo obvious in the rendered UI.
 *
 * If `params` is provided, every `{name}` token in the resolved
 * string is replaced with the corresponding param value (or kept as
 * `{name}` literal if the param is missing). Substituted values are
 * HTML-escaped — use {@link tHtml} when you intend `innerHTML`.
 */
export function t(key: string, params?: I18nParams): string {
  const tpl = resolveKey(key)
  return params ? interpolate(tpl, params, escapeHtml) : tpl
}

/**
 * Same as {@link t} but for `innerHTML` consumers: substituted values
 * are inserted verbatim. The caller is responsible for ensuring the
 * inserted fragments are safe (they typically come from constants
 * defined in popup.ts, never from external/user-controlled input).
 */
export function tHtml(key: string, params?: I18nParams): string {
  const tpl = resolveKey(key)
  return params ? interpolate(tpl, params, String) : tpl
}

/**
 * Keys we've already warned about, bounded so a noisy/forgotten call
 * site can't flood the devtools console.
 */
const warnedMissing = new Set<string>()
const WARNED_MISSING_CAP = 64

function resolveKey(key: string): string {
  let val: unknown = currentTranslations
  for (const part of key.split('.')) {
    if (val && typeof val === 'object' && part in (val as Record<string, unknown>)) {
      val = (val as Record<string, unknown>)[part]
    } else {
      warnMissing(key)
      return key
    }
  }
  if (typeof val !== 'string') {
    warnMissing(key)
    return key
  }
  return val
}

function warnMissing(key: string): void {
  if (warnedMissing.has(key)) return
  if (warnedMissing.size >= WARNED_MISSING_CAP) return
  warnedMissing.add(key)
  console.warn(`[gpdt:i18n] missing translation for "${key}" in locale "${currentCode}"`)
}

const PLACEHOLDER = /\{(\w+)\}/g

function interpolate(
  tpl: string,
  params: I18nParams,
  transform: (raw: string) => string,
): string {
  return tpl.replace(PLACEHOLDER, (whole, name) =>
    name in params ? transform(String(params[name])) : whole,
  )
}

/** Minimal HTML escaper for `textContent`-bound substitutions. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ─── DOM application ────────────────────────────────────────────

/**
 * Resolver supplying interpolation params for a given key. Returning
 * `undefined` means "no params" and the translation is used as-is.
 */
export type ParamsResolver = (key: string) => I18nParams | undefined

/**
 * Walk `root` and apply the current locale to every element that
 * declares an i18n binding via one of three data attributes:
 *
 *   - `[data-i18n="key"]`             → element.textContent = t(key)
 *   - `[data-i18n-html="key"]`        → element.innerHTML  = tHtml(key)
 *   - `[data-i18n-attr="attr:key,…"]` → element.setAttribute(attr, t(key))
 *
 * `paramsFor` may be passed to supply `{name}` substitutions on a
 * per-key basis. When omitted, no interpolation is performed.
 */
export function applyTranslations(
  root: ParentNode = document,
  paramsFor?: ParamsResolver,
): void {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n
    if (key) el.textContent = t(key, paramsFor?.(key))
  })

  root.querySelectorAll<HTMLElement>('[data-i18n-html]').forEach((el) => {
    const key = el.dataset.i18nHtml
    if (key) el.innerHTML = tHtml(key, paramsFor?.(key))
  })

  root.querySelectorAll<HTMLElement>('[data-i18n-attr]').forEach((el) => {
    const spec = el.dataset.i18nAttr
    if (!spec) return
    for (const pair of spec.split(',')) {
      const [attr, key] = pair.split(':').map((s) => s.trim())
      if (attr && key) el.setAttribute(attr, t(key, paramsFor?.(key)))
    }
  })
}

// ─── Auto-detect ────────────────────────────────────────────────

/**
 * Best-effort match between a navigator/browser locale (e.g. "fr-CA")
 * and our supported set. Returns {@link DEFAULT_LOCALE} if no match.
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
    const found = LOCALES.find((l) => l.code === short)
    if (found) return found.code
  }
  return DEFAULT_LOCALE
}
