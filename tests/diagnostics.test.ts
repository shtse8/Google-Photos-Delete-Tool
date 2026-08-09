import { describe, it, expect, beforeEach } from 'vitest'
import { diagnostics } from '../src/core/diagnostics'

describe('Diagnostics collector', () => {
  beforeEach(() => {
    diagnostics.reset()
  })

  it('records selector matches with counts and a cap', () => {
    diagnostics.recordSelector('counter', 'primary')
    diagnostics.recordSelector('counter', 'primary')
    diagnostics.recordSelector('checkbox', 'fallback', '[role="checkbox"]')
    const blob = diagnostics.blob()
    expect(blob.selectorMatches).toHaveLength(2)
    const counter = blob.selectorMatches.find((m) => m.name === 'counter')
    expect(counter?.matched).toBe('primary')
    expect(counter?.count).toBe(2)
    const checkbox = blob.selectorMatches.find((m) => m.name === 'checkbox')
    expect(checkbox?.matched).toBe('fallback')
    expect(checkbox?.fallback).toBe('[role="checkbox"]')
  })

  it('resets between runs', () => {
    diagnostics.recordSelector('counter', 'primary')
    diagnostics.reset()
    expect(diagnostics.blob().selectorMatches).toHaveLength(0)
  })

  it('captures an engine snapshot', () => {
    diagnostics.setEngine({
      status: 'done',
      deleted: 42,
      selected: 0,
      counterFallbackUsed: true,
      flapRecoveries: 1,
    })
    const engine = diagnostics.blob().engine
    expect(engine?.status).toBe('done')
    expect(engine?.deleted).toBe(42)
    expect(engine?.counterFallbackUsed).toBe(true)
    expect(engine?.flapRecoveries).toBe(1)
  })

  it('collects a bounded unique label sample', () => {
    for (let i = 0; i < 100; i++) diagnostics.addLabelSample(`Photo - ${i}`)
    const blob = diagnostics.blob()
    expect(blob.labelsSample).toHaveLength(20)
    expect(new Set(blob.labelsSample).size).toBe(20)
  })

  it('includes pack version and environment info in the blob', () => {
    const blob = diagnostics.blob()
    expect(blob.packVersion).toBeGreaterThanOrEqual(1)
    expect(typeof blob.url).toBe('string')
    expect(typeof blob.userAgent).toBe('string')
    expect(blob.collectedAt).toBeGreaterThan(0)
  })
})
