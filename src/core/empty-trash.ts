/**
 * "Empty trash" post-deletion flow — framework-agnostic.
 *
 * After the main batch-delete pass finishes, the host optionally
 * navigates to photos.google.com/trash with a pending flag (storage
 * baton). When the script re-injects on /trash it runs this flow:
 * click "Empty trash", confirm, and VERIFY a postcondition (the empty
 * button disappears / the empty-state appears) before reporting done.
 * A "done" without proof is never emitted for a permanent action.
 */
import { describeButton } from './utils'
import { StopRequested } from './run-occupancy'
/**
 * Status the flow reports as it progresses.
 */
export type EmptyTrashStatus = 'emptyingTrash' | 'done' | 'error'

export interface EmptyTrashDeps {
  /** Locates the "Empty trash" toolbar button on /trash. */
  findEmptyTrashButton: () => HTMLElement | null
  /** Locates the currently-open confirmation dialog. */
  findConfirmDialog: () => HTMLElement | null
  /** Locates the destructive-action button inside `dialog`. */
  findConfirmButton: (dialog: HTMLElement) => HTMLElement | null
  /** True when /trash shows an empty-state (already empty). */
  isTrashEmpty: () => boolean
  /**
   * Polls `condition()` until truthy or `timeoutMs` elapses.
   * Throws on timeout — the flow catches and surfaces as 'error'.
   */
  waitFor: <T>(condition: () => T | null | undefined, timeoutMs: number) => Promise<NonNullable<T>>
  /** Resolves after `ms` milliseconds. */
  sleep: (ms: number) => Promise<void>
  /** Optional structured logger; defaults to a no-op for tests. */
  log?: (msg: string) => void
  /** Optional progress callback for the UI. */
  onStatus?: (status: EmptyTrashStatus, extra?: { error?: string }) => void
  /** Optional per-step timeouts. */
  timeouts?: Partial<EmptyTrashTimeouts>
}

export interface EmptyTrashTimeouts {
  /** Wait at most this long for the toolbar "Empty trash" button to appear. */
  findButton: number
  /** Wait at most this long for the confirm dialog to open. */
  findDialog: number
  /** Wait at most this long for the confirm button inside the dialog. */
  findConfirm: number
  /** Wait at most this long for the empty-state postcondition. */
  postConfirm: number
}

export const DEFAULT_EMPTY_TRASH_TIMEOUTS: EmptyTrashTimeouts = {
  findButton: 20_000,
  findDialog: 15_000,
  findConfirm: 10_000,
  postConfirm: 10_000,
}

/**
 * Drive the three-step "Empty trash" flow with postcondition proof.
 * Throws on terminal failure; the host already reports via onStatus.
 */
export async function runEmptyTrashFlow(deps: EmptyTrashDeps): Promise<void> {
  const log = deps.log ?? (() => undefined)
  const onStatus = deps.onStatus ?? (() => undefined)
  const t: EmptyTrashTimeouts = { ...DEFAULT_EMPTY_TRASH_TIMEOUTS, ...deps.timeouts }

  log('emptying trash…')
  onStatus('emptyingTrash')

  try {
    // 1. Wait for the toolbar "Empty trash" button to appear on /trash.
    let btn: HTMLElement
    try {
      btn = await deps.waitFor(deps.findEmptyTrashButton, t.findButton)
    } catch (err) {
      if (err instanceof StopRequested) throw err
      // The trash may already be empty — resolve to done instead of error.
      if (deps.isTrashEmpty()) {
        log('trash already empty')
        onStatus('done')
        return
      }
      throw new Error('Empty trash button not found and trash does not appear empty.')
    }
    log(`empty-trash button found: ${describeButton(btn)}`)
    btn.click()

    // 2. Wait for the confirmation dialog to open.
    const dialog = await deps.waitFor(deps.findConfirmDialog, t.findDialog)
    log('empty-trash dialog opened')

    // 3. Find and click the destructive-action button inside the dialog.
    const confirmBtn = await deps.waitFor(() => deps.findConfirmButton(dialog), t.findConfirm)
    log(`confirm button found: ${describeButton(confirmBtn)}`)
    confirmBtn.click()

    // 4. POSTCONDITION: wait until the empty-trash button is gone AND no
    //    confirm dialog remains (or the empty-state appears). Only then
    //    is "done" emitted — a permanent deletion is never reported as
    //    done without proof.
    try {
      await deps.waitFor(
        () => (!deps.findEmptyTrashButton() && !deps.findConfirmDialog()) || deps.isTrashEmpty(),
        t.postConfirm,
      )
    } catch (err) {
      if (err instanceof StopRequested) throw err
      throw new Error(
        'Empty trash may not have completed: the toolbar still shows an empty action. ' +
        'Please verify /trash manually before assuming photos are gone.',
      )
    }

    onStatus('done')
    log('trash emptied (postcondition verified)')
  } catch (err) {
    if (err instanceof StopRequested) throw err
    const msg = err instanceof Error ? err.message : String(err)
    log(`empty-trash failed: ${msg}`)
    onStatus('error', { error: `Empty trash failed: ${msg}` })
    throw err
  }
}
