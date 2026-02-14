/**
 * Tracks deletion activity with timestamps.
 * Used for rate calculation, ETA estimation, and audit logging.
 */

export interface DeletionEntry {
  /** Number of photos deleted in this batch */
  count: number
  /** Timestamp when the batch was deleted */
  timestamp: number
}

export class DeletionLog {
  private entries: DeletionEntry[] = []
  private startTime = 0

  /** Record the start of a deletion run. */
  start(): void {
    this.entries = []
    this.startTime = Date.now()
  }

  /** Record a batch deletion. */
  record(count: number): void {
    if (count <= 0) return
    this.entries.push({ count, timestamp: Date.now() })
  }

  /** Total photos deleted across all batches. */
  get totalDeleted(): number {
    return this.entries.reduce((sum, e) => sum + e.count, 0)
  }

  /** Number of batches recorded. */
  get batchCount(): number {
    return this.entries.length
  }

  /** Elapsed time in milliseconds since start(). */
  get elapsed(): number {
    return this.startTime > 0 ? Date.now() - this.startTime : 0
  }

  /**
   * Deletion rate in photos per minute.
   * Uses a sliding window of the last `windowMs` milliseconds for accuracy.
   */
  ratePerMinute(windowMs = 120_000): number {
    const now = Date.now()
    const windowStart = now - windowMs

    const recentEntries = this.entries.filter(e => e.timestamp >= windowStart)
    if (recentEntries.length === 0) return 0

    const recentCount = recentEntries.reduce((sum, e) => sum + e.count, 0)
    const windowElapsed = now - recentEntries[0].timestamp

    if (windowElapsed <= 0) return 0
    return (recentCount / windowElapsed) * 60_000
  }

  /**
   * Estimated time remaining in milliseconds, given a target count.
   * Returns null if insufficient data for estimation.
   */
  estimateRemaining(targetCount: number): number | null {
    const rate = this.ratePerMinute()
    if (rate <= 0) return null

    const remaining = targetCount - this.totalDeleted
    if (remaining <= 0) return 0

    return (remaining / rate) * 60_000
  }

  /** Get a copy of all recorded entries. */
  getEntries(): readonly DeletionEntry[] {
    return [...this.entries]
  }
}
