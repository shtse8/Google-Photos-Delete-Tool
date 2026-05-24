import { describe, it, expect, vi } from 'vitest'
import {
  runEmptyTrashFlow,
  DEFAULT_EMPTY_TRASH_TIMEOUTS,
  type EmptyTrashDeps,
  type EmptyTrashStatus,
} from '../src/extension/empty-trash'

/**
 * The flow's job is orchestration: find → click → find dialog → find
 * confirm → click → report. We don't need a real DOM for that — we
 * test against fakes that expose `.click = vi.fn()`. This is what the
 * dependency-injection rewrite made possible.
 */

interface FakeButton {
  click: ReturnType<typeof vi.fn>
  getAttribute: (k: string) => string | null
  textContent: string
}

const fakeButton = (label = 'fake', text = 'fake'): FakeButton => ({
  click: vi.fn(),
  getAttribute: (k) => (k === 'aria-label' ? label : null),
  textContent: text,
})

const fakeDialog = (): FakeButton => fakeButton('dialog', '')

const happyDeps = (overrides: Partial<EmptyTrashDeps> = {}): {
  deps: EmptyTrashDeps
  empty: FakeButton
  dialog: FakeButton
  confirm: FakeButton
  statuses: { status: EmptyTrashStatus; extra?: { error?: string } }[]
} => {
  const empty = fakeButton('Empty trash', 'Empty trash')
  const dialog = fakeDialog()
  const confirm = fakeButton('Move to trash', 'Move to trash')
  const statuses: { status: EmptyTrashStatus; extra?: { error?: string } }[] = []

  return {
    empty,
    dialog,
    confirm,
    statuses,
    deps: {
      findEmptyTrashButton: () => empty as unknown as HTMLElement,
      findConfirmDialog: () => dialog as unknown as HTMLElement,
      findConfirmButton: () => confirm as unknown as HTMLElement,
      waitFor: async (cond) => {
        const v = cond()
        if (!v) throw new Error('Timed out')
        return v as NonNullable<typeof v>
      },
      sleep: vi.fn().mockResolvedValue(undefined),
      onStatus: (status, extra) => statuses.push({ status, extra }),
      ...overrides,
    },
  }
}

describe('runEmptyTrashFlow — happy path', () => {
  it('clicks the empty-trash button, then the confirm button', async () => {
    const { deps, empty, confirm } = happyDeps()
    await runEmptyTrashFlow(deps)
    expect(empty.click).toHaveBeenCalledTimes(1)
    expect(confirm.click).toHaveBeenCalledTimes(1)
  })

  it('clicks empty BEFORE confirm', async () => {
    const order: string[] = []
    const { deps, empty, confirm } = happyDeps()
    empty.click = vi.fn(() => { order.push('empty') })
    confirm.click = vi.fn(() => { order.push('confirm') })
    await runEmptyTrashFlow(deps)
    expect(order).toEqual(['empty', 'confirm'])
  })

  it('reports emptyingTrash → done', async () => {
    const { deps, statuses } = happyDeps()
    await runEmptyTrashFlow(deps)
    expect(statuses.map((s) => s.status)).toEqual(['emptyingTrash', 'done'])
  })

  it('settles for postConfirmSettle ms after the confirm click', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined)
    const { deps } = happyDeps({ sleep })
    await runEmptyTrashFlow(deps)
    expect(sleep).toHaveBeenCalledWith(DEFAULT_EMPTY_TRASH_TIMEOUTS.postConfirmSettle)
  })

  it('honours per-call timeout overrides', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined)
    const { deps } = happyDeps({ sleep, timeouts: { postConfirmSettle: 42 } })
    await runEmptyTrashFlow(deps)
    expect(sleep).toHaveBeenCalledWith(42)
  })

  it('passes its own timeout values to waitFor', async () => {
    const calls: number[] = []
    const fakes = happyDeps()
    const waitFor: EmptyTrashDeps['waitFor'] = async (cond, timeoutMs) => {
      calls.push(timeoutMs)
      const v = cond()
      if (!v) throw new Error('Timed out')
      return v as NonNullable<typeof v>
    }
    await runEmptyTrashFlow({ ...fakes.deps, waitFor })
    expect(calls).toEqual([
      DEFAULT_EMPTY_TRASH_TIMEOUTS.findButton,
      DEFAULT_EMPTY_TRASH_TIMEOUTS.findDialog,
      DEFAULT_EMPTY_TRASH_TIMEOUTS.findConfirm,
    ])
  })
})

describe('runEmptyTrashFlow — failure paths', () => {
  it('reports error if the empty-trash button never appears', async () => {
    const statuses: { status: EmptyTrashStatus; extra?: { error?: string } }[] = []
    const deps: EmptyTrashDeps = {
      findEmptyTrashButton: () => null,
      findConfirmDialog: () => null,
      findConfirmButton: () => null,
      waitFor: async (cond) => {
        const v = cond()
        if (!v) throw new Error('Timed out after 20000ms')
        return v as NonNullable<typeof v>
      },
      sleep: vi.fn().mockResolvedValue(undefined),
      onStatus: (status, extra) => statuses.push({ status, extra }),
    }
    await expect(runEmptyTrashFlow(deps)).rejects.toThrow('Timed out')
    expect(statuses[0].status).toBe('emptyingTrash')
    expect(statuses[1].status).toBe('error')
    expect(statuses[1].extra?.error).toMatch(/Empty trash failed/)
  })

  it('reports error if the dialog never opens after the first click', async () => {
    const empty = fakeButton('Empty trash')
    let dialogFound = false
    const statuses: EmptyTrashStatus[] = []
    const deps: EmptyTrashDeps = {
      findEmptyTrashButton: () => empty as unknown as HTMLElement,
      findConfirmDialog: () => (dialogFound ? (fakeDialog() as unknown as HTMLElement) : null),
      findConfirmButton: () => null,
      waitFor: async (cond) => {
        const v = cond()
        if (!v) throw new Error('Timed out')
        return v as NonNullable<typeof v>
      },
      sleep: vi.fn().mockResolvedValue(undefined),
      onStatus: (status) => statuses.push(status),
    }
    await expect(runEmptyTrashFlow(deps)).rejects.toThrow('Timed out')
    expect(empty.click).toHaveBeenCalledTimes(1) // we DID click empty
    expect(statuses).toEqual(['emptyingTrash', 'error'])
  })

  it('reports error if the confirm button is missing inside the dialog', async () => {
    const empty = fakeButton('Empty trash')
    const dialog = fakeDialog()
    const statuses: EmptyTrashStatus[] = []
    const deps: EmptyTrashDeps = {
      findEmptyTrashButton: () => empty as unknown as HTMLElement,
      findConfirmDialog: () => dialog as unknown as HTMLElement,
      findConfirmButton: () => null, // not found
      waitFor: async (cond) => {
        const v = cond()
        if (!v) throw new Error('Timed out')
        return v as NonNullable<typeof v>
      },
      sleep: vi.fn().mockResolvedValue(undefined),
      onStatus: (status) => statuses.push(status),
    }
    await expect(runEmptyTrashFlow(deps)).rejects.toThrow('Timed out')
    expect(empty.click).toHaveBeenCalledTimes(1)
    expect(statuses).toEqual(['emptyingTrash', 'error'])
  })
})

describe('runEmptyTrashFlow — logging', () => {
  it('emits structured log lines for each step', async () => {
    const lines: string[] = []
    const { deps } = happyDeps({ log: (m) => lines.push(m) })
    await runEmptyTrashFlow(deps)
    const joined = lines.join('\n')
    expect(joined).toMatch(/emptying trash/i)
    expect(joined).toMatch(/empty-trash button found/i)
    expect(joined).toMatch(/dialog opened/i)
    expect(joined).toMatch(/confirm button found/i)
    expect(joined).toMatch(/trash emptied/i)
  })

  it('logs the matched aria-label so a failed selector can be debugged', async () => {
    const lines: string[] = []
    const { deps } = happyDeps({ log: (m) => lines.push(m) })
    await runEmptyTrashFlow(deps)
    expect(lines.some((l) => l.includes('aria-label="Empty trash"'))).toBe(true)
    expect(lines.some((l) => l.includes('aria-label="Move to trash"'))).toBe(true)
  })

  it('works without log / onStatus (no-ops by default)', async () => {
    const empty = fakeButton('Empty trash')
    const dialog = fakeDialog()
    const confirm = fakeButton('Move to trash')
    const deps: EmptyTrashDeps = {
      findEmptyTrashButton: () => empty as unknown as HTMLElement,
      findConfirmDialog: () => dialog as unknown as HTMLElement,
      findConfirmButton: () => confirm as unknown as HTMLElement,
      waitFor: async (cond) => {
        const v = cond()
        if (!v) throw new Error('Timed out')
        return v as NonNullable<typeof v>
      },
      sleep: vi.fn().mockResolvedValue(undefined),
      // no log, no onStatus — should not crash
    }
    await expect(runEmptyTrashFlow(deps)).resolves.toBeUndefined()
    expect(empty.click).toHaveBeenCalled()
    expect(confirm.click).toHaveBeenCalled()
  })
})
