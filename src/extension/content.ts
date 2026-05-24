import { DeleteEngine, type Progress } from '../core'
import { findEmptyTrashButton, findConfirmDialog, findConfirmButton } from '../core/selectors'
import { sleep, waitUntil } from '../core/utils'

const LOG = '[gpdt:content]'

const STORAGE_KEYS = {
  /** Set by the popup; observed once when the engine finishes. */
  emptyTrashAfter: 'gpdt_emptyAfter',
  /**
   * Set when we decide to navigate to /trash. The content script that
   * loads on /trash sees this and runs the empty-trash flow. Includes
   * a timestamp so we can expire stale flags after a few minutes.
   */
  pendingEmptyTrash: 'gpdt_pendingEmpty',
} as const

const TRASH_URL = 'https://photos.google.com/trash'
const TRASH_PATH = '/trash'

let engine: DeleteEngine | null = null

const reportProgress = (progress: Progress): void => {
  chrome.runtime.sendMessage({ type: 'progress', data: progress }).catch(() => { /* popup closed */ })
  const { deleted, selected, status } = progress
  console.log(`${LOG} ${status} — ${deleted} deleted, ${selected} selected`)
}

interface StartOptions {
  maxCount?: number
  dryRun?: boolean
  emptyTrashAfter?: boolean
}

const start = async ({ maxCount = 10_000, dryRun = false, emptyTrashAfter = false }: StartOptions): Promise<void> => {
  if (engine) {
    console.warn(`${LOG} already running — stop first`)
    return
  }

  // Persist the choice so it survives the page navigation we may do.
  await chrome.storage.local.set({ [STORAGE_KEYS.emptyTrashAfter]: emptyTrashAfter })

  console.log(
    `${LOG} starting${dryRun ? ' (dry run)' : ''} — ` +
    `maxCount=${maxCount}, emptyTrashAfter=${emptyTrashAfter}`,
  )

  engine = new DeleteEngine({ maxCount, dryRun }, async (progress) => {
    reportProgress(progress)

    if (progress.status === 'done') {
      const data = await chrome.storage.local.get([STORAGE_KEYS.emptyTrashAfter])
      const wantEmpty = !!data[STORAGE_KEYS.emptyTrashAfter] && !dryRun
      // Clear the request flag regardless, so we don't re-trigger on
      // future runs unless the user re-enables the toggle.
      await chrome.storage.local.remove([STORAGE_KEYS.emptyTrashAfter])

      if (wantEmpty) {
        console.log(`${LOG} engine done — emptyTrashAfter requested, navigating to /trash`)
        await chrome.storage.local.set({
          [STORAGE_KEYS.pendingEmptyTrash]: { at: Date.now() },
        })
        // Announce navigation before we leave so an open popup updates.
        sendStatus('navigatingTrash')
        await sleep(400) // give chrome.storage / message a moment to flush
        window.location.href = TRASH_URL
        return
      }
    }

    if (progress.status === 'done' || progress.status === 'error') {
      engine = null
    }
  })

  await engine.run()
}

const pause = (): void => {
  if (!engine) return
  engine.pause()
  console.log(`${LOG} paused`)
}

const resume = (): void => {
  if (!engine) return
  engine.resume()
  console.log(`${LOG} resumed`)
}

const stop = (): void => {
  if (!engine) return
  engine.stop()
  engine = null
  console.log(`${LOG} stopped`)
}

// ─── Empty-trash flow (runs after navigation to /trash) ─────────

function sendStatus(status: string, extra: Partial<Progress> = {}): void {
  chrome.runtime.sendMessage({
    type: 'progress',
    data: {
      deleted: 0,
      selected: 0,
      status,
      startedAt: Date.now(),
      ...extra,
    },
  }).catch(() => { /* popup closed */ })
}

async function runEmptyTrashFlow(): Promise<void> {
  console.log(`${LOG} emptying trash…`)
  sendStatus('emptyingTrash')

  try {
    // 1. Wait for the "Empty trash" button to appear.
    const btn = await waitUntil(() => findEmptyTrashButton(), 20_000, 400)
    console.log(
      `${LOG} found empty-trash button: aria-label="${btn.getAttribute('aria-label') ?? ''}" ` +
      `text="${(btn.textContent ?? '').trim().slice(0, 60)}"`,
    )
    btn.click()

    // 2. Wait for the confirmation dialog.
    const dialog = await waitUntil(() => findConfirmDialog(), 15_000, 400)
    console.log(`${LOG} empty-trash dialog opened`)

    // 3. Find and click the confirm button.
    const confirmBtn = await waitUntil(() => findConfirmButton(dialog), 10_000, 400)
    console.log(
      `${LOG} clicking confirm: aria-label="${confirmBtn.getAttribute('aria-label') ?? ''}" ` +
      `text="${(confirmBtn.textContent ?? '').trim().slice(0, 60)}"`,
    )
    confirmBtn.click()

    // 4. Brief settle so the dialog has time to close before we report done.
    await sleep(800)

    sendStatus('done')
    console.log(`${LOG} trash emptied`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`${LOG} empty-trash failed:`, err)
    sendStatus('error', { error: `Empty trash failed: ${msg}` })
  }
}

async function maybeRunPendingEmptyTrash(): Promise<void> {
  const data = await chrome.storage.local.get([STORAGE_KEYS.pendingEmptyTrash])
  const pending = data[STORAGE_KEYS.pendingEmptyTrash] as { at?: number } | undefined
  if (!pending?.at) return

  // Expire stale flags (more than 3 minutes old).
  if (Date.now() - pending.at > 180_000) {
    console.warn(`${LOG} pending empty-trash flag expired, clearing`)
    await chrome.storage.local.remove([STORAGE_KEYS.pendingEmptyTrash])
    return
  }

  // Only act on /trash; on any other page just keep the flag alive so
  // the user-initiated navigation can complete.
  if (!window.location.pathname.includes(TRASH_PATH)) return

  // Clear the flag immediately so we don't risk looping.
  await chrome.storage.local.remove([STORAGE_KEYS.pendingEmptyTrash])

  await runEmptyTrashFlow()
}

// ─── Message routing ────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.action) {
    case 'start':
      void start({
        maxCount: message.maxCount,
        dryRun: message.dryRun,
        emptyTrashAfter: message.emptyTrashAfter,
      })
      sendResponse({ ok: true })
      break
    case 'pause':
      pause()
      sendResponse({ ok: true })
      break
    case 'resume':
      resume()
      sendResponse({ ok: true })
      break
    case 'stop':
      stop()
      sendResponse({ ok: true })
      break
    case 'toggle':
      if (engine) {
        stop()
      } else {
        void start({
          maxCount: message.maxCount,
          dryRun: message.dryRun,
          emptyTrashAfter: message.emptyTrashAfter,
        })
      }
      sendResponse({ ok: true })
      break
    case 'status':
      sendResponse({
        running: !!engine,
        paused: engine?.isPaused ?? false,
      })
      break
  }
})

// ─── Bootstrap ──────────────────────────────────────────────────

console.log(`${LOG} loaded on ${window.location.pathname}`)
void maybeRunPendingEmptyTrash()
