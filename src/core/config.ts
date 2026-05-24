export interface Config {
  /**
   * Maximum photos to select per batch (also the run target).
   * Special value: **0** means "no batch cap" — the engine selects as
   * many as Google Photos lets it click in one go (their UI caps the
   * counter around ~500), flushes that batch on every stall, and
   * keeps going until the gallery is truly empty.
   */
  maxCount: number
  /** Default long-running timeout for waiting operations (ms). */
  timeout: number
  /** Delay between poll attempts (ms). */
  pollDelay: number
  /** Dry run mode — count photos without deleting. */
  dryRun: boolean
  /**
   * Shorter timeout for finding action elements (delete button, dialog,
   * confirm button). Falls back to `timeout` if not set. Default: 15s.
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
   * Milliseconds to wait after clicking checkboxes for the selected
   * count to update in the toolbar. Default: 200ms.
   */
  selectionSettleMs: number
}

export const DEFAULT_CONFIG: Config = {
  // 500 is roughly the largest batch Google Photos will keep counting
  // before its selection counter plateaus — picking the practical cap
  // as default avoids users entering 10000 and being silently capped.
  maxCount: 500,
  timeout: 600_000,
  pollDelay: 300,
  dryRun: false,
  actionTimeout: 15_000,
  endOfListAttempts: 3,
  scrollSettleMs: 1500,
  selectionSettleMs: 200,
}
