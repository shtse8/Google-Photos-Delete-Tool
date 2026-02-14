export interface Config {
  /** Maximum photos to delete per run */
  maxCount: number
  /** Timeout for waiting operations (ms) */
  timeout: number
  /** Delay between poll attempts (ms) */
  pollDelay: number
  /** Dry run mode — count photos without deleting */
  dryRun: boolean
}

export const DEFAULT_CONFIG: Config = {
  maxCount: 10_000,
  timeout: 600_000,
  pollDelay: 300,
  dryRun: false,
}
