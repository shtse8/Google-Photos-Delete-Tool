/**
 * Edge Add-ons bootstrap — browser handoff (one-time, guided).
 *
 * Microsoft has NO API for creating a product (verified 2026-08-09 from
 * Microsoft's Update REST API docs) — the first product must be created
 * in Partner Center once. This script drives the user's authenticated
 * session for the mechanical parts and stops for review at each step.
 *
 *   node scripts/edge-bootstrap.mjs open          # navigate to Edge overview
 *   node scripts/edge-bootstrap.mjs upload-zip    # attach google-photos-delete-tool.zip
 *   node scripts/edge-bootstrap.mjs fill-listing  # paste edge copy from listing.json
 *   node scripts/edge-bootstrap.mjs submit        # click submit for certification
 *
 * Partner Center is JS-heavy and changes often: any drift prints the
 * visible page text instead of guessing (agent adapts, never fakes).
 * After certification, the Update REST API (store-retry loop) takes over
 * forever — this is the only browser step in Edge's lifecycle.
 */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect, newTab } from './lib/handoff.mjs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const listing = JSON.parse(await readFile(resolve(root, 'storefront/listing.json'), 'utf-8'))
const edge = listing.edge
const cmd = process.argv[2]

if (!cmd) {
  console.error('usage: node scripts/edge-bootstrap.mjs <open|upload-zip|fill-listing|submit>')
  process.exit(2)
}

const browser = await connect()
const page = await newTab(browser, 'https://partner.microsoft.com/dashboard/microsoftedge/overview')

const show = async () => {
  console.error('edge-bootstrap: page state (adapt selectors from this):')
  console.error((await page.locator('body').innerText()).slice(0, 1200))
  process.exit(1)
}

if (cmd === 'open') {
  console.log('edge-bootstrap: Edge overview open. Steps: Create new extension → upload package → Availability → Properties → Privacy → Store listings → Submit. Run the next subcommand after each page.')
} else if (cmd === 'upload-zip') {
  const input = page.locator('input[type="file"]').first()
  await input.waitFor({ timeout: 60000 }).catch(show)
  await input.setInputFiles(resolve(root, 'google-photos-delete-tool.zip'))
  console.log('edge-bootstrap: zip attached — click Continue in the browser and run "fill-listing" next.')
} else if (cmd === 'fill-listing') {
  const fill = async (label, value) => {
    const field = page.getByLabel(new RegExp(label, 'i')).first()
    const editable = page.locator(`[aria-label*="${label}" i]`).first()
    const target = (await field.count()) ? field : editable
    if ((await target.count()) === 0) {
      console.error(`edge-bootstrap: field "${label}" not found`)
      await show()
    }
    await target.fill(value)
  }
  await fill('Name', edge.name)
  await fill('Short description', edge.shortDescription)
  const desc = page.locator('[data-testid*="description" i], textarea').filter({ hasText: /description/i }).first()
  await desc.fill(edge.description.join('\n\n')).catch(async () => {
    console.error('edge-bootstrap: description field not found')
    await show()
  })
  console.log('edge-bootstrap: listing filled — review every field in the browser, then run "submit".')
} else if (cmd === 'submit') {
  await page.getByRole('button', { name: /submit for certification/i }).click().catch(() => page.getByRole('button', { name: /submit/i }).first().click())
  console.log('edge-bootstrap: submitted for certification (if the click landed).')
} else {
  console.error(`edge-bootstrap: unknown command "${cmd}"`)
  process.exit(2)
}

await browser.close()
