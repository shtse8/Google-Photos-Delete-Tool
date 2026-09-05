/**
 * Content script — wires the DeleteEngine to chrome.runtime messages
 * from the popup and owns the "empty-trash" post-deletion navigation
 * (unified storage baton, survives the page reload).
 *
 * Lifecycle rules (root-cause fixes for the v2 races):
 *  - `engine` stays non-null until the run promise settles, so a Stop
 *    followed by an eager Start can never create a second engine while
 *    the first may still be clicking a confirm button.
 *  - Start is refused without a stored consent acknowledgment for any
 *    real (non-dry) run.
 *  - Stop resolves the engine to 'idle', never 'error'.
 *
 * All async chrome.* calls go through src/extension/api.ts promise
 * wrappers (callback-based) so this file is identical for Chromium MV3
 * and Firefox MV3. Only event listeners (`chrome.runtime.onMessage`)
 * use the raw API — they are callback-based in both browsers.
 */
import { DEFAULT_CONFIG, DeleteEngine, type Progress } from '../core'
import type { PhotoFilter } from '../core/photo-filter'
import { browserDom } from '../core/browser-dom'
import { findConfirmButton, findConfirmDialog, findEmptyTrashButton, isTrashEmpty } from '../core/selectors'
import { sleep, waitUntil } from '../core/utils'
import { diagnostics } from '../core/diagnostics'
import { evaluatePendingEmptyTrash, TRASH_URL } from '../core/empty-trash-baton'
import { runEmptyTrashFlow, type EmptyTrashStatus } from '../core/empty-trash'
import type { RunStatus } from '../core/status'
import { isSupportedPhotosUrl } from '../core/surface'
import {
  CONSENT_KEY,
  EMPTY_TRASH_ACK_KEY,
  EXTENSION_ADMISSION_ERROR,
  RUN_IN_PROGRESS_ERROR,
  admitConcurrentStart,
  admitDestructiveRun,
  shouldNavigateToEmptyTrash,
  type Acknowledgement,
} from '../core/consent'
import { createChromeBaton, runtimeSendMessage, storageGet, storageRemove, storageSet } from './api'

const LOG = '[gpdt:content]'

const STORAGE_KEYS = {
  /** Set by the popup; observed once when the engine finishes. */
  emptyTrashAfter: 'gpdt_emptyAfter',
  consent: CONSENT_KEY,
  emptyTrashAck: EMPTY_TRASH_ACK_KEY,
} as const

async function readChromeAcknowledgement(key: string): Promise<Acknowledgement> {
  try {
    const data = await storageGet([key])
    return { readable: true, acknowledged: Boolean(data[key]) }
  } catch (err) {
    console.warn(`${LOG} acknowledgement read failed (${key}):`, err)
    return { readable: false, acknowledged: false }
  }
}

// ─── Engine lifecycle ───────────────────────────────────────────

let engine: DeleteEngine | null = null
let runPromise: Promise<void> | null = null
let starting = false

interface StartOptions {
  maxCount?: number
  dryRun?: boolean
  emptyTrashAfter?: boolean
  filter?: PhotoFilter
}

const start = async (opts: StartOptions): Promise<{ ok: boolean; error?: string }> => {
  if (!isSupportedPhotosUrl(window.location.href)) {
    return { ok: false, error: 'Not on photos.google.com.' }
  }
  if (!admitConcurrentStart(engine !== null || runPromise !== null || starting).ok) {
    return { ok: false, error: RUN_IN_PROGRESS_ERROR }
  }
  starting = true
  try {
    const maxCount = opts.maxCount ?? DEFAULT_CONFIG.maxCount
    const dryRun = opts.dryRun ?? false
    const emptyTrashAfter = opts.emptyTrashAfter ?? false
    const filter = opts.filter ?? { kind: 'all' as const }

    let consent: Acknowledgement = { readable: true, acknowledged: false }
    let emptyTrashAck: Acknowledgement = { readable: true, acknowledged: false }
    if (!dryRun) {
      consent = await readChromeAcknowledgement(STORAGE_KEYS.consent)
      if (emptyTrashAfter) {
        emptyTrashAck = await readChromeAcknowledgement(STORAGE_KEYS.emptyTrashAck)
      }
    }
    const admission = admitDestructiveRun({ dryRun, emptyTrashAfter, consent, emptyTrashAck })
    if (!admission.ok) {
      return { ok: false, error: EXTENSION_ADMISSION_ERROR[admission.reason] }
    }

    try {
      await storageSet({ [STORAGE_KEYS.emptyTrashAfter]: emptyTrashAfter })
    } catch (err) {
      console.warn(`${LOG} emptyTrashAfter persist failed:`, err)
    }

    console.log(
      `${LOG} starting${dryRun ? ' (dry run)' : ''} — ` +
      `maxCount=${maxCount}, emptyTrashAfter=${emptyTrashAfter}, filter=${JSON.stringify(filter)}`,
    )

    const local = new DeleteEngine({
      dom: browserDom,
      config: { maxCount, dryRun },
      filter,
      onProgress: reportProgress,
    })
    engine = local
    diagnostics.reset()

    runPromise = (async () => {
      try {
        const result = await local.run()
        await maybeChainEmptyTrash(local, dryRun, result)
      } finally {
        if (engine === local) engine = null
        runPromise = null
      }
    })()
    return { ok: true }
  } finally {
    starting = false
  }
}

const pause = (): void => {
  if (!engine || engine.isStopped) return
  engine.pause()
}

const resume = (): void => {
  if (!engine || engine.isStopped) return
  engine.resume()
}

const stop = (): void => {
  // Keep `engine` non-null until the run promise settles so a new Start
  // cannot race the tail of a stopped run. The engine resolves 'idle'.
  engine?.stop()
}

const isRunning = (): boolean => engine !== null && !engine.isStopped

// ─── Empty-trash chain (after a clean real run) ─────────────────

const baton = createChromeBaton()

async function maybeChainEmptyTrash(
  local: DeleteEngine,
  dryRun: boolean,
  result: Progress,
): Promise<void> {
  let wantEmpty = false
  try {
    const data = await storageGet([STORAGE_KEYS.emptyTrashAfter])
    wantEmpty = !!data[STORAGE_KEYS.emptyTrashAfter]
  } catch (err) {
    console.warn(`${LOG} storage read failed; skipping empty-trash navigation:`, err)
  }
  await clearEmptyAfter()
  if (!shouldNavigateToEmptyTrash({
    dryRun,
    emptyTrashAfter: wantEmpty,
    stopped: local.isStopped,
    status: result.status,
    deleted: result.deleted,
  })) {
    if (wantEmpty) {
      console.warn(`${LOG} skipping empty-trash navigation — status=${result.status}, deleted=${result.deleted}`)
    }
    return
  }

  console.log(`${LOG} engine done — emptyTrashAfter set, navigating to /trash`)
  const ok = await baton.writePending()
  if (!ok) {
    console.warn(`${LOG} could not persist pending-empty flag; aborting navigation`)
    return
  }
  sendStatus('navigatingTrash')
  await sleep(100)
  window.location.href = TRASH_URL
}

async function clearEmptyAfter(): Promise<void> {
  try {
    await storageRemove([STORAGE_KEYS.emptyTrashAfter])
  } catch (err) {
    console.warn(`${LOG} emptyTrashAfter clear failed:`, err)
  }
}

/**
 * Consume the pending empty-trash flag if fresh AND on /trash. The flag
 * is ALWAYS cleared on first sight so a stale flag can never trigger an
 * accidental permanent empty later.
 */
async function maybeRunPendingEmptyTrash(): Promise<void> {
  const pending = await baton.readPending()
  await baton.clearPending()
  const evalResult = evaluatePendingEmptyTrash(pending, Date.now(), window.location.pathname)
  if (!evalResult.shouldRun) return

  sendStatus('emptyingTrash')
  await runEmptyTrashFlow({
    findEmptyTrashButton,
    findConfirmDialog,
    findConfirmButton,
    isTrashEmpty,
    waitFor: (cond, timeoutMs) => waitUntil(cond, timeoutMs, 400),
    sleep,
    log: (msg) => console.log(`${LOG} ${msg}`),
    onStatus: (status: EmptyTrashStatus, extra?: { error?: string }) => {
      sendStatus(status, extra)
    },
  }).catch(() => { /* already reported via onStatus */ })
}

// ─── Progress reporting ─────────────────────────────────────────

let lastLoggedStatus: string | null = null
let lastProgress: Progress | null = null
let lastProgressAt = 0

const reportProgress = (progress: Progress): void => {
  lastProgress = { ...progress }
  lastProgressAt = Date.now()
  runtimeSendMessage({ type: 'progress', data: progress })
    .catch(() => { /* popup not open */ })

  if (progress.status !== lastLoggedStatus) {
    lastLoggedStatus = progress.status
    console.log(
      `${LOG} ${progress.status} — ${progress.deleted} deleted, ` +
      `${progress.selected} selected`,
    )
  }
}

function sendStatus(status: RunStatus | string, extra: Partial<Progress> = {}): void {
  const snapshot: Progress = {
    deleted: 0,
    selected: 0,
    status: status as Progress['status'],
    startedAt: Date.now(),
    ...extra,
  }
  lastProgress = { ...snapshot }
  lastProgressAt = Date.now()
  runtimeSendMessage({ type: 'progress', data: snapshot })
    .catch(() => { /* popup not open */ })
}

// ─── Message routing ────────────────────────────────────────────

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
        filter: message.filter as PhotoFilter | undefined,
      }).then(sendResponse)
      return true // async response
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
    case 'status':
      sendResponse({
        running: isRunning(),
        paused: engine?.isPaused ?? false,
        progress: lastProgress,
        progressAsOf: lastProgressAt,
      })
      break
    case 'diagnostics':
      sendResponse({ blob: diagnostics.blob() })
      break
    case 'report': {
      // Dry-run report for the popup: summary + labels (Pro CSV export).
      const dryRunLabels = engine ? engine.getDryRunLabels() : []
      const labels = dryRunLabels.length > 0 ? [...dryRunLabels] : undefined
      const total = lastProgress?.total ?? (labels ? labels.length : undefined)
      sendResponse({ summary: labels ? { total: total ?? labels.length, labels } : null })
      break
    }
    default:
      sendResponse({ ok: false, error: `unknown action: ${String(message.action)}` })
      break
  }
  return undefined
})

// ─── Bootstrap ──────────────────────────────────────────────────

console.log(`${LOG} loaded on ${window.location.pathname}`)
if (isSupportedPhotosUrl(window.location.href)) {
  void maybeRunPendingEmptyTrash()
}
