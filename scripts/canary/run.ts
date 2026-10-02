/**
 * Selector-drift canary. Drives Chromium against photos.google.com with a
 * disposable account's session and checks that every selector in the active
 * pack still matches. No telemetry, no delete: it opens the grid, selects ONE
 * tile with its checkbox (a UI-only state, undone straight after), looks for
 * the toolbar trash button, and never clicks it. See docs/CANARY.md.
 *
 *   GPDT_CANARY_STORAGE_STATE='<storage-state JSON>' bun run canary
 *   GPDT_CANARY_STORAGE_STATE_FILE=/path/state.json bun run canary
 *
 * Browser: CHROMIUM_PATH, else /usr/bin/google-chrome.
 * Exit: 0 ok, 1 drift, 2 session expired / not signed in, 3 canary error or safety violation, 78 no session supplied.
 * The session is never logged or written; output is the JSON summary only.
 */
import { chromium, type Page } from 'playwright-core'
import { writeFile } from 'node:fs/promises'
import { PACK } from '../../src/core/selector-pack'
import { buildChecks, evaluateDrift, type CandidateCounts, type CheckSpec } from './evaluate'
import { assertSafeClick, guardScript } from './safety'

const PHOTOS_URL = 'https://photos.google.com/'

async function loadStorageState(): Promise<{ cookies: unknown[]; origins: unknown[] } | string | null> {
  const file = process.env.GPDT_CANARY_STORAGE_STATE_FILE
  if (file) return file
  const raw = process.env.GPDT_CANARY_STORAGE_STATE
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error('GPDT_CANARY_STORAGE_STATE is not valid JSON')
  }
}

async function countAll(page: Page, specs: CheckSpec[]): Promise<Record<string, CandidateCounts>> {
  return page.evaluate((list) => {
    const n = (sel: string): number | null => {
      try {
        return document.querySelectorAll(sel).length
      } catch {
        return null
      }
    }
    const out: Record<string, { primary: number | null; fallbacks: Array<number | null> }> = {}
    for (const s of list) out[s.id] = { primary: n(s.primary), fallbacks: s.fallbacks.map(n) }
    return out
  }, specs.map(({ id, primary, fallbacks }) => ({ id, primary, fallbacks })))
}

/** The one click the canary makes: toggle a selection checkbox. Guarded by assertSafeClick. */
async function toggleCheckbox(page: Page, selector: string): Promise<void> {
  assertSafeClick(selector)
  await page.locator(selector).first().click({ force: true, timeout: 10_000 })
}

async function main(): Promise<number> {
  const storageState = await loadStorageState()
  if (!storageState) {
    console.error('canary: no session supplied (GPDT_CANARY_STORAGE_STATE or GPDT_CANARY_STORAGE_STATE_FILE); skipping')
    return 78
  }
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome' })
  try {
    const context = await browser.newContext({ storageState: storageState as never, viewport: { width: 1440, height: 900 } })
    await context.addInitScript(guardScript())
    const page = await context.newPage()
    await page.goto(PHOTOS_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForTimeout(8_000)
    if (/accounts\.google\.com/.test(page.url()) || !/photos\.google\.com/.test(page.url())) {
      console.error('canary: session expired or not signed in; this is not selector drift')
      return 2
    }

    const specs = buildChecks()
    const grid = specs.filter((s) => s.stage === 'grid')
    const after = specs.filter((s) => s.stage === 'after-select' && !s.skipReason)
    const observations: Record<string, CandidateCounts> = await countAll(page, grid)

    // Select one tile through the pack's own checkbox selector, observe, then undo.
    const checkbox = grid.find((s) => s.id === 'checkbox')!
    const candidates = [checkbox.primary, ...checkbox.fallbacks]
    for (const sel of candidates) {
      if (((await page.locator(sel).count().catch(() => 0)) ?? 0) > 0) {
        await toggleCheckbox(page, sel)
        await page.waitForTimeout(1_500)
        break
      }
    }
    Object.assign(observations, await countAll(page, after))
    const checked = PACK.selectors.checkboxChecked
    for (const sel of [checked.primary, ...checked.fallbacks]) {
      if (((await page.locator(sel).count().catch(() => 0)) ?? 0) > 0) {
        await toggleCheckbox(page, sel) // deselect again
        break
      }
    }

    const blocked: string[] = await page.evaluate(() => (window as unknown as { __canaryBlocked?: string[] }).__canaryBlocked ?? [])
    if (blocked.length) {
      console.error(`canary: safety guard blocked ${blocked.length} destructive event(s); aborting`)
      return 3
    }

    const summary = evaluateDrift(observations)
    const json = JSON.stringify(summary, null, 2)
    console.log(json)
    if (process.env.GPDT_CANARY_SUMMARY_FILE) await writeFile(process.env.GPDT_CANARY_SUMMARY_FILE, json + '\n')
    return summary.verdict === 'drift' ? 1 : 0
  } finally {
    await browser.close()
  }
}

main().then(
  (code) => process.exit(code),
  (err: Error) => {
    console.error(`canary: error: ${err.message.split('\n')[0]}`)
    process.exit(3)
  },
)
