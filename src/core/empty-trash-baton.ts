/**
 * Unified "empty trash after run" storage baton.
 *
 * The in-page runner (userscript / standalone) uses localStorage; the
 * extension flavor (chrome.storage.local) lives in the extension layer
 * (src/extension/api.ts) so `core/` stays free of chrome.* references.
 * Same semantics everywhere: the flag targets the IMMEDIATE next page
 * load on /trash, expires after `PENDING_EMPTY_TTL_MS`, and is always
 * cleared on first sight so a stale flag can never trigger an accidental
 * permanent empty later.
 */

export const PENDING_EMPTY_TTL_MS = 180_000
export const TRASH_PATH = '/trash'
export const TRASH_URL = `https://photos.google.com${TRASH_PATH}`

export interface EmptyTrashBaton {
  readPending(): Promise<{ at: number } | null>
  writePending(at?: number): Promise<boolean>
  clearPending(): Promise<void>
}

export interface PendingEval {
  shouldRun: boolean
  reason: 'missing' | 'expired' | 'wrong-page' | 'ok'
}

/**
 * Exact /trash path match — `/trash` or `/trash/...`. A substring check
 * would wrongly accept any future path containing "/trash" (e.g.
 * "/trashbin"), which could trigger an accidental permanent empty.
 */
export function isTrashPath(pathname: string): boolean {
  return pathname === TRASH_PATH || pathname.startsWith(`${TRASH_PATH}/`)
}

export function evaluatePendingEmptyTrash(
  pending: { at?: number } | null | undefined,
  now: number,
  pathname: string,
): PendingEval {
  if (!pending || typeof pending.at !== 'number') return { shouldRun: false, reason: 'missing' }
  if (now - pending.at > PENDING_EMPTY_TTL_MS) return { shouldRun: false, reason: 'expired' }
  if (!isTrashPath(pathname)) return { shouldRun: false, reason: 'wrong-page' }
  return { shouldRun: true, reason: 'ok' }
}

const PENDING_KEY = 'gpdt_pendingEmpty'

export function createLocalStorageBaton(storageKey = PENDING_KEY): EmptyTrashBaton {
  return {
    async readPending() {
      try {
        const raw = window.localStorage.getItem(storageKey)
        if (!raw) return null
        const parsed = JSON.parse(raw) as { at?: number }
        return typeof parsed.at === 'number' ? { at: parsed.at } : null
      } catch (err) {
        console.warn('[gpdt:baton] localStorage pending read failed:', err)
        return null
      }
    },
    async writePending(at = Date.now()) {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify({ at }))
        return true
      } catch (err) {
        console.warn('[gpdt:baton] localStorage pending write failed:', err)
        return false
      }
    },
    async clearPending() {
      try {
        window.localStorage.removeItem(storageKey)
      } catch (err) {
        console.warn('[gpdt:baton] localStorage pending clear failed:', err)
      }
    },
  }
}
