import { describe, it, expect } from 'vitest'
import { DEFAULT_CONFIG, type Config } from '../src/core/config'

describe('Config', () => {
  it('should have sensible defaults', () => {
    // 500 ≈ Google Photos selection cap. Picking the practical cap
    // as default avoids users entering 10000 and being silently capped.
    expect(DEFAULT_CONFIG.maxCount).toBe(500)
    expect(DEFAULT_CONFIG.timeout).toBe(600_000)
    expect(DEFAULT_CONFIG.pollDelay).toBe(300)
    expect(DEFAULT_CONFIG.dryRun).toBe(false)
  })

  it('should allow partial overrides via spread', () => {
    const partial: Partial<Config> = { maxCount: 250, dryRun: true }
    const merged = { ...DEFAULT_CONFIG, ...partial }

    expect(merged.maxCount).toBe(250)
    expect(merged.dryRun).toBe(true)
    expect(merged.timeout).toBe(DEFAULT_CONFIG.timeout)
    expect(merged.pollDelay).toBe(DEFAULT_CONFIG.pollDelay)
  })

  it('should accept 0 as the documented "no limit" sentinel', () => {
    const cfg: Partial<Config> = { maxCount: 0 }
    const merged = { ...DEFAULT_CONFIG, ...cfg }
    expect(merged.maxCount).toBe(0)
  })

  it('should preserve all fields when no overrides', () => {
    const merged = { ...DEFAULT_CONFIG }
    expect(merged).toEqual(DEFAULT_CONFIG)
  })
})
