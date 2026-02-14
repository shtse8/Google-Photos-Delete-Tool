import { describe, it, expect } from 'vitest'
import { DEFAULT_CONFIG, type Config } from '../src/core/config'

describe('Config', () => {
  it('should have sensible defaults', () => {
    expect(DEFAULT_CONFIG.maxCount).toBe(10_000)
    expect(DEFAULT_CONFIG.timeout).toBe(600_000)
    expect(DEFAULT_CONFIG.pollDelay).toBe(300)
    expect(DEFAULT_CONFIG.dryRun).toBe(false)
  })

  it('should allow partial overrides via spread', () => {
    const partial: Partial<Config> = { maxCount: 500, dryRun: true }
    const merged = { ...DEFAULT_CONFIG, ...partial }

    expect(merged.maxCount).toBe(500)
    expect(merged.dryRun).toBe(true)
    expect(merged.timeout).toBe(DEFAULT_CONFIG.timeout)
    expect(merged.pollDelay).toBe(DEFAULT_CONFIG.pollDelay)
  })

  it('should preserve all fields when no overrides', () => {
    const merged = { ...DEFAULT_CONFIG }
    expect(merged).toEqual(DEFAULT_CONFIG)
  })
})
