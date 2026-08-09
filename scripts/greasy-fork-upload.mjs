/**
 * Greasy Fork has NO public API — this is the browser-handoff upload.
 *
 * Form contract verified from the Greasy Fork source (Rails app):
 *   GET /en/script_versions/new  (redirects to sign-in when logged out)
 *   fields: #code-upload (file), name, description, changelog
 *
 * Flow: connect to the user's logged-in Chrome → open the upload form →
 * attach the userscript file → fill name/description from
 * storefront/listing.json → submit → verify the script page loads.
 * Greasy Fork then auto-updates from the GitHub release @updateURL on
 * every future release — this upload is the ENTIRE lifetime cost.
 *
 *   node scripts/greasy-fork-upload.mjs [--file path/to/google-photos-delete.user.js]
 */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect, newTab, requireUrl } from './lib/handoff.mjs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const listing = JSON.parse(await readFile(resolve(root, 'storefront/listing.json'), 'utf-8'))
const amo = listing.amo
const fileArg = process.argv.indexOf('--file')
const file = fileArg !== -1 ? process.argv[fileArg + 1] : resolve(root, 'dist/userscript/google-photos-delete.user.js')

const browser = await connect()
const page = await newTab(browser, 'https://greasyfork.org/en/script_versions/new')
await requireUrl(page, /script_versions|scripts/, 'the Greasy Fork upload form (sign in first if redirected)')

const name = page.locator('#name, input[name="name"]').first()
await name.fill(amo.name)
await page.locator('#code-upload').setInputFiles(file)
await page.locator('textarea[name="description"]').fill(amo.description.join('\n\n'))

console.log('greasy-fork: form filled — submitting…')
await page.locator('input[type="submit"], button[type="submit"]').first().click()
await page.waitForURL(/\/scripts\/\d+/, { timeout: 60000 })
console.log(`greasy-fork: LIVE at ${page.url()}`)
await browser.close()
