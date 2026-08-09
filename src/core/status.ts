/**
 * Unified run-status model shared by the engine, content orchestration,
 * popup, and the floating panel. One type, no drifting per-surface unions.
 */
export type RunStatus =
  | 'idle'
  | 'selecting'
  | 'deleting'
  | 'scrolling'
  | 'paused'
  | 'done'
  | 'error'
  | 'navigatingTrash'
  | 'emptyingTrash'

/** Statuses where the engine is actively working (spinner/indeterminate). */
export const ACTIVE_STATUSES: ReadonlySet<RunStatus> = new Set([
  'selecting',
  'deleting',
  'scrolling',
  'navigatingTrash',
  'emptyingTrash',
])

/** Terminal statuses — elapsed should freeze at the run duration. */
export const TERMINAL_STATUSES: ReadonlySet<RunStatus> = new Set(['done', 'error', 'idle'])
