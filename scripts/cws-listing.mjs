/**
 * CWS dashboard listing update — browser handoff fallback.
 *
 * Used only when the metadata API fails (item in review → 304, or API
 * sunset). The single source stays storefront/listing.json; this script
 * pastes it into the Developer Console.
 *
 *   node scripts/cws-listing.mjs --item-id jiahfbbfpacpolomdjlpdpiljllcdenb
 *
 * If selectors drift, the script prints the visible page text instead of
 * guessing — adapt the selectors, never the copy.
 */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect, newTab, requireUrl } from './lib/handoff.mjs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const listing = JSON.parse(await readFile(resolve(root, 'storefront/listing.json'), 'utf-8'))
const cws = listing.cws
const itemIdArg = process.argv.indexOf('--item-id')
const itemId = itemIdArg !== -1 ? process.argv[itemIdArg + 1] : ''

if (!itemId) {
  console.error('usage: node scripts/cws-listing.mjs --item-id <extension-id>')
  process.exit(2)
}

const browser = await connect()
const page = await newTab(browser, 'https://chrome.google.com/webstore/devconsole')
await requireUrl(page, /chrome\.google\.com/, 'the CWS Developer Console (sign in first if redirected)')

// Item list: find the row whose link contains our item id.
const itemLink = page.locator(`a[href*="${itemId}"]`).first()
await itemLink.waitFor({ timeout: 60000 }).catch(async () => {
  console.error('cws-listing: item not found on the dashboard — printing page text:')
  console.error((await page.locator('body').innerText()).slice(0, 1500))
  process.exit(1)
})
await itemLink.click()
await page.waitForLoadState('domcontentloaded')

// Store listing tab
await page.getByRole('link', { name: /store listing/i }).click().catch(async () => {
  console.error('cws-listing: Store listing tab not found — printing page text:')
  console.error((await page.locator('body').innerText()).slice(0, 1500))
  process.exit(1)
})

const summary = page.getByPlaceholder(/summary/i).first()
await summary.fill(cws.summary)
const description = page.getByPlaceholder(/detailed description/i).first()
await description.fill(cws.description.join('\n\n'))

await page.getByRole('button', { name: /save draft/i }).click().catch(() => page.getByRole('button', { name: /save/i }).first().click())
await page.waitForTimeout(3000)
console.log('cws-listing: saved. Verify on the dashboard and in the live listing after review.')
await browser.close()
