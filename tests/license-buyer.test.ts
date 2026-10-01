import { describe, it, expect } from 'vitest'
import { verifyBuyer, formatBuyerReport } from '../scripts/license-buyer'
import { encodeBase64Url } from '../src/core/license'

const newKey = async () => {
  const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])
  const pub = encodeBase64Url(new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey)))
  return { priv: kp.privateKey, pub }
}

const issue = async (priv: CryptoKey, payload: Record<string, unknown>): Promise<string> => {
  const bytes = new TextEncoder().encode(JSON.stringify(payload))
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, priv, bytes))
  return `${encodeBase64Url(bytes)}.${encodeBase64Url(sig)}`
}

describe('verify-buyer readback', () => {
  it('accepts a valid pro token for the expected email and names the new key', async () => {
    const oldK = await newKey()
    const curK = await newKey()
    const t = 1786300000000
    const token = await issue(curK.priv, { plan: 'pro', email: 'Buyer@Example.com', issuedAt: t })
    const r = await verifyBuyer(token, ' buyer@example.com ', [oldK.pub, curK.pub])
    expect(r).toEqual({ valid: true, key: 'new', plan: 'pro', emailMatch: true, issuedAt: new Date(t).toISOString(), ok: true })
    expect(formatBuyerReport(r)).not.toContain(token)
  })

  it('names the old key when the first embedded key signed it', async () => {
    const oldK = await newKey()
    const curK = await newKey()
    const token = await issue(oldK.priv, { plan: 'pro', email: 'a@example.com', issuedAt: 1 })
    expect((await verifyBuyer(token, 'a@example.com', [oldK.pub, curK.pub])).key).toBe('old')
  })

  it('fails on an email mismatch or a missing email', async () => {
    const k = await newKey()
    const wrong = await issue(k.priv, { plan: 'pro', email: 'a@example.com', issuedAt: 1 })
    const r = await verifyBuyer(wrong, 'b@example.com', [k.pub])
    expect(r.valid).toBe(true)
    expect(r.emailMatch).toBe(false)
    expect(r.ok).toBe(false)
    const none = await issue(k.priv, { plan: 'pro', issuedAt: 1 })
    expect((await verifyBuyer(none, 'a@example.com', [k.pub])).ok).toBe(false)
  })

  it('fails on a foreign signature, a wrong plan and garbage', async () => {
    const k = await newKey()
    const other = await newKey()
    const foreign = await issue(other.priv, { plan: 'pro', email: 'a@example.com', issuedAt: 1 })
    const r = await verifyBuyer(foreign, 'a@example.com', [k.pub])
    expect(r).toMatchObject({ valid: false, key: null, ok: false })
    const free = await issue(k.priv, { plan: 'free', email: 'a@example.com', issuedAt: 1 })
    expect((await verifyBuyer(free, 'a@example.com', [k.pub])).ok).toBe(false)
    expect((await verifyBuyer('not-a-token', 'a@example.com', [k.pub])).valid).toBe(false)
  })

  it('formats yes/no lines without the token', () => {
    expect(
      formatBuyerReport({ valid: false, key: null, plan: null, emailMatch: false, issuedAt: null, ok: false }),
    ).toBe('valid: no\nkey: none\nplan: none\nemail match: no\nissuedAt: none')
  })
})
