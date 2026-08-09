export interface Config {
  /** Maximum photos to select per batch. Must be > 0. */
  maxCount: number
  /** Delay between poll attempts (ms). */
  pollDelay: number
  /** Dry run mode — count photos without deleting. */
  dryRun: boolean
  /**
   * Shorter timeout for finding action elements (delete button, dialog,
   * confirm button). Default: 15s.
   */
  actionTimeout: number
  /**
   * Number of consecutive iterations without scroll/selection progress
   * before concluding we've reached the end of the gallery. Default: 3.
   */
  endOfListAttempts: number
  /**
   * Milliseconds to wait after each scroll attempt for the page to
   * load new content (Google Photos virtualizes the grid). Default: 1500ms.
   */
  scrollSettleMs: number
  /**
   * Milliseconds budget for the wave-selection settle loop. Default: 200ms.
   */
  selectionSettleMs: number
}

export const DEFAULT_CONFIG: Config = {
  // Default batch size: 500.
  //
  // Empirically, Google Photos' selection counter plateaus around this
  // number — additional clicks no longer increment it, even though
  // photos appear to be selected visually. Older versions defaulted to
  // 10_000 and silently hit that ceiling on most accounts, which is
  // what caused the "stuck scrolling forever" bug.
  //
  // Picking the practical ceiling as default keeps the loop responsive
  // (a delete dialog every ~500 photos rather than every ~10_000) and
  // matches what the UI actually accepts.
  maxCount: 500,
  pollDelay: 300,
  dryRun: false,
  actionTimeout: 15_000,
  endOfListAttempts: 3,
  scrollSettleMs: 1500,
  selectionSettleMs: 200,
}
