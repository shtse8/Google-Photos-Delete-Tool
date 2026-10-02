/**
 * The canary must never delete anything. Two layers:
 *  1. `assertSafeClick` is the only way the runner clicks, and it refuses any
 *     selector that is a pack-owned destructive control or carries a delete or
 *     empty-trash keyword.
 *  2. `GUARD_SCRIPT` runs inside the page and swallows (and counts) any click
 *     that lands on a destructive control or inside a dialog, so even a wrong
 *     match cannot reach Google's delete flow.
 */
import { PACK } from '../../src/core/selector-pack'

export function destructiveSelectors(): string[] {
  return [...PACK.actionButtons.toolbarDelete, ...PACK.actionButtons.emptyTrash]
}

const strip = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

/** Throws unless clicking `selector` is allowed: it must be a plain selection checkbox selector. */
export function assertSafeClick(selector: string): void {
  const sel = strip(selector)
  if (destructiveSelectors().some((d) => strip(d) === sel)) {
    throw new Error('canary safety: refusing to click a pack-owned destructive control')
  }
  if (/delete|trash|bin\b|remove|empty|dialog|confirm/.test(sel)) {
    throw new Error('canary safety: refusing to click a selector that names a destructive control')
  }
}

/** Source of an init script that blocks destructive clicks in the page. Arguments are inlined JSON. */
export function guardScript(): string {
  const selectors = JSON.stringify(destructiveSelectors().concat(['[role="dialog"] *', '[role="alertdialog"] *', '[aria-modal="true"] *']))
  return `(() => {
  const blocked = []
  window.__canaryBlocked = blocked
  const sels = ${selectors}
  const hit = (el) => sels.some((s) => { try { return !!(el.closest && el.closest(s)) } catch { return false } })
  for (const type of ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'auxclick', 'dblclick']) {
    window.addEventListener(type, (e) => {
      if (hit(e.target)) { e.preventDefault(); e.stopImmediatePropagation(); blocked.push(type) }
    }, true)
  }
})()`
}
