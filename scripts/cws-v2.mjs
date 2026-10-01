/**
 * Chrome Web Store publishing through the CWS API v2 with a Google service
 * account (zero-dependency, node:crypto RS256 JWT).
 *
 * Contract (read 2026-10-01 from developer.chrome.com):
 *   docs/webstore/api, docs/webstore/using-api, docs/webstore/service-accounts,
 *   docs/webstore/api/reference/rest (+ /v2/ItemState, /v2/UploadState)
 *
 *   base                https://chromewebstore.googleapis.com
 *   scope               https://www.googleapis.com/auth/chromewebstore
 *                       (fetchStatus also accepts .../chromewebstore.readonly)
 *   token               service-account JWT (RS256, scope claim above) POSTed to
 *                       the key's token_uri with
 *                       grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer
 *   upload              POST /upload/v2/publishers/{publisherId}/items/{itemId}:upload
 *                       (zip as the request body; manifest version must be raised;
 *                       response uploadState SUCCEEDED | IN_PROGRESS | FAILED)
 *   fetchStatus         GET  /v2/publishers/{publisherId}/items/{itemId}:fetchStatus
 *                       (submittedItemRevisionStatus, publishedItemRevisionStatus,
 *                       lastAsyncUploadState)
 *   publish             POST /v2/publishers/{publisherId}/items/{itemId}:publish
 *                       (no body = DEFAULT_PUBLISH)
 *   cancelSubmission    POST /v2/publishers/{publisherId}/items/{itemId}:cancelSubmission
 *                       ("Cancel the current active submission of an item if present")
 *   ItemState           PENDING_REVIEW | STAGED | PUBLISHED | PUBLISHED_TO_TESTERS |
 *                       REJECTED | CANCELLED
 *
 * v2 has no documented "pending review" error code (v1 used ITEM_NOT_UPDATABLE),
 * so a pending submission is detected by reading fetchStatus before upload,
 * with the v1 wording kept only as a fallback on a failed upload.
 *
 * Commands (all read the environment; nothing secret is ever printed):
 *   node scripts/cws-v2.mjs mode                  # prints sa | oauth | none, exit 1 if SA config is partial
 *   node scripts/cws-v2.mjs publish --zip <file> [--cancel-pending]
 *
 * Environment: CWS_SERVICE_ACCOUNT_JSON, CWS_PUBLISHER_ID, CHROME_EXTENSION_ID
 * (service-account path) and CHROME_CLIENT_ID / CHROME_CLIENT_SECRET /
 * CHROME_REFRESH_TOKEN (OAuth fallback, handled by the workflow, not here).
 *
 * Exit codes: 0 = published or blocked by a pending review (outputs say which),
 * 1 = any failure (auth, validation, readback). State must only advance on
 * `published=yes`.
 */
import { createSign } from 'node:crypto'
import { appendFileSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export const API_BASE = 'https://chromewebstore.googleapis.com'
export const SCOPE = 'https://www.googleapis.com/auth/chromewebstore'
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token'
const ACCEPTED_STATES = ['PENDING_REVIEW', 'STAGED', 'PUBLISHED', 'PUBLISHED_TO_TESTERS']

/** Choose the auth path. Service account wins when its secret is set. */
export function selectAuthMode(env) {
  const has = (k) => typeof env[k] === 'string' && env[k].trim() !== ''
  if (has('CWS_SERVICE_ACCOUNT_JSON')) {
    const missing = ['CWS_PUBLISHER_ID', 'CHROME_EXTENSION_ID'].filter((k) => !has(k))
    return missing.length ? { mode: 'invalid', missing } : { mode: 'sa' }
  }
  if (['CHROME_EXTENSION_ID', 'CHROME_CLIENT_ID', 'CHROME_CLIENT_SECRET', 'CHROME_REFRESH_TOKEN'].every(has)) {
    return { mode: 'oauth' }
  }
  return { mode: 'none' }
}

const b64url = (v) => Buffer.from(v).toString('base64url')

/** Build a signed service-account JWT assertion. */
export function signServiceAccountJwt(key, now = Math.floor(Date.now() / 1000)) {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(JSON.stringify({
    iss: key.client_email,
    scope: SCOPE,
    aud: key.token_uri || DEFAULT_TOKEN_URI,
    iat: now,
    exp: now + 3600,
  }))
  const signature = createSign('RSA-SHA256').update(`${header}.${claims}`).sign(key.private_key, 'base64url')
  return `${header}.${claims}.${signature}`
}

/** Exchange the service-account JWT for an access token. Throws without echoing secrets. */
export async function mintAccessToken(keyJson, fetchImpl = fetch) {
  let key
  try {
    key = JSON.parse(keyJson)
  } catch {
    throw new Error('CWS_SERVICE_ACCOUNT_JSON is not valid JSON')
  }
  if (!key || !key.client_email || !key.private_key) {
    throw new Error('CWS_SERVICE_ACCOUNT_JSON is missing client_email or private_key')
  }
  let assertion
  try {
    assertion = signServiceAccountJwt(key)
  } catch {
    throw new Error('could not sign the service-account JWT (bad private_key)')
  }
  const res = await fetchImpl(key.token_uri || DEFAULT_TOKEN_URI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    const code = (() => { try { return JSON.parse(body).error } catch { return '' } })()
    throw new Error(`token exchange failed (HTTP ${res.status}${code ? ` ${code}` : ''})`)
  }
  const data = await res.json()
  if (!data.access_token) throw new Error('token exchange returned no access_token')
  return data.access_token
}

const itemName = (publisherId, itemId) => `publishers/${publisherId}/items/${itemId}`

async function call(fetchImpl, token, method, url, body) {
  const res = await fetchImpl(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/zip' } : {}) },
    ...(body ? { body } : {}),
  })
  const text = await res.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { /* non-JSON error page */ }
  return { ok: res.ok, status: res.status, json, text }
}

/**
 * Upload (optionally cancelling a pending review first), publish, read back.
 * Returns { outcome: 'published' | 'blocked', ... }; throws on any failure.
 */
export async function publishV2(opts) {
  const { token, publisherId, itemId, zip, cancelPending = false, fetchImpl = fetch, log = () => {}, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = opts
  const name = itemName(publisherId, itemId)
  const status = () => call(fetchImpl, token, 'GET', `${API_BASE}/v2/${name}:fetchStatus`)

  const first = await status()
  if (!first.ok) throw new Error(`fetchStatus failed (HTTP ${first.status})`)
  log(`status before: submitted=${first.json?.submittedItemRevisionStatus?.state ?? 'none'} published=${first.json?.publishedItemRevisionStatus?.state ?? 'none'}`)

  const cancel = async () => {
    const c = await call(fetchImpl, token, 'POST', `${API_BASE}/v2/${name}:cancelSubmission`)
    if (!c.ok) throw new Error(`cancelSubmission failed (HTTP ${c.status})`)
    log('pending submission cancelled')
  }

  let cancelled = false
  if (first.json?.submittedItemRevisionStatus?.state === 'PENDING_REVIEW') {
    if (!cancelPending) return { outcome: 'blocked', reason: 'pending review (cancel_pending not set)' }
    await cancel()
    cancelled = true
  }

  const doUpload = () => call(fetchImpl, token, 'POST', `${API_BASE}/upload/v2/${name}:upload`, zip)
  let up = await doUpload()
  if (!up.ok && /ITEM_NOT_UPDATABLE|pending review|not updatable/i.test(up.text)) {
    if (!cancelPending || cancelled) return { outcome: 'blocked', reason: 'upload refused while a submission is active' }
    await cancel()
    cancelled = true
    up = await doUpload()
  }
  if (!up.ok) throw new Error(`upload failed (HTTP ${up.status})`)

  let uploadState = up.json?.uploadState
  let crxVersion = up.json?.crxVersion
  for (let i = 0; uploadState === 'IN_PROGRESS' && i < 30; i++) {
    await sleep(10000)
    const s = await status()
    if (!s.ok) throw new Error(`fetchStatus failed (HTTP ${s.status})`)
    uploadState = s.json?.lastAsyncUploadState
  }
  if (uploadState !== 'SUCCEEDED') throw new Error(`upload did not succeed (uploadState=${uploadState ?? 'unset'})`)

  const pub = await call(fetchImpl, token, 'POST', `${API_BASE}/v2/${name}:publish`)
  if (!pub.ok) throw new Error(`publish failed (HTTP ${pub.status})`)

  const after = await status()
  if (!after.ok) throw new Error(`readback fetchStatus failed (HTTP ${after.status})`)
  const submitted = after.json?.submittedItemRevisionStatus
  const published = after.json?.publishedItemRevisionStatus
  const publishedVersions = (published?.distributionChannels ?? []).map((c) => c.crxVersion)
  const itemState = submitted?.state ?? published?.state ?? 'UNKNOWN'
  const accepted = ACCEPTED_STATES.includes(submitted?.state ?? '') || (crxVersion && publishedVersions.includes(crxVersion))
  if (!accepted) throw new Error(`readback does not show the submission (state=${itemState})`)
  return { outcome: 'published', itemState, crxVersion: crxVersion ?? '', cancelled, readback: after.json }
}

function writeOutputs(pairs) {
  if (!process.env.GITHUB_OUTPUT) return
  appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(pairs).map(([k, v]) => `${k}=${v}\n`).join(''))
}

async function main(argv, env) {
  const [cmd, ...rest] = argv
  if (cmd === 'mode') {
    const sel = selectAuthMode(env)
    if (sel.mode === 'invalid') {
      console.error(`::error::CWS_SERVICE_ACCOUNT_JSON is set but ${sel.missing.join(', ')} is missing; refusing to fall back silently`)
      return 1
    }
    console.log(sel.mode)
    return 0
  }
  if (cmd !== 'publish') {
    console.error('usage: cws-v2.mjs mode | publish --zip <file> [--cancel-pending]')
    return 2
  }
  const zipIdx = rest.indexOf('--zip')
  const zipPath = zipIdx >= 0 ? rest[zipIdx + 1] : ''
  if (!zipPath) { console.error('::error::--zip <file> required'); return 2 }
  const sel = selectAuthMode(env)
  if (sel.mode !== 'sa') { console.error('::error::service-account configuration incomplete'); return 1 }
  try {
    const token = await mintAccessToken(env.CWS_SERVICE_ACCOUNT_JSON)
    console.log(`::add-mask::${token}`)
    const result = await publishV2({
      token,
      publisherId: env.CWS_PUBLISHER_ID.trim(),
      itemId: env.CHROME_EXTENSION_ID.trim(),
      zip: readFileSync(zipPath),
      cancelPending: rest.includes('--cancel-pending'),
      log: (m) => console.log(m),
    })
    if (result.outcome === 'blocked') {
      console.log(`::notice::CWS blocked: ${result.reason}. The retry loop tries again after review clears; a manual publish-cws.yml dispatch with cancel_pending=true cancels it.`)
      writeOutputs({ blocked: 'yes' })
      return 0
    }
    console.log(`::notice::CWS v2 submission accepted: state=${result.itemState} version=${result.crxVersion} cancelled_pending=${result.cancelled}`)
    console.log(JSON.stringify(result.readback))
    writeOutputs({ uploaded: 'yes', published: 'yes', item_state: result.itemState, crx_version: result.crxVersion })
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, `CWS v2 readback: state \`${result.itemState}\`, version \`${result.crxVersion}\`, pending submission cancelled: ${result.cancelled}\n`)
    }
    return 0
  } catch (err) {
    console.error(`::error::CWS v2 failed: ${err instanceof Error ? err.message : 'unknown error'}; state not advanced`)
    return 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main(process.argv.slice(2), process.env))
}
