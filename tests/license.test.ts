import { describe, it, expect, beforeAll } from 'vitest'
import {
  verifyLicense,
  encodeBase64Url,
  decodeBase64Url,
  PRO_PUBLIC_KEY_BASE64URL,
  type ProLicensePayload,
} from '../src/core/license'

/**
 * The license path is verified end-to-end with a throwaway keypair:
 * generate → sign → verify against the test public key. This proves the
 * token format, signature check, and payload validation without needing
 * the seller's private key in the repo.
 */

let testKeys: { publicKey: CryptoKey; privateKey: CryptoKey; publicRaw: string }

beforeAll(async () => {
  testKeys = await (async () => {
    const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])
    const raw = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey))
    return { publicKey: kp.publicKey, privateKey: kp.privateKey, publicRaw: encodeBase64Url(raw) }
  })()
})

const signPayload = async (payload: unknown): Promise<string> => {
  const bytes = new TextEncoder().encode(JSON.stringify(payload))
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, testKeys.privateKey, bytes))
  return `${encodeBase64Url(bytes)}.${encodeBase64Url(sig)}`
}

describe('base64url helpers', () => {
  it('round-trips arbitrary bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253])
    expect([...decodeBase64Url(encodeBase64Url(bytes))]).toEqual([...bytes])
  })

  it('is URL-safe (no +, /, or padding)', () => {
    const bytes = new Uint8Array(64).fill(0xff)
    const encoded = encodeBase64Url(bytes)
    expect(encoded).not.toMatch(/[+/=]/)
  })
})

describe('verifyLicense', () => {
  it('accepts a valid token signed by the matching key', async () => {
    const payload: ProLicensePayload = { plan: 'pro', email: 'buyer@example.com', issuedAt: Date.now() }
    const token = await signPayload(payload)
    const result = await verifyLicense(token, testKeys.publicRaw)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.payload.plan).toBe('pro')
      expect(result.payload.email).toBe('buyer@example.com')
    }
  })

  it('rejects a token signed by a different key', async () => {
    const other = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])
    const bytes = new TextEncoder().encode(JSON.stringify({ plan: 'pro', issuedAt: 1 }))
    const sig = new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, other.privateKey, bytes))
    const token = `${encodeBase64Url(bytes)}.${encodeBase64Url(sig)}`
    const result = await verifyLicense(token, testKeys.publicRaw)
    expect(result).toEqual({ ok: false, reason: 'bad-signature' })
  })

  it('rejects malformed tokens', async () => {
    expect(await verifyLicense('', testKeys.publicRaw)).toEqual({ ok: false, reason: 'malformed' })
    expect(await verifyLicense('nodot', testKeys.publicRaw)).toEqual({ ok: false, reason: 'malformed' })
    expect(await verifyLicense('.', testKeys.publicRaw)).toEqual({ ok: false, reason: 'malformed' })
    expect(await verifyLicense('!!!.!!!', testKeys.publicRaw)).toEqual({ ok: false, reason: 'malformed' })
  })

  it('rejects a well-formed token with a wrong payload plan', async () => {
    const token = await signPayload({ plan: 'free', issuedAt: 1 })
    const result = await verifyLicense(token, testKeys.publicRaw)
    expect(result).toEqual({ ok: false, reason: 'wrong-plan' })
  })

  it('rejects a valid-looking token whose payload is not an object', async () => {
    const token = await signPayload('just-a-string')
    const result = await verifyLicense(token, testKeys.publicRaw)
    expect(result.ok).toBe(false)
  })

  it('trims surrounding whitespace', async () => {
    const payload: ProLicensePayload = { plan: 'pro', issuedAt: 1 }
    const token = await signPayload(payload)
    const result = await verifyLicense(`  ${token}  `, testKeys.publicRaw)
    expect(result.ok).toBe(true)
  })

  it('embeds a 32-byte production public key', () => {
    expect(decodeBase64Url(PRO_PUBLIC_KEY_BASE64URL).length).toBe(32)
  })
})
