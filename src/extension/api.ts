/**
 * Promise wrappers over the extension API, built on CALLBACKS.
 *
 * Chrome MV3 supports promises on chrome.*; Firefox's chrome.* is
 * callback-based (promises live on browser.*). Callbacks are supported
 * in BOTH (Chrome MV3 keeps callbacks for backward compatibility), so a
 * single promise wrapper keeps one codebase for Chromium + Firefox with
 * no polyfill and no dual namespaces.
 */
import type { EmptyTrashBaton } from '../core/empty-trash-baton'

export function storageGet(keys: string | string[]): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (data) => {
      const err = chrome.runtime.lastError
      if (err) reject(new Error(err.message))
      else resolve(data as Record<string, unknown>)
    })
  })
}

export function storageSet(items: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(items, () => {
      const err = chrome.runtime.lastError
      if (err) reject(new Error(err.message))
      else resolve()
    })
  })
}

export function storageRemove(keys: string | string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(keys, () => {
      const err = chrome.runtime.lastError
      if (err) reject(new Error(err.message))
      else resolve()
    })
  })
}

export function runtimeSendMessage(message: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const err = chrome.runtime.lastError
      if (err) reject(new Error(err.message))
      else resolve(response)
    })
  })
}

export function tabsQuery(query: chrome.tabs.QueryInfo): Promise<chrome.tabs.Tab[]> {
  return new Promise((resolve, reject) => {
    chrome.tabs.query(query, (tabs) => {
      const err = chrome.runtime.lastError
      if (err) reject(new Error(err.message))
      else resolve(tabs)
    })
  })
}

export function tabsSendMessage(tabId: number, message: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const err = chrome.runtime.lastError
      if (err) reject(err)
      else resolve(response)
    })
  })
}

export function tabsCreate(createProperties: chrome.tabs.CreateProperties): Promise<chrome.tabs.Tab> {
  return new Promise((resolve, reject) => {
    chrome.tabs.create(createProperties, (tab) => {
      const err = chrome.runtime.lastError
      if (err) reject(new Error(err.message))
      else resolve(tab)
    })
  })
}

export function setBadgeText(details: chrome.action.BadgeTextDetails): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.action.setBadgeText(details, () => {
      const err = chrome.runtime.lastError
      if (err) reject(new Error(err.message))
      else resolve()
    })
  })
}

export function setBadgeBackgroundColor(details: chrome.action.BadgeBackgroundColorDetails): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.action.setBadgeBackgroundColor(details, () => {
      const err = chrome.runtime.lastError
      if (err) reject(new Error(err.message))
      else resolve()
    })
  })
}

/**
 * chrome.storage-backed empty-trash baton (extension flavor). Moved here
 * from core so core stays free of any chrome.* references.
 */
const PENDING_KEY = 'gpdt_pendingEmpty'

export function createChromeBaton(): EmptyTrashBaton {
  return {
    async readPending() {
      try {
        const data = await storageGet([PENDING_KEY])
        const pending = data[PENDING_KEY] as { at?: number } | undefined
        if (pending && typeof pending.at === 'number') return { at: pending.at }
        return null
      } catch (err) {
        console.warn('[gpdt:baton] pending read failed:', err)
        return null
      }
    },
    async writePending(at = Date.now()) {
      try {
        await storageSet({ [PENDING_KEY]: { at } })
        return true
      } catch (err) {
        console.warn('[gpdt:baton] pending write failed:', err)
        return false
      }
    },
    async clearPending() {
      try {
        await storageRemove([PENDING_KEY])
      } catch (err) {
        console.warn('[gpdt:baton] pending clear failed:', err)
      }
    },
  }
}
