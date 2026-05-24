/**
 * "Empty trash" post-deletion flow.
 *
 * After the main batch-delete pass finishes, the content script optionally
 * navigates to https://photos.google.com/trash with a flag in
 * chrome.storage.local. When the script re-injects on /trash it calls
 * {@link runEmptyTrashFlow} to click "Empty trash" + confirm.
 *
 * The flow is extracted from content.ts so it can be unit-tested in
 * isolation: every IO it touches (DOM finders, sleep, status reporting)
 * is passed in as a dependency. content.ts wires in the real
 * implementations; tests wire in deterministic fakes.
 */

/**
 * Status the flow reports as it progresses. Mirrors the engine's
 * EngineStatus union for the popup-facing UI, with two flow-specific
 * values added.
 */
export type EmptyTrashStatus = 'emptyingTrash' | 'done' | 'error'

export interface EmptyTrashDeps {
  /** Locates the "Empty trash" toolbar button on /trash. */
  findEmptyTrashButton: () => HTMLElement | null
  /** Locates the currently-open confirmation dialog. */
  findConfirmDialog: () => HTMLElement | null
  /** Locates the destructive-action button inside `dialog`. */
  findConfirmButton: (dialog: HTMLElement) => HTMLElement | null
  /**
   * Polls `condition()` until it returns a truthy value or `timeoutMs`
   * elapses. Throws on timeout — the flow catches and surfaces as an
   * 'error' status.
   */
  waitFor: <T>(condition: () => T | null | undefined, timeoutMs: number) => Promise<NonNullable<T>>
  /** Resolves after `ms` milliseconds. */
  sleep: (ms: number) => Promise<void>
  /** Optional structured logger; defaults to a no-op for tests. */
  log?: (msg: string) => void
  /** Optional progress callback for the popup UI. */
  onStatus?: (status: EmptyTrashStatus, extra?: { error?: string }) => void
  /** Optional per-step timeouts. Sensible defaults applied if omitted. */
  timeouts?: Partial<EmptyTrashTimeouts>
}

export interface EmptyTrashTimeouts {
  /** Wait at most this long for the toolbar "Empty trash" button to appear. */
  findButton: number
  /** Wait at most this long for the confirm dialog to open. */
  findDialog: number
  /** Wait at most this long for the confirm button inside the dialog. */
  findConfirm: number
  /** Settle delay after clicking confirm, before reporting done. */
  postConfirmSettle: number
}

export const DEFAULT_EMPTY_TRASH_TIMEOUTS: EmptyTrashTimeouts = {
  findButton: 20_000,
  findDialog: 15_000,
  findConfirm: 10_000,
  postConfirmSettle: 800,
}

const describeButton = (el: HTMLElement): string => {
  const label = el.getAttribute?.('aria-label') ?? ''
  const text = (el.textContent ?? '').trim().slice(0, 60)
  return `aria-label="${label}" text="${text}"`
}

/**
 * Drive the three-step "Empty trash" flow. Throws on terminal failure
 * (the caller — content.ts — already reports the failure via
 * `onStatus('error')` so the popup sees it; the throw lets the caller
 * decide whether to suppress or propagate further).
 */
export async function runEmptyTrashFlow(deps: EmptyTrashDeps): Promise<void> {
  const log = deps.log ?? (() => undefined)
  const onStatus = deps.onStatus ?? (() => undefined)
  const t: EmptyTrashTimeouts = { ...DEFAULT_EMPTY_TRASH_TIMEOUTS, ...deps.timeouts }

  log('emptying trash…')
  onStatus('emptyingTrash')

  try {
    // 1. Wait for the toolbar "Empty trash" button to appear on /trash.
    const btn = await deps.waitFor(deps.findEmptyTrashButton, t.findButton)
    log(`empty-trash button found: ${describeButton(btn)}`)
    btn.click()

    // 2. Wait for the confirmation dialog to open.
    const dialog = await deps.waitFor(deps.findConfirmDialog, t.findDialog)
    log('empty-trash dialog opened')

    // 3. Find and click the destructive-action button inside the dialog.
    const confirmBtn = await deps.waitFor(() => deps.findConfirmButton(dialog), t.findConfirm)
    log(`confirm button found: ${describeButton(confirmBtn)}`)
    confirmBtn.click()

    // 4. Brief settle so the dialog has time to close before we report done.
    await deps.sleep(t.postConfirmSettle)

    onStatus('done')
    log('trash emptied')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log(`empty-trash failed: ${msg}`)
    onStatus('error', { error: `Empty trash failed: ${msg}` })
    throw err
  }
}
