/**
 * Content script — wires the DeleteEngine to chrome.runtime messages
 * from the popup, and owns the "empty-trash" post-deletion navigation
 * flow (storage-baton pattern so it survives the page reload).
 */
import { DEFAULT_CONFIG, DeleteEngine, type Progress } from '../core'
import { findEmptyTrashButton, findConfirmDialog, findConfirmButton } from '../core/selectors'
import { sleep, waitUntil } from '../core/utils'
import { runEmptyTrashFlow, type EmptyTrashStatus } from './empty-trash'

const LOG = '[gpdt:content]'

const STORAGE_KEYS = {
  /** Set by the popup; observed once when the engine finishes. */
  emptyTrashAfter: 'gpdt_emptyAfter',
  /**
   * Set when we decide to navigate to /trash. The content script that
   * loads on /trash sees this and runs the empty-trash flow. Includes
   * a timestamp so we can expire stale flags.
   */
  pendingEmptyTrash: 'gpdt_pendingEmpty',
} as const

const TRASH_URL = 'https://photos.google.com/trash'
const TRASH_PATH = '/trash'
/** Pending empty-trash flag is invalid past this many ms (we only ever
 *  expect the very next page load to consume it). */
const PENDING_EMPTY_TTL_MS = 180_000

// ─── Engine lifecycle ───────────────────────────────────────────

/**
 * Currently active engine, or `null` if idle. Guarded by `starting`
 * to avoid two engines being constructed if the user double-clicks
 * Start fast enough to race the `await chrome.storage.local.set`
 * inside `start()`.
 */
let engine: DeleteEngine | null = null
let starting = false

interface StartOptions {
  maxCount?: number
  dryRun?: boolean
  emptyTrashAfter?: boolean
}

const start = async (opts: StartOptions): Promise<void> => {
  if (engine || starting) {
    console.warn(`${LOG} already running — stop first`)
    return
  }
  starting = true

  const maxCount        = opts.maxCount ?? DEFAULT_CONFIG.maxCount
  const dryRun          = opts.dryRun ?? false
  const emptyTrashAfter = opts.emptyTrashAfter ?? false

  let local: DeleteEngine | null = null

  try {
    await storageSet({ [STORAGE_KEYS.emptyTrashAfter]: emptyTrashAfter })

    console.log(
      `${LOG} starting${dryRun ? ' (dry run)' : ''} — ` +
      `maxCount=${maxCount}, emptyTrashAfter=${emptyTrashAfter}`,
    )

    local = new DeleteEngine({ maxCount, dryRun }, reportProgress)
    engine = local
    starting = false

    await local.run()

    // Post-run: if the user asked for empty-trash AND the run wasn't
    // stopped AND wasn't a dry-run, navigate to /trash for the flow.
    // (Stops short-circuit this so a Stop never triggers a navigation.)
    if (local.isStopped || dryRun) return

    let wantEmpty = false
    try {
      const data = await chrome.storage.local.get([STORAGE_KEYS.emptyTrashAfter])
      wantEmpty = !!data[STORAGE_KEYS.emptyTrashAfter]
    } catch (err) {
      console.warn(`${LOG} storage read failed; skipping empty-trash navigation:`, err)
    }
    await storageRemove([STORAGE_KEYS.emptyTrashAfter])

    if (!wantEmpty) return

    console.log(`${LOG} engine done — emptyTrashAfter set, navigating to /trash`)
    const ok = await storageSet({
      [STORAGE_KEYS.pendingEmptyTrash]: { at: Date.now() },
    })
    if (!ok) {
      console.warn(`${LOG} could not persist pending-empty flag; aborting navigation`)
      return
    }
    sendStatus('navigatingTrash')
    await sleep(400) // give chrome.storage / messaging a moment to flush
    window.location.href = TRASH_URL
  } catch (err) {
    console.error(`${LOG} start() failed:`, err)
  } finally {
    starting = false
    // Clear only if we are still the active engine. A subsequent
    // `stop()` may already have nulled it; never overwrite that.
    if (engine === local) engine = null
  }
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
  // Eager clear so the popup's next `status` query reports idle
  // immediately; the engine's own finally will see its instance
  // unchanged and finish its cleanup.
  engine = null
  console.log(`${LOG} stopped`)
}

// ─── Progress reporting ─────────────────────────────────────────

/**
 * Last status we logged to the devtools console. The engine emits
 * dozens of progress events per second during scroll polling — we
 * only log once per status transition to keep the console readable.
 */
let lastLoggedStatus: string | null = null

/**
 * Latest progress snapshot the engine (or empty-trash flow) has
 * reported. Cached so that a popup that opens after losing focus
 * mid-run can hydrate its stats immediately from the next `status`
 * query, instead of showing zeros until the next emit (which never
 * arrives if the run is already done). `asOf` is the wall-clock time
 * we captured the snapshot — used by the popup to compute the real
 * elapsed when the run is in a terminal state.
 */
let lastProgress: Progress | null = null
let lastProgressAt = 0

const reportProgress = (progress: Progress): void => {
  lastProgress = { ...progress }
  lastProgressAt = Date.now()
  chrome.runtime.sendMessage({ type: 'progress', data: progress })
    .catch(() => { /* popup not open */ })

  if (progress.status !== lastLoggedStatus) {
    lastLoggedStatus = progress.status
    console.log(
      `${LOG} ${progress.status} — ${progress.deleted} deleted, ` +
      `${progress.selected} selected`,
    )
  }
}

function sendStatus(status: EmptyTrashStatus | string, extra: Partial<Progress> = {}): void {
  const snapshot: Progress = {
    deleted: 0,
    selected: 0,
    status: status as Progress['status'],
    startedAt: Date.now(),
    ...extra,
  }
  lastProgress = { ...snapshot }
  lastProgressAt = Date.now()
  chrome.runtime.sendMessage({ type: 'progress', data: snapshot })
    .catch(() => { /* popup not open */ })
}

// ─── Storage helpers (never throw) ──────────────────────────────

async function storageSet(items: Record<string, unknown>): Promise<boolean> {
  try {
    await chrome.storage.local.set(items)
    return true
  } catch (err) {
    console.warn(`${LOG} chrome.storage.local.set failed:`, err)
    return false
  }
}

async function storageRemove(keys: string[]): Promise<void> {
  try {
    await chrome.storage.local.remove(keys)
  } catch (err) {
    console.warn(`${LOG} chrome.storage.local.remove failed:`, err)
  }
}

// ─── Empty-trash flow (runs after navigation to /trash) ─────────

/**
 * Wire the testable {@link runEmptyTrashFlow} from ./empty-trash.ts to
 * the real DOM finders and chrome.runtime. The flow re-throws on
 * failure so callers can decide; here we swallow because we've already
 * reported the failure via the onStatus channel above — letting it
 * bubble would log an unhandled-rejection for no extra signal.
 */
async function startEmptyTrashFlow(): Promise<void> {
  await runEmptyTrashFlow({
    findEmptyTrashButton,
    findConfirmDialog,
    findConfirmButton,
    waitFor: (cond, timeoutMs) => waitUntil(cond, timeoutMs, 400),
    sleep,
    log: (msg) => console.log(`${LOG} ${msg}`),
    onStatus: (status, extra) => sendStatus(status, extra),
  }).catch(() => { /* already reported via onStatus */ })
}

/**
 * Consume the pendingEmptyTrash flag if it's fresh AND we just loaded
 * on /trash. The flag is ALWAYS cleared on first sight, regardless of
 * path, so a user who navigates away from /trash before consuming
 * the flag cannot accidentally trigger an empty-trash run later
 * (which would have been a nasty footgun — the previous version left
 * the flag alive for up to 3 minutes, on any photos.google.com page).
 */
async function maybeRunPendingEmptyTrash(): Promise<void> {
  let pending: { at?: number } | undefined
  try {
    const data = await chrome.storage.local.get([STORAGE_KEYS.pendingEmptyTrash])
    pending = data[STORAGE_KEYS.pendingEmptyTrash] as { at?: number } | undefined
  } catch (err) {
    console.warn(`${LOG} pending-empty read failed:`, err)
    return
  }

  if (!pending?.at) return

  // Always clear: the flag is intended for the IMMEDIATE next load.
  // If we're not on /trash or the flag is stale, dropping it now
  // prevents any accidental future trigger.
  await storageRemove([STORAGE_KEYS.pendingEmptyTrash])

  if (Date.now() - pending.at > PENDING_EMPTY_TTL_MS) {
    console.warn(`${LOG} pending empty-trash flag expired, discarded`)
    return
  }

  if (!window.location.pathname.includes(TRASH_PATH)) {
    console.log(`${LOG} pending empty-trash flag set but not on /trash — discarded`)
    return
  }

  await startEmptyTrashFlow()
}

// ─── Message routing ────────────────────────────────────────────

/**
 * Accept only messages from this extension's own popup / background.
 * `sender.id` is set for any extension-to-extension message; if it
 * exists and isn't us, drop the message. (Web-page senders are
 * already blocked at the manifest level — we don't declare
 * `externally_connectable.matches` — but this is cheap defence in
 * depth.)
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id && sender.id !== chrome.runtime.id) {
    console.warn(`${LOG} ignoring message from foreign sender:`, sender.id)
    return
  }
  if (!message || typeof message !== 'object') return

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
      // Echo the cached progress so a popup that re-opens after losing
      // focus mid-run can hydrate its stats immediately, rather than
      // showing zeros until the next emit (which never arrives if the
      // run has already finished).
      sendResponse({
        running: !!engine,
        paused: engine?.isPaused ?? false,
        progress: lastProgress,
        progressAsOf: lastProgressAt,
      })
      break
    default:
      sendResponse({ ok: false, error: `unknown action: ${String(message.action)}` })
      break
  }
})

// ─── Bootstrap ──────────────────────────────────────────────────

console.log(`${LOG} loaded on ${window.location.pathname}`)
void maybeRunPendingEmptyTrash()
