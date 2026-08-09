import { describe, it, expect, vi } from 'vitest'
import {
  runEmptyTrashFlow,
  DEFAULT_EMPTY_TRASH_TIMEOUTS,
  type EmptyTrashDeps,
  type EmptyTrashStatus,
} from '../src/core/empty-trash'

/**
 * The flow's job is orchestration: find → click → find dialog → find
 * confirm → click → VERIFY postcondition → report done. We test against
 * fakes; the postcondition (empty button gone / empty-state visible) is
 * what separates a truthful "done" from a guess.
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

interface HappyWorld {
  deps: EmptyTrashDeps
  empty: FakeButton
  dialog: FakeButton
  confirm: FakeButton
  statuses: { status: EmptyTrashStatus; extra?: { error?: string } }[]
  emptiedState: { emptied: boolean }
}

const happyWorld = (overrides: Partial<EmptyTrashDeps> = {}): HappyWorld => {
  const empty = fakeButton('Empty trash', 'Empty trash')
  const dialog = fakeDialog()
  const confirm = fakeButton('Move to trash', 'Move to trash')
  const statuses: { status: EmptyTrashStatus; extra?: { error?: string } }[] = []
  // Default postcondition: empty button disappears once confirm is clicked.
  const state = { emptied: false }
  const clickDialog = dialog.click as () => void
  empty.click = vi.fn(() => { clickDialog() })
  confirm.click = vi.fn(() => { state.emptied = true })

  return {
    emptiedState: state,
    empty,
    dialog,
    confirm,
    statuses,
    deps: {
      findEmptyTrashButton: () => (state.emptied ? null : (empty as unknown as HTMLElement)),
      findConfirmDialog: () => (state.emptied ? null : (dialog as unknown as HTMLElement)),
      findConfirmButton: () => confirm as unknown as HTMLElement,
      isTrashEmpty: () => state.emptied,
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

describe('runEmptyTrashFlow — happy path with postcondition', () => {
  it('clicks empty, then confirm, then verifies the empty state before done', async () => {
    const { deps, empty, confirm, statuses } = happyWorld()
    await runEmptyTrashFlow(deps)
    expect(empty.click).toHaveBeenCalledTimes(1)
    expect(confirm.click).toHaveBeenCalledTimes(1)
    expect(statuses.map((s) => s.status)).toEqual(['emptyingTrash', 'done'])
  })

  it('clicks empty BEFORE confirm', async () => {
    const order: string[] = []
    const world = happyWorld()
    world.empty.click = vi.fn(() => { order.push('empty') })
    world.confirm.click = vi.fn(() => { order.push('confirm'); world.emptiedState.emptied = true })
    await runEmptyTrashFlow(world.deps)
    expect(order).toEqual(['empty', 'confirm'])
  })

  it('settles nothing — waits for the postcondition via waitFor', async () => {
    const calls: number[] = []
    const world = happyWorld()
    world.deps.waitFor = async (cond, timeoutMs) => {
      calls.push(timeoutMs as number)
      const v = cond()
      if (!v) throw new Error('Timed out')
      return v as NonNullable<typeof v>
    }
    await runEmptyTrashFlow(world.deps)
    expect(calls).toEqual([
      DEFAULT_EMPTY_TRASH_TIMEOUTS.findButton,
      DEFAULT_EMPTY_TRASH_TIMEOUTS.findDialog,
      DEFAULT_EMPTY_TRASH_TIMEOUTS.findConfirm,
      DEFAULT_EMPTY_TRASH_TIMEOUTS.postConfirm,
    ])
  })

  it('honours per-call timeout overrides', async () => {
    const world = happyWorld()
    const calls: number[] = []
    world.deps.waitFor = async (cond, timeoutMs) => {
      calls.push(timeoutMs as number)
      const v = cond()
      if (!v) throw new Error('Timed out')
      return v as NonNullable<typeof v>
    }
    await runEmptyTrashFlow({ ...world.deps, timeouts: { postConfirm: 42, findButton: 7 } })
    expect(calls[0]).toBe(7)
    expect(calls[3]).toBe(42)
  })
})

describe('runEmptyTrashFlow — already-empty trash', () => {
  it('resolves to done without clicking when the trash is already empty', async () => {
    const empty = fakeButton('Empty trash')
    const statuses: EmptyTrashStatus[] = []
    const deps: EmptyTrashDeps = {
      findEmptyTrashButton: () => null,
      findConfirmDialog: () => null,
      findConfirmButton: () => null,
      isTrashEmpty: () => true,
      waitFor: async () => { throw new Error('Timed out after 20000ms') },
      sleep: vi.fn().mockResolvedValue(undefined),
      onStatus: (status) => statuses.push(status),
    }
    await expect(runEmptyTrashFlow(deps)).resolves.toBeUndefined()
    expect(empty.click).not.toHaveBeenCalled()
    expect(statuses).toEqual(['emptyingTrash', 'done'])
  })

  it('reports error when the button is missing AND the trash is not empty', async () => {
    const statuses: EmptyTrashStatus[] = []
    const deps: EmptyTrashDeps = {
      findEmptyTrashButton: () => null,
      findConfirmDialog: () => null,
      findConfirmButton: () => null,
      isTrashEmpty: () => false,
      waitFor: async () => { throw new Error('Timed out after 20000ms') },
      sleep: vi.fn().mockResolvedValue(undefined),
      onStatus: (status) => statuses.push(status),
    }
    await expect(runEmptyTrashFlow(deps)).rejects.toThrow(/not found/)
    expect(statuses).toEqual(['emptyingTrash', 'error'])
  })
})

describe('runEmptyTrashFlow — failure paths', () => {
  it('reports error if the dialog never opens after the first click', async () => {
    const empty = fakeButton('Empty trash')
    const statuses: EmptyTrashStatus[] = []
    const deps: EmptyTrashDeps = {
      findEmptyTrashButton: () => empty as unknown as HTMLElement,
      findConfirmDialog: () => null,
      findConfirmButton: () => null,
      isTrashEmpty: () => false,
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

  it('reports error when the confirm button is missing inside the dialog', async () => {
    const empty = fakeButton('Empty trash')
    const dialog = fakeDialog()
    const statuses: EmptyTrashStatus[] = []
    const deps: EmptyTrashDeps = {
      findEmptyTrashButton: () => empty as unknown as HTMLElement,
      findConfirmDialog: () => dialog as unknown as HTMLElement,
      findConfirmButton: () => null,
      isTrashEmpty: () => false,
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

  it('reports error when the empty-state postcondition never verifies', async () => {
    const empty = fakeButton('Empty trash')
    const dialog = fakeDialog()
    const confirm = fakeButton('Move to trash')
    const statuses: { status: EmptyTrashStatus; extra?: { error?: string } }[] = []
    // Empty button NEVER disappears after confirm → postcondition fails.
    const deps: EmptyTrashDeps = {
      findEmptyTrashButton: () => empty as unknown as HTMLElement,
      findConfirmDialog: () => dialog as unknown as HTMLElement,
      findConfirmButton: () => confirm as unknown as HTMLElement,
      isTrashEmpty: () => false,
      waitFor: async (cond) => {
        const v = cond()
        if (!v) throw new Error('Timed out after 10000ms')
        return v as NonNullable<typeof v>
      },
      sleep: vi.fn().mockResolvedValue(undefined),
      onStatus: (status, extra) => statuses.push({ status, extra }),
    }
    await expect(runEmptyTrashFlow(deps)).rejects.toThrow(/may not have completed/)
    expect(confirm.click).toHaveBeenCalledTimes(1)
    expect(statuses[1].status).toBe('error')
    expect(statuses[1].extra?.error).toMatch(/may not have completed/)
  })
})

describe('runEmptyTrashFlow — logging', () => {
  it('emits structured log lines for each step', async () => {
    const lines: string[] = []
    const { deps } = happyWorld({ log: (m) => lines.push(m) })
    await runEmptyTrashFlow(deps)
    const joined = lines.join('\n')
    expect(joined).toMatch(/emptying trash/i)
    expect(joined).toMatch(/confirm button found/i)
    expect(joined).toMatch(/postcondition verified/i)
  })

  it('works without log / onStatus (no-ops by default)', async () => {
    const { deps } = happyWorld()
    await expect(runEmptyTrashFlow({ ...deps, log: undefined, onStatus: undefined })).resolves.toBeUndefined()
  })
})
