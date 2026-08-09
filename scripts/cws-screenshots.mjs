/**
 * Real listing screenshots — browser handoff on a real Google Photos
 * session (the user's own account, their own photos).
 *
 * Safe captures (no clicks): dry-run result, Pro filters panel state.
 * Destructive captures (real delete / empty trash) require:
 *   node scripts/cws-screenshots.mjs --allow-destructive
 * and demand the user is watching — the tool deletes REAL photos and
 * empty-trash is permanent. Never run destructive captures unattended.
 *
 * Build first: bun run build (injects dist/userscript/…).
 */
import { readFile } from 'node:fs/promises'
import { mkdir, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect, newTab, requireUrl } from './lib/handoff.mjs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const allowDestructive = process.argv.includes('--allow-destructive')
const outDir = resolve(root, 'storefront/screenshots')
await mkdir(outDir, { recursive: true })

const userJs = resolve(root, 'dist/userscript/google-photos-delete.user.js')
try {
  await stat(userJs)
} catch {
  console.error('cws-screenshots: run "bun run build" first (dist/userscript missing)')
  process.exit(2)
}
const source = await readFile(userJs, 'utf-8')

const browser = await connect()
const page = await newTab(browser, 'https://photos.google.com')
await requireUrl(page, /photos\.google\.com/, 'Google Photos (sign in first if redirected)')
await page.setViewportSize({ width: 1280, height: 800 })

// Inject the userscript engine into this page (same IIFE the userscript ships).
await page.evaluate((src) => {
  const fn = new Function(`${src}\n//# sourceURL=gpdt-userscript.js`)
  fn()
}, source)

const panel = page.locator('#gpdt-panel-root')
await panel.waitFor({ timeout: 20000 }).catch(async () => {
  console.error('cws-screenshots: panel did not appear — Google Photos may have changed; see page text:')
  console.error((await page.locator('body').innerText()).slice(0, 800))
  process.exit(1)
})

const shot = async (name) => {
  const path = resolve(outDir, name)
  await page.screenshot({ path, clip: { x: 0, y: 0, width: 1280, height: 800 } })
  console.log(`cws-screenshots: ${path}`)
}

// 1) dry run
await page.check('#gpdt-dryrun')
await page.click('#gpdt-start')
await page.waitForFunction(() => {
  const s = document.querySelector('#gpdt-status')?.textContent ?? ''
  return /counted/i.test(s)
}, { timeout: 120000 })
await page.waitForTimeout(1500)
await shot('dry-run.png')

// 2) Pro filters (only if a Pro license is active in this session)
const filterEnabled = await page.locator('#gpdt-filter').isEnabled().catch(() => false)
if (filterEnabled) {
  await page.selectOption('#gpdt-filter', { label: /screenshot/i })
  await page.uncheck('#gpdt-dryrun')
  await page.click('#gpdt-start')
  await page.waitForFunction(() => {
    const s = document.querySelector('#gpdt-status')?.textContent ?? ''
    return /counted/i.test(s)
  }, { timeout: 120000 }).catch(() => {})
  await page.waitForTimeout(1500)
  await shot('filters.png')
} else {
  console.log('cws-screenshots: no active Pro license in this session — filters.png skipped (Pro filter is disabled without a license)')
}

if (allowDestructive) {
  console.warn('cws-screenshots: destructive captures — confirm the view has only photos you may delete, and watch the run.')
  await page.check('#gpdt-empty')
  await page.click('#gpdt-start')
  await page.waitForFunction(() => {
    const s = document.querySelector('#gpdt-status')?.textContent ?? ''
    return /deleted|done|finish|complete|stopped|error/i.test(s)
  }, { timeout: 600000 }).catch(() => {})
  await page.waitForTimeout(1500)
  await shot('running.png')
} else {
  console.log('cws-screenshots: running.png / empty-trash.png skipped — re-run with --allow-destructive while watching the browser')
}

await browser.close()
