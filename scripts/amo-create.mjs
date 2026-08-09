/**
 * AMO API v5 — create the add-on + submit the first listed version.
 *
 * Makes the entire AMO bootstrap API-native: with API credentials
 * (FIREFOX_JWT_ISSUER / FIREFOX_JWT_SECRET) no browser is ever needed.
 * Flow (per Mozilla's submission API docs, verified 2026-08-09):
 *   1. POST /addons/upload/        (multipart zip, channel=listed)  → uuid
 *   2. GET  /addons/upload/<uuid>/  (poll until valid:true, max 10 min)
 *   3. POST /addons/addon/         (categories, summary, version{upload,license})
 *   4. PATCH /addons/addon/<id>/   (description — translated field)
 *   5. GET  /addons/addon/<id>/    (verify + print listing URL)
 *
 * Metadata comes from storefront/listing.json (amo section) — the single
 * source of truth. Failure is loud: existing add-on, validation errors,
 * or auth errors all exit 1 with the platform response.
 *
 * Usage:
 *   node scripts/amo-create.mjs --zip google-photos-delete-tool-firefox.zip
 *   node scripts/amo-create.mjs --zip <zip> --dry-run   # print payloads, no network
 */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { signAmoJwt } from './amo-jwt.mjs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const listing = JSON.parse(await readFile(resolve(root, 'storefront/listing.json'), 'utf-8'))
const amo = listing.amo
const BASE = 'https://addons.mozilla.org/api/v5'
const CATEGORY = 'photos-music-videos' // live slug for "Photos, Music & Videos"

const zipArg = process.argv.indexOf('--zip')
const zip = zipArg !== -1 ? process.argv[zipArg + 1] : null
const dryRun = process.argv.includes('--dry-run')

if (!zip) {
  console.error('usage: node scripts/amo-create.mjs --zip <xpi/zip> [--dry-run]')
  process.exit(2)
}

function authHeaders() {
  const issuer = process.env.FIREFOX_JWT_ISSUER
  const secret = process.env.FIREFOX_JWT_SECRET
  if (!issuer || !secret) {
    console.error('amo-create: set FIREFOX_JWT_ISSUER and FIREFOX_JWT_SECRET')
    process.exit(2)
  }
  return { Authorization: `JWT ${signAmoJwt(issuer, secret)}` }
}

async function api(method, path, { json, form, timeoutMs = 120000 } = {}) {
  const headers = authHeaders()
  let body
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(json)
  } else if (form) {
    body = form
  }
  const res = await fetch(`${BASE}${path}`, { method, headers, body, signal: AbortSignal.timeout(timeoutMs) })
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { raw: text.slice(0, 2000) }
  }
  return { status: res.status, ok: res.ok, data }
}

async function main() {
  const zipBytes = await readFile(zip)

  if (dryRun) {
    console.log('DRY RUN — no network calls. Payloads:')
    console.log('1) POST /addons/upload/  multipart: upload=<zip>, channel=listed')
    console.log(`   zip bytes: ${zipBytes.length}`)
    console.log(`2) POST /addons/addon/   ${JSON.stringify({
      categories: { firefox: [CATEGORY] },
      summary: { 'en-US': amo.summary },
      version: { upload: '<uuid>', license: 'MIT' },
    }, null, 2)}`)
    console.log(`3) PATCH /addons/addon/<id>/ description: ${amo.description.join('\n\n').length} chars (en-US)`)
    console.log('DRY RUN OK')
    return
  }

  // 1) upload for validation
  console.log('amo-create: uploading package for validation…')
  const form = new FormData()
  form.append('upload', new Blob([zipBytes]), 'google-photos-delete-tool-firefox.zip')
  form.append('channel', 'listed')
  const up = await api('POST', '/addons/upload/', { form })
  if (!up.ok) {
    console.error(`amo-create: upload failed (HTTP ${up.status})`, JSON.stringify(up.data))
    process.exit(1)
  }
  const uuid = up.data.uuid
  console.log(`amo-create: upload uuid = ${uuid}`)

  // 2) poll validation (max 10 min)
  let valid = false
  for (let i = 1; i <= 60; i++) {
    const st = await api('GET', `/addons/upload/${uuid}/`, { timeoutMs: 30000 })
    if (!st.ok) {
      console.error(`amo-create: upload status failed (HTTP ${st.status})`, JSON.stringify(st.data))
      process.exit(1)
    }
    console.log(`amo-create: validation attempt ${i}/60 → valid=${st.data.valid ?? '?'}`)
    if (st.data.valid === true) {
      valid = true
      break
    }
    if (st.data.validation && st.data.validation.errors && st.data.validation.errors.length) {
      console.error('amo-create: package validation errors:', JSON.stringify(st.data.validation.errors, null, 2))
      process.exit(1)
    }
    await new Promise((r) => setTimeout(r, 10000))
  }
  if (!valid) {
    console.error('amo-create: package still not valid after 10 minutes')
    process.exit(1)
  }

  // 3) create the add-on (fields per Mozilla's documented create example)
  console.log('amo-create: creating add-on…')
  const created = await api('POST', '/addons/addon/', {
    json: {
      categories: { firefox: [CATEGORY] },
      summary: { 'en-US': amo.summary },
      version: { upload: uuid, license: 'MIT' },
    },
  })
  if (!created.ok) {
    const body = JSON.stringify(created.data)
    if (/already exists|exists|409/i.test(body)) {
      console.error('amo-create: add-on already exists — use the store-retry loop instead of bootstrap (see docs/STORE_AUTOMATION.md)')
    } else {
      console.error(`amo-create: create failed (HTTP ${created.status})`, body)
    }
    process.exit(1)
  }
  const addonId = created.data.id
  const slug = created.data.slug
  console.log(`amo-create: add-on created id=${addonId} slug=${slug}`)

  // 4) attach the detailed description (translated field, documented via PATCH)
  console.log('amo-create: attaching description…')
  const patched = await api('PATCH', `/addons/addon/${addonId}/`, {
    json: { description: { 'en-US': amo.description.join('\n\n') } },
  })
  if (!patched.ok) {
    console.error(`amo-create: description PATCH failed (HTTP ${patched.status})`, JSON.stringify(patched.data))
    process.exit(1)
  }

  // 5) verify
  const got = await api('GET', `/addons/addon/${addonId}/`)
  if (!got.ok) {
    console.error(`amo-create: verify failed (HTTP ${got.status})`, JSON.stringify(got.data))
    process.exit(1)
  }
  console.log(`amo-create: LIVE listing: https://addons.mozilla.org/firefox/addon/${got.data.slug}/`)
  console.log(`amo-create: version ${got.data.current_version?.version} submitted for review`)
}

main().catch((err) => {
  console.error('amo-create: unexpected failure:', err)
  process.exit(1)
})
