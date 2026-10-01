/**
 * Store-facing locales (`_locales/<code>/messages.json`).
 *
 * Chrome shows the manifest's localized name and description per user
 * locale in the Web Store and in chrome://extensions. Codes must be from
 * Chrome's supported list (`pt_BR`, `zh_CN`, `zh_TW`, ...):
 * https://developer.chrome.com/docs/extensions/reference/api/i18n#locales
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

export const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)))
export const DEFAULT_LOCALE = 'en'

/** Store limits per message key (characters). */
export const MESSAGE_LIMITS = {
  appName: 75, // Chrome Web Store title
  appNameEdge: 45, // Edge Partner Center name; also used by the Firefox build (AMO max 50)
  appShortName: 12, // Chrome short_name
  appDescription: 132, // Chrome manifest description
  appActionTitle: 75, // toolbar tooltip: same cap as the name
} as const

export type MessageKey = keyof typeof MESSAGE_LIMITS
export const MESSAGE_KEYS = Object.keys(MESSAGE_LIMITS) as MessageKey[]

export type Messages = Record<string, { message: string; description?: string; placeholders?: unknown }>

export function localeCodes(root = ROOT): string[] {
  const dir = resolve(root, '_locales')
  return readdirSync(dir)
    .filter((d) => existsSync(resolve(dir, d, 'messages.json')))
    .sort()
}

export function readMessages(code: string, root = ROOT): Messages {
  return JSON.parse(readFileSync(resolve(root, '_locales', code, 'messages.json'), 'utf-8'))
}

/** Problems with one locale's messages; empty when it is valid. */
export function messageProblems(code: string, msgs: Messages): string[] {
  const out: string[] = []
  for (const key of MESSAGE_KEYS) {
    const text = msgs[key]?.message
    if (typeof text !== 'string' || text.length === 0) {
      out.push(`${code}.${key} missing or empty`)
    } else if (text.length > MESSAGE_LIMITS[key]) {
      out.push(`${code}.${key} is ${text.length} chars (max ${MESSAGE_LIMITS[key]})`)
    }
  }
  for (const [key, entry] of Object.entries(msgs)) {
    // Chrome: message keys are [A-Za-z0-9_@]; placeholders ($name$) need a
    // placeholders block; a bare `$` must be written `$$`.
    if (!/^[A-Za-z0-9_@]+$/.test(key)) out.push(`${code}.${key} is not a valid message name`)
    const message = entry.message ?? ''
    const tokens = [...message.replace(/\$\$/g, '').matchAll(/\$([A-Za-z0-9_@]+)\$/g)].map((x) => x[1].toLowerCase())
    const declared = Object.keys((entry.placeholders ?? {}) as object).map((p) => p.toLowerCase())
    for (const t of tokens) if (!declared.includes(t)) out.push(`${code}.${key} uses $${t}$ without a placeholder`)
    if (message.replace(/\$\$/g, '').replace(/\$[A-Za-z0-9_@]+\$/g, '').includes('$')) out.push(`${code}.${key} has a stray $`)
  }
  return out
}
