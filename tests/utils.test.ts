import { describe, it, expect } from 'vitest'
import { sleep, waitUntil, formatElapsed, formatEta, describeButton } from '../src/core/utils'

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

describe('describeButton', () => {
  it('formats aria-label and text with a cap', () => {
    const el = {
      getAttribute: (k: string) => (k === 'aria-label' ? 'Move to trash' : null),
      textContent: 'Move to trash',
    }
    expect(describeButton(el)).toBe('aria-label="Move to trash" text="Move to trash"')
  })

  it('tolerates missing attribute/text accessors', () => {
    expect(describeButton({})).toBe('aria-label="" text=""')
  })

  it('caps very long labels', () => {
    const el = { getAttribute: () => 'x'.repeat(500), textContent: '' }
    const out = describeButton(el)
    expect(out.length).toBeLessThan(300)
    expect(out).toContain('x'.repeat(60))
  })
})
