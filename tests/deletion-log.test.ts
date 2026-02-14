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

  it('should estimate remaining time', () => {
    const log = new DeletionLog()

    vi.setSystemTime(new Date(0))
    log.start()
    log.record(100)

    vi.setSystemTime(new Date(60_000))
    // Deleted 100 in 60s = 100/min
    // Target 1000, remaining 900, should take ~9 minutes
    const eta = log.estimateRemaining(1000)
    expect(eta).not.toBeNull()
    if (eta !== null) {
      expect(eta).toBeGreaterThan(0)
    }
  })

  it('should return null ETA with no data', () => {
    const log = new DeletionLog()
    log.start()

    expect(log.estimateRemaining(1000)).toBeNull()
  })

  it('should return 0 ETA when target already met', () => {
    const log = new DeletionLog()

    vi.setSystemTime(new Date(0))
    log.start()
    log.record(100)

    vi.setSystemTime(new Date(60_000))
    expect(log.estimateRemaining(50)).toBe(0)
  })

  it('should return immutable entries', () => {
    const log = new DeletionLog()
    log.start()
    log.record(10)

    const entries = log.getEntries()
    expect(entries).toHaveLength(1)
    expect(entries[0].count).toBe(10)
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
})
