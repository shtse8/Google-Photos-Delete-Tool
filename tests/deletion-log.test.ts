import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DeletionLog } from '../src/core/deletion-log'

describe('DeletionLog', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should start with zero state', () => {
    const log = new DeletionLog()
    expect(log.totalDeleted).toBe(0)
    expect(log.batchCount).toBe(0)
    expect(log.elapsed).toBe(0)
  })

  it('should track batch deletions', () => {
    const log = new DeletionLog()
    log.start()

    log.record(50)
    log.record(75)
    log.record(25)

    expect(log.totalDeleted).toBe(150)
    expect(log.batchCount).toBe(3)
  })

  it('should ignore zero/negative counts', () => {
    const log = new DeletionLog()
    log.start()

    log.record(0)
    log.record(-5)

    expect(log.totalDeleted).toBe(0)
    expect(log.batchCount).toBe(0)
  })

  it('should track elapsed time', () => {
    const log = new DeletionLog()

    vi.setSystemTime(new Date(1000))
    log.start()

    vi.setSystemTime(new Date(6000))
    expect(log.elapsed).toBe(5000)
  })

  it('should calculate rate per minute', () => {
    const log = new DeletionLog()

    vi.setSystemTime(new Date(0))
    log.start()

    // Delete 60 photos over 1 minute
    vi.setSystemTime(new Date(0))
    log.record(60)

    vi.setSystemTime(new Date(60_000))
    // Rate should be ~60/min
    const rate = log.ratePerMinute()
    expect(rate).toBeGreaterThan(0)
  })

  it('should reset on start()', () => {
    const log = new DeletionLog()
    log.start()
    log.record(100)

    expect(log.totalDeleted).toBe(100)

    log.start()
    expect(log.totalDeleted).toBe(0)
    expect(log.batchCount).toBe(0)
  })

  it('ratePerMinute does not spike artificially on the first batch', () => {
    // Regression: the denominator used to be `now - oldestEntry`,
    // which for the very first batch (say, 1 s old) of 100 deletions
    // returned 100 * 60 = 6000 photos/min. The window-bounded
    // denominator caps that to the realistic ~100/min.
    const log = new DeletionLog()
    vi.setSystemTime(new Date(1_000_000))
    log.start()

    // Long pause — engine sat idle for 60 s.
    vi.setSystemTime(new Date(1_060_000))
    log.record(100)

    // Measure 1 s after that batch.
    vi.setSystemTime(new Date(1_061_000))
    const rate = log.ratePerMinute() // default window = 120 s

    expect(rate).toBeGreaterThan(50)
    expect(rate).toBeLessThan(120)
  })
})
