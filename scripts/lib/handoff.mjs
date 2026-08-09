/**
 * Browser handoff — drive the USER's already-authenticated browser.
 *
 * The agent never receives passwords, cookies, or session tokens. The
 * user starts Chrome with a local debugging port (127.0.0.1 ONLY), logs
 * in themselves, and these scripts drive that session through CDP. This
 * is "agent-native": the agent does the work, the user keeps identity.
 *
 * Start Chrome (quit it first, then):
 *   macOS:    open -a "Google Chrome" --args --remote-debugging-port=9222
 *   Linux:    google-chrome --remote-debugging-port=9222
 *   Windows:  "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
 *
 * Security: the debug port is a local-only control channel. Close Chrome
 * (or quit the port) when the session is done. Never expose it remotely.
 */
import { chromium } from 'playwright-core'

export async function connect(port = 9222) {
  const url = `http://127.0.0.1:${port}`
  try {
    return await chromium.connectOverCDP(url)
  } catch (err) {
    console.error(`handoff: cannot connect to ${url} — start Chrome with --remote-debugging-port=${port} first (see scripts/lib/handoff.mjs header)`)
    console.error(`handoff: ${err.message}`)
    process.exit(1)
  }
}

/** Open a new tab in the user's session (shares cookies/identity). */
export async function newTab(browser, url) {
  const context = browser.contexts()[0] ?? (await browser.newContext())
  const page = await context.newPage()
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
  return page
}

export async function requireUrl(page, pattern, what) {
  const ok = pattern.test(page.url())
  if (!ok) {
    console.error(`handoff: expected ${what} but landed on ${page.url()}`)
    console.error('handoff: log in manually in this browser tab, then re-run')
    process.exit(1)
  }
  return true
}
