/**
 * Install and uninstall moments. Both only hand the browser a URL to open on
 * our own landing site; the extension makes no network call itself. URLs carry
 * the extension version at most, never a user or library identifier. Any
 * measurement happens on the site, behind its consent banner (site/tracking.js).
 */
import { tabsCreate } from './api'

export const SITE_URL = 'https://sylphxai.github.io/Google-Photos-Delete-Tool/'
/** Landing page "how it works" section, shown once after a fresh install. */
export const WELCOME_URL = `${SITE_URL}#how`
export const UNINSTALL_URL = `${SITE_URL}bye.html`

export function uninstallUrl(version: string): string {
  return `${UNINSTALL_URL}?v=${encodeURIComponent(version)}`
}

/** Opens the welcome section on a fresh install only (not update, not browser update). */
export function handleInstalled(details: { reason?: string }): void {
  if (details.reason !== 'install') return
  void tabsCreate({ url: WELCOME_URL }).catch((err) => {
    console.warn('[gpdt:background] welcome tab failed:', err)
  })
}

export function setUninstallUrl(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.runtime.setUninstallURL(url, () => {
      const err = chrome.runtime.lastError
      if (err) reject(new Error(err.message))
      else resolve()
    })
  })
}

/** Registered at every worker start: the uninstall URL must be set on install and kept after updates. */
export function registerLifecycle(): void {
  chrome.runtime.onInstalled.addListener(handleInstalled)
  void setUninstallUrl(uninstallUrl(chrome.runtime.getManifest().version)).catch((err) => {
    console.warn('[gpdt:background] uninstall URL failed:', err)
  })
}
