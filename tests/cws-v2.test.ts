import { describe, expect, it, vi } from 'vitest'
import { generateKeyPairSync, createVerify } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
// @ts-expect-error plain .mjs script, no type declarations
import { selectAuthMode, signServiceAccountJwt, mintAccessToken, mintOAuthAccessToken, publishV2, API_BASE, SCOPE } from '../scripts/cws-v2.mjs'

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

describe('publish retry on transient reachability errors', () => {
  const notReachable = { error: { message: 'Publish condition not met: Support URL is not reachable.; Privacy policy link is not reachable. Timeout while connecting.' } }
  const head = [
    { match: `${N}:fetchStatus` },
    { match: `:upload`, body: { uploadState: 'SUCCEEDED', crxVersion: '1.2.3' } },
  ]
  it('retries once after 10 min and succeeds', async () => {
    const api = fakeApi([...head, { match: `:publish`, status: 400, body: notReachable }, { match: `:publish`, body: {} }, { match: `${N}:fetchStatus`, body: accepted }])
    const sleep = vi.fn(async () => {})
    const log = vi.fn()
    const r = await publishV2({ ...base, sleep, log, fetchImpl: api.fetchImpl })
    expect(r.outcome).toBe('published')
    expect(sleep).toHaveBeenCalledWith(600000)
    expect(api.calls.filter((c) => c.endsWith(':publish'))).toHaveLength(2)
    expect(api.calls.filter((c) => c.includes(':upload'))).toHaveLength(1)
    expect(log).toHaveBeenCalledWith(expect.stringContaining('::notice::'))
  })
  it('fails after a second reachability error, naming the retry', async () => {
    const api = fakeApi([...head, { match: `:publish`, status: 400, body: notReachable }, { match: `:publish`, status: 400, body: notReachable }])
    await expect(publishV2({ ...base, fetchImpl: api.fetchImpl })).rejects.toThrow('publish failed (HTTP 400); retried once after 10 min')
  })
  it('does not retry any other publish error', async () => {
    const api = fakeApi([...head, { match: `:publish`, status: 403, body: { error: 'forbidden' } }])
    const sleep = vi.fn(async () => {})
    const err = await publishV2({ ...base, sleep, fetchImpl: api.fetchImpl }).catch((e: Error) => e)
    expect((err as Error).message).toBe('publish failed (HTTP 403)')
    expect(sleep).not.toHaveBeenCalled()
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
  it('retries the OAuth publish once after 10 min on a reachability error only', () => {
    expect(engine).toContain("grep -qiE 'not reachable|Timeout while connecting'")
    expect(engine).toContain('sleep 600')
    expect(engine).toContain('retried once after 10 min')
  })
  it('exposes cancel_pending only through the manual CWS dispatch, default off', () => {
    expect(engine).toMatch(/cancel_pending:[\s\S]*?type: boolean\n\s+default: false/)
    expect(wf('publish-cws.yml')).toMatch(/cancel_pending:[\s\S]*?type: boolean\n\s+default: false/)
    expect(wf('publish-cws.yml')).toContain('cancel_pending: ${{ inputs.cancel_pending }}')
    expect(wf('store-retry.yml')).not.toContain('cancel_pending')
    expect(wf('publish-stores.yml')).not.toContain('cancel_pending')
  })
})

describe('staged publish (publishType STAGED_PUBLISH)', () => {
  type Seen = { label: string; body?: string; contentType?: string }
  function recordingApi(steps: Step[]) {
    const seen: Seen[] = []
    const fetchImpl = async (url: string, init: { method: string; body?: unknown; headers?: Record<string, string> }) => {
      const label = `${init.method} ${url.replace(API_BASE, '')}`
      seen.push({ label, body: typeof init.body === 'string' ? init.body : undefined, contentType: init.headers?.['Content-Type'] })
      const i = steps.findIndex((st) => label.endsWith(st.match))
      if (i < 0) throw new Error(`unexpected call ${label}`)
      const [st] = steps.splice(i, 1)
      return new Response(JSON.stringify(st.body ?? {}), { status: st.status ?? 200 })
    }
    return { seen, fetchImpl }
  }
  const flow = (readback: unknown) => [
    { match: `${N}:fetchStatus`, body: {} },
    { match: `/upload/v2/${N}:upload`, body: { uploadState: 'SUCCEEDED', crxVersion: '3.6.1' } },
    { match: `/v2/${N}:publish`, body: {} },
    { match: `${N}:fetchStatus`, body: readback },
  ]

  it('sends publishType STAGED_PUBLISH as JSON and accepts a PENDING_REVIEW readback', async () => {
    const api = recordingApi(flow({ submittedItemRevisionStatus: { state: 'PENDING_REVIEW' } }))
    const r = await publishV2({ ...base, publishType: 'STAGED_PUBLISH', fetchImpl: api.fetchImpl })
    expect(r).toMatchObject({ outcome: 'published', itemState: 'PENDING_REVIEW', crxVersion: '3.6.1', staged: true })
    const pub = api.seen.find((x) => x.label.endsWith(':publish'))!
    expect(JSON.parse(pub.body!)).toEqual({ publishType: 'STAGED_PUBLISH' })
    expect(pub.contentType).toBe('application/json')
  })
  it('accepts a STAGED readback', async () => {
    const api = recordingApi(flow({ submittedItemRevisionStatus: { state: 'STAGED' } }))
    expect((await publishV2({ ...base, publishType: 'STAGED_PUBLISH', fetchImpl: api.fetchImpl })).itemState).toBe('STAGED')
  })
  it('fails when the staged version reads back as live or in any other state', async () => {
    const live = recordingApi(flow({ publishedItemRevisionStatus: { state: 'PUBLISHED', distributionChannels: [{ crxVersion: '3.6.1' }] } }))
    await expect(publishV2({ ...base, publishType: 'STAGED_PUBLISH', fetchImpl: live.fetchImpl })).rejects.toThrow('reads back as published')
    const other = recordingApi(flow({ submittedItemRevisionStatus: { state: 'PUBLISHED' } }))
    await expect(publishV2({ ...base, publishType: 'STAGED_PUBLISH', fetchImpl: other.fetchImpl })).rejects.toThrow('staged submission')
  })
  it('keeps the default publish request without a body', async () => {
    const api = recordingApi(flow({ submittedItemRevisionStatus: { state: 'PENDING_REVIEW' } }))
    const r = await publishV2({ ...base, fetchImpl: api.fetchImpl })
    expect(r.staged).toBe(false)
    const pub = api.seen.find((x) => x.label.endsWith(':publish'))!
    expect(pub.body).toBeUndefined()
    expect(pub.contentType).toBeUndefined()
  })
  it('refuses an unknown publishType before any call', async () => {
    const api = recordingApi([])
    await expect(publishV2({ ...base, publishType: 'IMMEDIATE', fetchImpl: api.fetchImpl })).rejects.toThrow('unknown publishType')
    expect(api.seen).toHaveLength(0)
  })
})

describe('OAuth access token for the v2 calls', () => {
  it('exchanges the refresh token', async () => {
    let sent = ''
    const f = vi.fn(async (_u: string, init: { body: string }) => { sent = init.body; return new Response(JSON.stringify({ access_token: 'at' })) })
    expect(await mintOAuthAccessToken({ clientId: 'c', clientSecret: 's', refreshToken: 'r' }, f)).toBe('at')
    expect(Object.fromEntries(new URLSearchParams(sent))).toEqual({ grant_type: 'refresh_token', client_id: 'c', client_secret: 's', refresh_token: 'r' })
  })
  it('fails without echoing the secrets', async () => {
    const f = async () => new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 })
    const err = await mintOAuthAccessToken({ clientId: 'cid-x', clientSecret: 'sec-x', refreshToken: 'ref-x' }, f).catch((e: Error) => e.message)
    expect(err).toBe('OAuth token refresh failed (HTTP 400 invalid_grant)')
    await expect(mintOAuthAccessToken({ clientId: 'c', clientSecret: '', refreshToken: 'r' }, f)).rejects.toThrow('missing')
  })
})

describe('staged workflow wiring', () => {
  const engine = wf('store-publish.yml')
  const staged = engine.slice(engine.indexOf('\n  cws-staged:'))
  it('forwards the staged inputs from the manual CWS dispatch to the shared engine', () => {
    const caller = wf('publish-cws.yml')
    for (const k of ['staged_ref', 'content_digest', 'publisher_id']) expect(caller).toContain(`${k}: \${{ inputs.${k} }}`)
    expect(wf('store-retry.yml')).not.toContain('staged_ref')
    expect(wf('publish-stores.yml')).not.toContain('staged_ref')
  })
  it('skips every tag job when staged_ref is set and runs the staged job only then', () => {
    expect(engine).toContain("name: Resolve target tag & pending stores\n    if: inputs.staged_ref == ''")
    expect(staged).toContain("if: inputs.staged_ref != ''")
  })
  it('pins the package by content digest before any upload and submits only with --staged', () => {
    expect(staged).toContain('tool/scripts/zip-content-digest.sh')
    expect(staged.indexOf('content digest $GOT differs')).toBeGreaterThan(0)
    expect(staged.indexOf('content digest $GOT differs')).toBeLessThan(staged.indexOf('cws-v2.mjs publish'))
    expect(staged).toContain('cws-v2.mjs publish --zip build/google-photos-delete-tool.zip --staged')
    expect(staged).not.toContain('cancel-pending')
    expect(staged).not.toContain('store-state')
    expect(staged).toContain('permissions:\n      contents: read')
  })
})
