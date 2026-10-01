import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadPrivateKey } from '../scripts/license-keys'
import { verifyLicense, encodeBase64Url } from '../src/core/license'

const toPem = (der: Uint8Array): string => {
  const b64 = Buffer.from(der).toString('base64')
  return `-----BEGIN PRIVATE KEY-----\n${(b64.match(/.{1,64}/g) ?? []).join('\n')}\n-----END PRIVATE KEY-----\n`
}

const issueWith = async (key: CryptoKey): Promise<string> => {
  const bytes = new TextEncoder().encode(JSON.stringify({ plan: 'pro', issuedAt: Date.now() }))
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, key, bytes))
  return `${encodeBase64Url(bytes)}.${encodeBase64Url(sig)}`
}

describe('seller private-key loading', () => {
  it('issues verifiable tokens from both the path form and the content form', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gpdt-lic-'))
    try {
      const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])
      const pem = toPem(new Uint8Array(await crypto.subtle.exportKey('pkcs8', kp.privateKey)))
      const pub = encodeBase64Url(new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey)))
      const file = join(dir, 'private.pem')
      writeFileSync(file, pem, { mode: 0o600 })

      const viaPath = await verifyLicense(await issueWith(await loadPrivateKey(file)), pub)
      const viaPem = await verifyLicense(await issueWith(await loadPrivateKey(pem)), pub)
      const der = Buffer.from(pem.replace(/-----[^-]+-----|\s+/g, ''), 'base64').toString('base64url')
      const viaB64 = await verifyLicense(await issueWith(await loadPrivateKey(der)), pub)
      expect(viaPath.ok).toBe(true)
      expect(viaPem.ok).toBe(true)
      expect(viaB64.ok).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
