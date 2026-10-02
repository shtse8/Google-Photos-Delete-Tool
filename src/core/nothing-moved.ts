import type { Progress } from './delete-engine'

/**
 * A real (non-preview) run that ended `done` with nothing moved to Trash.
 * The engine marks it (`nothingMoved`); preview and empty-trash runs never
 * are. The engine already fails closed when it clicked checkboxes that never
 * registered; this covers the rest (nothing selectable was found), so the UI
 * never says a plain "Done" for a run that did nothing.
 */
export function endedWithNothingMoved(p: Pick<Progress, 'status' | 'deleted' | 'nothingMoved'>): boolean {
  return p.status === 'done' && p.deleted === 0 && p.nothingMoved === true
}

/** English text for surfaces outside the popup i18n (userscript panel, finder). */
export const NOTHING_MOVED_TEXT =
  'Nothing was selected, so nothing was moved to Trash. The page may have changed — use Report issue to send the details.'
