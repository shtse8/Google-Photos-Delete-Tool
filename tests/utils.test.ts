import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sleep, waitUntil, formatElapsed, formatEta, retryWithBackoff } from '../src/core/utils'

describe('sleep', () => {
  it('should resolve after the specified delay', async () => {
    const start = Date.now()
    await sleep(50)
    const elapsed = Date.now() - start
    expect(elapsed).toBeGreaterThanOrEqual(40) // Allow some slack
  })
})

describe('waitUntil', () => {
  it('should return immediately when condition is truthy', async () => {
    const result = await waitUntil(() => 'found', 1000, 10)
    expect(result).toBe('found')
  })

  it('should wait until condition becomes truthy', async () => {
    let count = 0
    const result = await waitUntil(() => {
      count++
      return count >= 3 ? 'done' : null
    }, 1000, 10)

    expect(result).toBe('done')
    expect(count).toBeGreaterThanOrEqual(3)
  })

  it('should throw on timeout', async () => {
    await expect(
      waitUntil(() => null, 100, 10)
    ).rejects.toThrow('Timed out after 100ms')
  })

  it('should handle async conditions', async () => {
    const result = await waitUntil(async () => {
      await sleep(10)
      return 'async-result'
    }, 1000, 10)

    expect(result).toBe('async-result')
  })
})

describe('formatElapsed', () => {
  it('should format seconds only', () => {
    expect(formatElapsed(5000)).toBe('5s')
    expect(formatElapsed(0)).toBe('0s')
    expect(formatElapsed(999)).toBe('0s')
    expect(formatElapsed(59_999)).toBe('59s')
  })

  it('should format minutes and seconds', () => {
    expect(formatElapsed(60_000)).toBe('1m 0s')
    expect(formatElapsed(90_000)).toBe('1m 30s')
    expect(formatElapsed(3_661_000)).toBe('61m 1s')
  })
})

describe('formatEta', () => {
  it('should format seconds only', () => {
    expect(formatEta(5000)).toBe('5s')
    expect(formatEta(0)).toBe('0s')
  })

  it('should format minutes and seconds', () => {
    expect(formatEta(90_000)).toBe('1m 30s')
  })

  it('should format hours and minutes', () => {
    expect(formatEta(3_661_000)).toBe('1h 1m')
    expect(formatEta(7_200_000)).toBe('2h 0m')
  })
})

describe('retryWithBackoff', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should return result on first success', async () => {
    const result = await retryWithBackoff(() => 'ok', { maxRetries: 3, baseDelay: 10 })
    expect(result).toBe('ok')
  })

  it('should retry on failure and succeed', async () => {
    let attempt = 0
    const result = await retryWithBackoff(() => {
      attempt++
      if (attempt < 3) throw new Error('fail')
      return 'success'
    }, { maxRetries: 3, baseDelay: 10 })

    expect(result).toBe('success')
    expect(attempt).toBe(3)
  })

  it('should throw after max retries', async () => {
    await expect(
      retryWithBackoff(
        () => { throw new Error('always fails') },
        { maxRetries: 2, baseDelay: 10 },
      )
    ).rejects.toThrow('always fails')
  })

  it('should handle async functions', async () => {
    const result = await retryWithBackoff(async () => {
      await sleep(10)
      return 42
    }, { maxRetries: 1, baseDelay: 10 })

    expect(result).toBe(42)
  })
})
