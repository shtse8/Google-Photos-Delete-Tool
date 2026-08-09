/**
 * Google Photos DOM finders.
 *
 * All selectors, action-button candidates, and keyword lists come from
 * the versioned selector pack (`src/selector-packs/pack-v1.json`).
 *
 * Safety model: destructive actions require a POSITIVE keyword match
 * (fail closed — we never guess "the last non-cancel button"). Each
 * finder records what it observed into the shared diagnostics collector
 * so a "Report issue" submission carries the exact drift evidence.
 */

import { PACK, type SelectorDef } from './selector-pack'
import { diagnostics } from './diagnostics'

export type { SelectorDef }
export { PACK_VERSION } from './selector-pack'

export const SELECTOR_DEFS: Record<'counter' | 'checkbox' | 'checkboxChecked' | 'photoContainer', SelectorDef> =
  PACK.selectors

export const TOOLBAR_DELETE_CANDIDATES: readonly string[] = Object.freeze([...PACK.actionButtons.toolbarDelete])
export const EMPTY_TRASH_CANDIDATES: readonly string[] = Object.freeze([...PACK.actionButtons.emptyTrash])

export const DELETE_KEYWORDS: readonly string[] = Object.freeze([...PACK.keywords.delete])
export const CANCEL_KEYWORDS: readonly string[] = Object.freeze([...PACK.keywords.cancel])
export const CONTEXTUAL_REMOVE_KEYWORDS: readonly string[] = Object.freeze([...PACK.keywords.contextualRemove])
export const EMPTY_TRASH_PHRASES: readonly string[] = Object.freeze([...PACK.keywords.emptyTrashPhrases])
export const TRASH_EMPTY_SIGNALS: readonly string[] = Object.freeze([...PACK.trashEmptySignals])

/**
 * Cache of "I already warned about this fallback" keys, bounded so it
 * cannot grow without limit on a long-running content script.
 */
const FALLBACK_WARN_CAP = 32
const warnedFallbacks = new Set<string>()

function warnFallback(def: SelectorDef, fallback: string): void {
  const key = `${def.name}:${fallback}`
  if (warnedFallbacks.has(key)) return
  if (warnedFallbacks.size >= FALLBACK_WARN_CAP) return
  warnedFallbacks.add(key)
  console.warn(
    `[gpdt:selectors] primary selector for "${def.name}" failed (${def.primary}), ` +
    `using fallback: ${fallback}`,
  )
}

/**
 * Query a single element using a SelectorDef, trying primary first,
 * then fallbacks. Records the outcome into diagnostics.
 */
export function queryOne(def: SelectorDef, root: ParentNode = document): Element | null {
  const primary = root.querySelector(def.primary)
  if (primary) {
    diagnostics.recordSelector(def.name, 'primary')
    return primary
  }

  for (const fallback of def.fallbacks) {
    const el = root.querySelector(fallback)
    if (el) {
      warnFallback(def, fallback)
      diagnostics.recordSelector(def.name, 'fallback', fallback)
      return el
    }
  }

  diagnostics.recordSelector(def.name, 'none')
  return null
}

/**
 * Query all elements using a SelectorDef, trying primary first,
 * then fallbacks. Records the outcome into diagnostics.
 */
export function queryAll(def: SelectorDef, root: ParentNode = document): Element[] {
  const primary = [...root.querySelectorAll(def.primary)]
  if (primary.length > 0) {
    diagnostics.recordSelector(def.name, 'primary')
    return primary
  }

  for (const fallback of def.fallbacks) {
    const els = [...root.querySelectorAll(fallback)]
    if (els.length > 0) {
      warnFallback(def, fallback)
      diagnostics.recordSelector(def.name, 'fallback', fallback)
      return els
    }
  }

  diagnostics.recordSelector(def.name, 'none')
  return []
}

// ─── Text normalization & keyword matching ────────────────────────

/**
 * Lowercase + strip Latin combining diacritics, then re-compose so that
 * CJK characters (which NFD decomposes into base + combining-voicing-mark
 * outside the Latin block) survive unchanged. Safe for null/undefined.
 */
export function normalizeText(s: string | null | undefined): string {
  if (!s) return ''
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS, '')
    .normalize('NFC')
    .replace(/[\u2019']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const COMBINING_DIACRITICS = /[\u0300-\u036f]/g

/** Cache normalized keyword lists by array reference for performance. */
const normCache = new WeakMap<readonly string[], string[]>()
function getNormalizedKeywords(keywords: readonly string[]): string[] {
  let cached = normCache.get(keywords)
  if (!cached) {
    cached = keywords.map(normalizeText).filter(k => k.length > 0)
    normCache.set(keywords, cached)
  }
  return cached
}

/**
 * True if the normalized form of `text` contains any of `keywords` as a
 * substring. Both sides are normalized so the comparison works for Latin
 * (case + diacritic insensitive) and CJK (precomposed/decomposed insensitive).
 */
export function containsAnyKeyword(text: string | null | undefined, keywords: readonly string[]): boolean {
  const normalized = normalizeText(text)
  if (!normalized) return false
  const normKeywords = getNormalizedKeywords(keywords)
  return normKeywords.some(k => normalized.includes(k))
}

/**
 * Collect all candidate texts on an element that a human user would read
 * to decide what the button does: aria-label, data-tooltip, title, text content.
 */
export function getButtonTextCandidates(el: Element): string {
  const parts: string[] = []
  const al = el.getAttribute?.('aria-label')
  if (al) parts.push(al)
  const dt = el.getAttribute?.('data-tooltip')
  if (dt) parts.push(dt)
  const title = el.getAttribute?.('title')
  if (title) parts.push(title)
  const text = (el as HTMLElement).textContent?.trim()
  if (text) parts.push(text)
  return parts.join(' ')
}

function isVisible(el: Element): boolean {
  if (typeof window === 'undefined') return true
  const he = el as HTMLElement
  if (!he.isConnected) return false
  const rect = he.getBoundingClientRect?.()
  if (rect && rect.width === 0 && rect.height === 0) return false
  if (he.hidden) return false
  const style = window.getComputedStyle?.(he)
  if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) {
    return false
  }
  return true
}

function isInsideDialog(el: Element): boolean {
  return !!el.closest('[role="dialog"], [role="alertdialog"], [aria-modal="true"]')
}

/** Score a button: higher = more likely the destructive action. */
export function scoreActionButton(
  el: Element,
  positive: readonly string[] = DELETE_KEYWORDS,
  negative: readonly string[] = CANCEL_KEYWORDS,
): number {
  const candidate = getButtonTextCandidates(el)
  let score = 0
  if (containsAnyKeyword(candidate, positive)) score += 100
  if (containsAnyKeyword(candidate, negative)) score -= 1000
  return score
}

/**
 * Find the toolbar "delete / move to trash" button that appears after
 * photos are selected. Tries fast CSS candidates first, then falls back
 * to scanning all buttons by accessible label / tooltip / text and
 * matching against multilingual keyword lists.
 *
 * Returns null if no candidate is found (caller should retry / wait).
 */
export function findDeleteToolbarButton(): HTMLElement | null {
  // Fast path: CSS candidates (covers English UI quickly).
  for (const sel of TOOLBAR_DELETE_CANDIDATES) {
    const el = document.querySelector<HTMLButtonElement>(sel)
    if (el && isVisible(el) && !isInsideDialog(el)) return el
  }

  // Locale-aware path: only scan generic buttons after at least one
  // photo is selected. Without this guard a page-level button such as
  // "Remove from album" could be considered before Google Photos has
  // actually exposed the selected-items toolbar.
  if (queryAll(SELECTOR_DEFS.checkboxChecked).length === 0) {
    return null
  }

  const scored = [
    ...document.querySelectorAll<HTMLElement>('button, [role="button"]'),
  ]
    .filter(btn => isVisible(btn) && !isInsideDialog(btn))
    .map(btn => ({
      btn,
      label: getButtonTextCandidates(btn),
      score: scoreActionButton(btn),
    }))
    .filter(({ label }) => label && !containsAnyKeyword(label, CONTEXTUAL_REMOVE_KEYWORDS))
    .sort((a, b) => b.score - a.score)

  return scored[0]?.score > 0 ? scored[0].btn : null
}

/**
 * Find the "Empty trash" toolbar button visible on the /trash page.
 * Uses the multi-phrase keyword list so we don't accidentally match
 * "Delete forever" (which also lives on /trash).
 */
export function findEmptyTrashButton(): HTMLElement | null {
  // Fast path: well-known English aria-labels.
  for (const sel of EMPTY_TRASH_CANDIDATES) {
    const el = document.querySelector<HTMLButtonElement>(sel)
    if (el && isVisible(el) && !isInsideDialog(el)) return el
  }

  // Locale-aware path: scan all buttons.
  const allButtons = [
    ...document.querySelectorAll<HTMLElement>('button, [role="button"]'),
  ]
  for (const btn of allButtons) {
    if (!isVisible(btn)) continue
    if (isInsideDialog(btn)) continue
    const candidate = getButtonTextCandidates(btn)
    if (!candidate) continue
    if (containsAnyKeyword(candidate, EMPTY_TRASH_PHRASES)) {
      return btn
    }
  }

  return null
}

/**
 * True when the /trash page is already empty (empty-state message
 * present and no "Empty trash" button visible). Used by the empty-trash
 * flow so an already-empty trash resolves to `done` instead of error.
 */
export function isTrashEmpty(): boolean {
  if (findEmptyTrashButton()) return false
  const bodyText = typeof document !== 'undefined' ? (document.body?.innerText ?? '') : ''
  return containsAnyKeyword(bodyText, TRASH_EMPTY_SIGNALS)
}

/**
 * Find a currently-open confirmation dialog. Returns the topmost
 * visible one (highest z-index) when multiple are open.
 */
export function findConfirmDialog(): HTMLElement | null {
  const candidates = [
    ...document.querySelectorAll<HTMLElement>(
      '[role="dialog"], [role="alertdialog"], [aria-modal="true"]',
    ),
  ].filter(isVisible)
  if (candidates.length === 0) return null
  if (candidates.length === 1) return candidates[0]
  candidates.sort((a, b) => {
    const za = parseInt(window.getComputedStyle(a).zIndex, 10) || 0
    const zb = parseInt(window.getComputedStyle(b).zIndex, 10) || 0
    return zb - za
  })
  return candidates[0]
}

/**
 * Find the destructive-action button inside a dialog (e.g. "Move to trash"
 * confirm button). Filters out cancel-like buttons and returns only a
 * positive destructive keyword match. For a bulk-delete tool, guessing the
 * last non-cancel button is not safe enough.
 */
export function findConfirmButton(dialog: HTMLElement): HTMLElement | null {
  const buttons = [
    ...dialog.querySelectorAll<HTMLElement>('button, [role="button"]'),
  ].filter(isVisible)
  if (buttons.length === 0) return null

  const scored = buttons.map(btn => ({ btn, score: scoreActionButton(btn) }))
  scored.sort((a, b) => b.score - a.score)
  return scored[0].score > 0 ? scored[0].btn : null
}
