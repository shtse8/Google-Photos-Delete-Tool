import { describe, it, expect } from 'vitest'
import {
  isRunOccupied,
  RunInProgressError,
  RUN_IN_PROGRESS_MESSAGE,
  StopRequested,
  waitUntilAbortable,
} from '../src/core/run-occupancy'

describe('isRunOccupied', () => {
  it('is free when no slot is taken', () => {
    expect(isRunOccupied({})).toBe(false)
    expect(isRunOccupied({ engine: null, runPromise: null, starting: false, emptying: false })).toBe(false)
  })

  it('is occupied by an engine, settling tail, start handshake, or empty-trash', () => {
    expect(isRunOccupied({ engine: {} })).toBe(true)
    expect(isRunOccupied({ runPromise: Promise.resolve() })).toBe(true)
    expect(isRunOccupied({ starting: true })).toBe(true)
    expect(isRunOccupied({ emptying: true })).toBe(true)
    expect(isRunOccupied({ running: true })).toBe(true)
  })
})

describe('RunInProgressError', () => {
  it('carries the shared refusal message', () => {
    const err = new RunInProgressError()
    expect(err.name).toBe('RunInProgressError')
    expect(err.message).toBe(RUN_IN_PROGRESS_MESSAGE)
    expect(err.message).toMatch(/already in progress/)
  })
})

describe('waitUntilAbortable', () => {
  it('returns when the condition becomes truthy', async () => {
    let n = 0
    const result = await waitUntilAbortable(
      () => {
        n++
        return n >= 3 ? 'ok' : null
      },
      1000,
      1,
      () => false,
      async () => undefined,
    )
    expect(result).toBe('ok')
  })

  it('throws StopRequested as soon as the stop flag is set, not a timeout error', async () => {
    let stopped = false
    const pending = waitUntilAbortable(
      () => null,
      10_000,
      5,
      () => stopped,
      () => new Promise((r) => setTimeout(r, 5)),
    )
    await new Promise((r) => setTimeout(r, 15))
    stopped = true
    await expect(pending).rejects.toBeInstanceOf(StopRequested)
  })

  it('times out when the condition never becomes truthy and nobody stops', async () => {
    await expect(
      waitUntilAbortable(() => null, 3, 1, () => false, async () => undefined),
    ).rejects.toThrow(/Timed out after 3ms/)
  })
})
