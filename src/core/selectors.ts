/**
 * Google Photos DOM selectors with fallbacks.
 *
 * Google frequently changes class names AND localizes button labels.
 * Each CSS selector has a primary and fallback list. For action buttons
 * we also use keyword-based matching (aria-label / tooltip / text content,
 * normalized and matched against multilingual keyword lists) so the tool
 * works regardless of UI language.
 */

export interface SelectorDef {
  /** Human-readable name for logging */
  name: string
  /** Primary selector (most specific) */
  primary: string
  /** Fallback selectors, tried in order */
  fallbacks: string[]
}

export const SELECTOR_DEFS = {
  counter: {
    name: 'Selected photo count',
    primary: '.rtExYb',
    fallbacks: [
      '[data-selection-count]',
      '.Mfixef .rtExYb',
    ],
  },
  checkbox: {
    name: 'Photo checkbox',
    primary: '.ckGgle[aria-checked=false]',
    fallbacks: [
      '[role="checkbox"][aria-checked="false"]',
      '[data-lat][aria-checked="false"]',
    ],
  },
  checkboxChecked: {
    name: 'Photo checkbox (checked)',
    primary: '.ckGgle[aria-checked=true]',
    fallbacks: [
      '[role="checkbox"][aria-checked="true"]',
      '[data-lat][aria-checked="true"]',
    ],
  },
  photoContainer: {
    name: 'Photo container',
    primary: '.yDSiEe.uGCjIb.zcLWac.eejsDc.TWmIyd',
    fallbacks: [
      '.yDSiEe.uGCjIb.zcLWac',
      '[role="main"]',
      '[role="list"]',
      '[role="grid"]',
    ],
  },
  /**
   * Toolbar delete button — kept for backward compatibility. Prefer
   * findDeleteToolbarButton() which is locale-aware.
   */
  deleteButton: {
    name: 'Delete button',
    primary: 'button[aria-label="Move to trash"]',
    fallbacks: [
      'button[aria-label="Delete"]',
      'button[data-delete-origin]',
    ],
  },
} as const satisfies Record<string, SelectorDef>

/** Simple backward-compatible flat selectors (primary only) */
export const SELECTORS = {
  counter: SELECTOR_DEFS.counter.primary,
  checkbox: SELECTOR_DEFS.checkbox.primary,
  photoContainer: SELECTOR_DEFS.photoContainer.primary,
  deleteButton: SELECTOR_DEFS.deleteButton.primary,
} as const

const warnedFallbacks = new Set<string>()

/**
 * Query a single element using a SelectorDef, trying primary first,
 * then fallbacks. Logs a warning when a fallback is used.
 */
export function queryOne(def: SelectorDef, root: ParentNode = document): Element | null {
  const primary = root.querySelector(def.primary)
  if (primary) return primary

  for (const fallback of def.fallbacks) {
    const el = root.querySelector(fallback)
    if (el) {
      const key = `${def.name}:${fallback}`
      if (!warnedFallbacks.has(key)) {
        warnedFallbacks.add(key)
        console.warn(
          `[gpdt:selectors] primary selector for "${def.name}" failed (${def.primary}), ` +
          `using fallback: ${fallback}`,
        )
      }
      return el
    }
  }

  return null
}

/**
 * Query all elements using a SelectorDef, trying primary first,
 * then fallbacks.
 */
export function queryAll(def: SelectorDef, root: ParentNode = document): Element[] {
  const primary = [...root.querySelectorAll(def.primary)]
  if (primary.length > 0) return primary

  for (const fallback of def.fallbacks) {
    const els = [...root.querySelectorAll(fallback)]
    if (els.length > 0) {
      const key = `${def.name}:${fallback}`
      if (!warnedFallbacks.has(key)) {
        warnedFallbacks.add(key)
        console.warn(
          `[gpdt:selectors] primary selector for "${def.name}" failed (${def.primary}), ` +
          `using fallback: ${fallback}`,
        )
      }
      return els
    }
  }

  return []
}

// ─── Locale-aware action button finding ────────────────────────────

/**
 * Keywords that indicate a destructive "delete" / "trash" action.
 * Already lowercase and ASCII-folded (no diacritics) so they match
 * against the normalized form of an element's label.
 */
export const DELETE_KEYWORDS: readonly string[] = Object.freeze([
  // English
  'trash', 'bin', 'delete', 'remove',
  // French
  'corbeille', 'supprimer', 'supprime',
  // Spanish
  'papelera', 'eliminar', 'borrar',
  // German (ö → o after stripping diacritics)
  'papierkorb', 'loschen', 'entfernen',
  // Italian
  'cestino', 'elimina', 'rimuovi',
  // Portuguese
  'lixo', 'lixeira', 'excluir', 'remover',
  // Dutch
  'prullenbak', 'verwijder',
  // Polish (ń → n after stripping)
  'kosz', 'usun',
  // Czech / Slovak
  'kos', 'odstranit', 'smazat',
  // Romanian
  'sterge',
  // Scandinavian
  'papirkorg', 'papperskorg', 'slett', 'radera', 'roskakori', 'poista',
  // Greek
  'διαγραφ', 'κάδος', 'καδος', 'σκουπιδ',
  // Russian / Ukrainian
  'корзин', 'удалить', 'кошик', 'видалити',
  // Turkish — only long enough labels to avoid false-positive substring
  // matches (e.g. "cop" would match "copy" in any English UI string).
  'silmek', 'kaldir',
  // CJK (no diacritic stripping needed)
  'ゴミ箱', '削除', 'ごみ箱',
  '휴지통', '삭제',
  '回收站', '废纸篓', '垃圾桶', '删除', '刪除',
  // Hebrew
  'אשפה', 'מחק',
  // Arabic
  'مهملات', 'حذف',
])

/**
 * Keywords that indicate a cancel / dismiss / close action.
 * Used to negatively score buttons inside a dialog so we don't
 * accidentally click "Cancel" instead of "Confirm".
 *
 * IMPORTANT: substring matching is used, so very short keywords
 * (≤2 chars in Latin script) are intentionally excluded to avoid
 * false positives. E.g. `'no'` would match "ces**no**", `'back'`
 * would match "**back**ground".
 */
export const CANCEL_KEYWORDS: readonly string[] = Object.freeze([
  'cancel', 'dismiss', 'close',
  'annuler', 'fermer', 'retour',
  'cancelar', 'cerrar',
  'abbrechen', 'schliessen', 'nein',
  'annulla', 'chiudi', 'indietro',
  'annuleren', 'sluiten',
  'anuluj', 'zamknij', 'wstecz',
  'zrusit', 'zavrit',
  'avbryt', 'stang', 'tilbake',
  'avbryta', 'avsluta',
  'peruuta', 'sulje',
  'ακύρωση', 'ακυρωση',
  'отмена', 'закрыть', 'скасувати',
  'iptal', 'kapat',
  'キャンセル', '閉じる', '戻る',
  '취소', '닫기',
  '取消', '关闭', '關閉',
  'ביטול', 'סגור',
  'إلغاء', 'إغلاق',
])

/** Matches the Unicode block of Latin combining diacritical marks (U+0300..U+036F). */
const COMBINING_DIACRITICS = /[̀-ͯ]/g

/**
 * Lowercase + strip Latin combining diacritics, then re-compose so that
 * CJK characters (which NFD decomposes into base + combining-voicing-mark
 * outside the Latin block) survive unchanged. Safe for null/undefined.
 *
 * Examples:
 *   normalizeText('Déplacer') === 'deplacer'
 *   normalizeText('Löschen')  === 'loschen'
 *   normalizeText('ゴミ箱')   === 'ゴミ箱'
 *   normalizeText('취소')      === '취소'
 */
export function normalizeText(s: string | null | undefined): string {
  if (!s) return ''
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS, '')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim()
}

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
 * substring. Both sides are normalized via {@link normalizeText} so the
 * comparison works for Latin (case + diacritic insensitive) and CJK
 * (precomposed/decomposed insensitive).
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
 * photos are selected. Tries fast CSS selectors first, then falls back
 * to scanning all buttons by accessible label / tooltip / text and
 * matching against multilingual keyword lists.
 *
 * Returns null if no candidate is found (caller should retry / wait).
 */
export function findDeleteToolbarButton(): HTMLElement | null {
  // Fast path: CSS selectors (covers English UI quickly).
  const cssCandidates: string[] = [
    'button[aria-label="Move to trash"]',
    'button[aria-label="Delete"]',
    'button[data-delete-origin]',
  ]
  for (const sel of cssCandidates) {
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
    if (containsAnyKeyword(candidate, DELETE_KEYWORDS)) {
      return btn
    }
  }

  return null
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
 * confirm button). Filters out cancel-like buttons, prefers ones whose
 * label matches a delete keyword. Falls back to the last non-cancel
 * button if no keyword match (Material Design typically places the
 * primary action last).
 */
export function findConfirmButton(dialog: HTMLElement): HTMLElement | null {
  const buttons = [
    ...dialog.querySelectorAll<HTMLElement>('button, [role="button"]'),
  ].filter(isVisible)
  if (buttons.length === 0) return null

  const scored = buttons.map(btn => ({ btn, score: scoreActionButton(btn) }))
  scored.sort((a, b) => b.score - a.score)
  if (scored[0].score > 0) return scored[0].btn

  // No positive keyword match — fall back to the last non-cancel button.
  const nonCancel = buttons.filter(btn => {
    const candidate = getButtonTextCandidates(btn)
    return !containsAnyKeyword(candidate, CANCEL_KEYWORDS)
  })
  return nonCancel[nonCancel.length - 1] ?? null
}
