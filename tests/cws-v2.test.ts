import { describe, expect, it, vi } from 'vitest'
import { generateKeyPairSync, createVerify } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
// @ts-expect-error plain .mjs script, no type declarations
import { selectAuthMode, signServiceAccountJwt, mintAccessToken, publishV2, API_BASE, SCOPE } from '../scripts/cws-v2.mjs'

const wf = (n: string) => readFileSync(fileURLToPath(new URL(`../.github/workflows/${n}`, import.meta.url)), 'utf8')
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
})
const key = { client_email: 'cws-publisher@p.iam.gserviceaccount.com', private_key: privateKey, token_uri: 'https://oauth2.googleapis.com/token' }
const OAUTH = { CHROME_EXTENSION_ID: 'e', CHROME_CLIENT_ID: 'c', CHROME_CLIENT_SECRET: 's', CHROME_REFRESH_TOKEN: 'r' }

describe('selectAuthMode', () => {
  it('prefers the service account when its secret is set', () => {
    expect(selectAuthMode({ ...OAUTH, CWS_SERVICE_ACCOUNT_JSON: '{}', CWS_PUBLISHER_ID: 'p' }).mode).toBe('sa')
  })
  it('fails closed on a partial service-account config instead of silently using OAuth', () => {
    expect(selectAuthMode({ ...OAUTH, CWS_SERVICE_ACCOUNT_JSON: '{}' })).toEqual({ mode: 'invalid', missing: ['CWS_PUBLISHER_ID'] })
  })
  it('keeps the OAuth fallback when no service account is set', () => {
    expect(selectAuthMode(OAUTH).mode).toBe('oauth')
    expect(selectAuthMode({ ...OAUTH, CWS_SERVICE_ACCOUNT_JSON: '  ' }).mode).toBe('oauth')
  })
  it('is none without credentials', () => {
    expect(selectAuthMode({}).mode).toBe('none')
    expect(selectAuthMode({ CHROME_EXTENSION_ID: 'e' }).mode).toBe('none')
  })
})

describe('service-account token', () => {
  it('signs a verifiable RS256 JWT with the CWS scope', () => {
    const jwt = signServiceAccountJwt(key, 1000)
    const [h, c, s] = jwt.split('.')
    expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toEqual({ alg: 'RS256', typ: 'JWT' })
    expect(JSON.parse(Buffer.from(c, 'base64url').toString())).toMatchObject({ iss: key.client_email, scope: SCOPE, aud: key.token_uri, iat: 1000, exp: 4600 })
    expect(createVerify('RSA-SHA256').update(`${h}.${c}`).verify(publicKey, s, 'base64url')).toBe(true)
  })
  it('exchanges the assertion for an access token', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ access_token: 'tok' })))
    expect(await mintAccessToken(JSON.stringify(key), f)).toBe('tok')
    const [url, init] = f.mock.calls[0] as unknown as [string, { body: string }]
    expect(url).toBe(key.token_uri)
    expect(init.body).toContain('grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer')
  })
  it('fails on auth errors without leaking the key', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }))
    const err = await mintAccessToken(JSON.stringify(key), f).catch((e: Error) => e)
    expect((err as Error).message).toContain('HTTP 400 invalid_grant')
    expect((err as Error).message).not.toContain('PRIVATE KEY')
    await expect(mintAccessToken('not json', f)).rejects.toThrow('not valid JSON')
    await expect(mintAccessToken('{}', f)).rejects.toThrow('missing')
  })
})

type Step = { match: string; status?: number; body?: unknown }
function fakeApi(steps: Step[]) {
  const calls: string[] = []
  const fetchImpl = async (url: string, init: { method: string }) => {
    const label = `${init.method} ${url.replace(API_BASE, '')}`
    calls.push(label)
    const i = steps.findIndex((s) => label.endsWith(s.match))
    if (i < 0) throw new Error(`unexpected call ${label}`)
    const [s] = steps.splice(i, 1)
    return new Response(JSON.stringify(s.body ?? {}), { status: s.status ?? 200 })
  }
  return { calls, fetchImpl }
}
const base = { token: 't', publisherId: 'P', itemId: 'E', zip: Buffer.from('z'), sleep: async () => {} }
const N = 'publishers/P/items/E'
const pending = { submittedItemRevisionStatus: { state: 'PENDING_REVIEW' } }
const accepted = { submittedItemRevisionStatus: { state: 'PENDING_REVIEW' } }

describe('publishV2', () => {
  it('uploads, publishes and reads back', async () => {
    const api = fakeApi([
      { match: `${N}:fetchStatus`, body: {} },
      { match: `/upload/v2/${N}:upload`, body: { uploadState: 'SUCCEEDED', crxVersion: '1.2.3' } },
      { match: `/v2/${N}:publish`, body: { state: 'PENDING_REVIEW' } },
      { match: `${N}:fetchStatus`, body: accepted },
    ])
    const r = await publishV2({ ...base, fetchImpl: api.fetchImpl })
    expect(r).toMatchObject({ outcome: 'published', itemState: 'PENDING_REVIEW', crxVersion: '1.2.3', cancelled: false })
  })
  it('stays blocked on a pending review without cancel_pending, never uploading', async () => {
    const api = fakeApi([{ match: `${N}:fetchStatus`, body: pending }])
    const r = await publishV2({ ...base, fetchImpl: api.fetchImpl })
    expect(r.outcome).toBe('blocked')
    expect(api.calls).toHaveLength(1)
  })
  it('cancels the pending submission first when cancel_pending is set', async () => {
    const api = fakeApi([
      { match: `${N}:fetchStatus`, body: pending },
      { match: `/v2/${N}:cancelSubmission` },
      { match: `/upload/v2/${N}:upload`, body: { uploadState: 'SUCCEEDED', crxVersion: '2.0.0' } },
      { match: `/v2/${N}:publish`, body: {} },
      { match: `${N}:fetchStatus`, body: accepted },
    ])
    const r = await publishV2({ ...base, cancelPending: true, fetchImpl: api.fetchImpl })
    expect(r).toMatchObject({ outcome: 'published', cancelled: true })
    expect(api.calls.map((c) => c.split(':').pop())).toEqual(['fetchStatus', 'cancelSubmission', 'upload', 'publish', 'fetchStatus'])
  })
  it('polls an in-progress upload via fetchStatus', async () => {
    const api = fakeApi([
      { match: `${N}:fetchStatus`, body: {} },
      { match: `/upload/v2/${N}:upload`, body: { uploadState: 'IN_PROGRESS' } },
      { match: `${N}:fetchStatus`, body: { lastAsyncUploadState: 'SUCCEEDED' } },
      { match: `/v2/${N}:publish`, body: {} },
      { match: `${N}:fetchStatus`, body: { publishedItemRevisionStatus: { distributionChannels: [{ crxVersion: '' }] }, submittedItemRevisionStatus: { state: 'STAGED' } } },
    ])
    expect((await publishV2({ ...base, fetchImpl: api.fetchImpl })).outcome).toBe('published')
  })
  it('fails closed on upload, publish and readback errors', async () => {
    const up = fakeApi([{ match: `${N}:fetchStatus` }, { match: `:upload`, status: 403, body: { error: 'x' } }])
    await expect(publishV2({ ...base, fetchImpl: up.fetchImpl })).rejects.toThrow('upload failed (HTTP 403)')
    const rb = fakeApi([
      { match: `${N}:fetchStatus` },
      { match: `:upload`, body: { uploadState: 'SUCCEEDED' } },
      { match: `:publish` },
      { match: `${N}:fetchStatus`, body: { submittedItemRevisionStatus: { state: 'REJECTED' } } },
    ])
    await expect(publishV2({ ...base, fetchImpl: rb.fetchImpl })).rejects.toThrow('readback')
  })
})

describe('workflow wiring', () => {
  const engine = wf('store-publish.yml')
  it('selects the path in the credential guard and gates each path on it', () => {
    expect(engine).toContain('node scripts/cws-v2.mjs mode')
    expect(engine).toContain("steps.creds.outputs.auth == 'sa'")
    expect(engine).toContain("steps.creds.outputs.auth == 'oauth'")
    expect(engine).toContain('chrome-webstore-upload-cli@3.5.0 upload')
    expect(engine).toContain("steps.publish.outputs.published == 'yes' || steps.v2.outputs.published == 'yes'")
  })
  it('exposes cancel_pending only through the manual CWS dispatch, default off', () => {
    expect(engine).toMatch(/cancel_pending:[\s\S]*?type: boolean\n\s+default: false/)
    expect(wf('publish-cws.yml')).toMatch(/cancel_pending:[\s\S]*?type: boolean\n\s+default: false/)
    expect(wf('publish-cws.yml')).toContain('cancel_pending: ${{ inputs.cancel_pending }}')
    expect(wf('store-retry.yml')).not.toContain('cancel_pending')
    expect(wf('publish-stores.yml')).not.toContain('cancel_pending')
  })
})
