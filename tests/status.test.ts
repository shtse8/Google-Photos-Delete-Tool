import { describe, it, expect } from 'vitest'
import { ACTIVE_STATUSES, TERMINAL_STATUSES, type RunStatus } from '../src/core/status'

describe('RunStatus model', () => {
  const ALL: RunStatus[] = [
    'idle', 'selecting', 'deleting', 'scrolling', 'paused', 'done', 'error',
    'navigatingTrash', 'emptyingTrash',
  ]

  it('active statuses drive the indeterminate bar', () => {
    expect(ACTIVE_STATUSES.has('selecting')).toBe(true)
    expect(ACTIVE_STATUSES.has('emptyingTrash')).toBe(true)
    expect(ACTIVE_STATUSES.has('paused')).toBe(false)
  })

  it('terminal statuses freeze elapsed', () => {
    expect(TERMINAL_STATUSES.has('done')).toBe(true)
    expect(TERMINAL_STATUSES.has('error')).toBe(true)
    expect(TERMINAL_STATUSES.has('idle')).toBe(true)
  })

  it('paused is intentionally in neither partition (it is a held state, not progress)', () => {
    for (const s of ALL) {
      const inActive = ACTIVE_STATUSES.has(s)
      const inTerminal = TERMINAL_STATUSES.has(s)
      if (s === 'paused') {
        expect(inActive || inTerminal).toBe(false)
      } else {
        expect(inActive || inTerminal).toBe(true)
      }
    }
  })
})
