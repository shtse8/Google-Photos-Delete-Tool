/**
 * Google Photos DOM selectors with fallbacks.
 *
 * Google frequently changes class names. Each selector has a primary and
 * fallback list. The query helpers try each in order and log warnings
 * when the primary fails but a fallback succeeds.
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
  photoContainer: {
    name: 'Photo container',
    primary: '.yDSiEe.uGCjIb.zcLWac.eejsDc.TWmIyd',
    fallbacks: [
      '.yDSiEe.uGCjIb.zcLWac',
      '[role="list"]',
      '[role="grid"]',
    ],
  },
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
export function queryOne(def: SelectorDef): Element | null {
  const primary = document.querySelector(def.primary)
  if (primary) return primary

  for (const fallback of def.fallbacks) {
    const el = document.querySelector(fallback)
    if (el) {
      const key = `${def.name}:${fallback}`
      if (!warnedFallbacks.has(key)) {
        warnedFallbacks.add(key)
        console.warn(
          `[Selectors] Primary selector for "${def.name}" failed (${def.primary}), ` +
          `using fallback: ${fallback}`
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
export function queryAll(def: SelectorDef): Element[] {
  const primary = [...document.querySelectorAll(def.primary)]
  if (primary.length > 0) return primary

  for (const fallback of def.fallbacks) {
    const els = [...document.querySelectorAll(fallback)]
    if (els.length > 0) {
      const key = `${def.name}:${fallback}`
      if (!warnedFallbacks.has(key)) {
        warnedFallbacks.add(key)
        console.warn(
          `[Selectors] Primary selector for "${def.name}" failed (${def.primary}), ` +
          `using fallback: ${fallback}`
        )
      }
      return els
    }
  }

  return []
}
