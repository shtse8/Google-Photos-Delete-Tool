/**
 * Pro license verification — zero-server by design.
 *
 * A Pro token is `${base64url(payload)}.${base64url(signature)}` where
 * payload is JSON `{ plan: "pro", email?, issuedAt }` and the signature
 * is an Ed25519 signature over the payload bytes, made with the seller's
 * private key. The public key is embedded below; verification happens
 * entirely on the user's device (WebCrypto SubtleCrypto). No license
 * data ever leaves the browser.
 *
 * Seller tooling (private key holder): `bun run license:issue`.
 * Key regeneration: `bun run license:keygen` (see docs/PRO.md).
 */
export interface ProLicensePayload {
  plan: 'pro'
  email?: string
  issuedAt: number
}

export type LicenseResult =
  | { ok: true; payload: ProLicensePayload }
  | { ok: false; reason: 'malformed' | 'bad-signature' | 'wrong-plan' }

/**
 * Ed25519 public key (raw, base64url) embedded at build time.
 * The matching private key is held by the seller OUTSIDE this repo at
 * `$GPDT_PRO_PRIVATE_KEY` (default `~/.gpdt/gpdt-license-private.pem`;
 * see docs/PRO.md). Losing it invalidates every issued token — never
 * commit the private key. Regenerate with `bun run license:keygen`,
 * replace this constant, and release.
 */
export const PRO_PUBLIC_KEY_BASE64URL =
  'BkfyaOx0U3p8-KeUbF2WE924czXvfAoBdQ-trkO_3Vk'


export function encodeBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export function decodeBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
  const bin = atob(padded)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

/**
 * Import the Pro public key for verification.
 *
 * `publicKeyBase64Url` is injectable for tests and future key rotation;
 * production always uses the embedded {@link PRO_PUBLIC_KEY_BASE64URL}.
 */
export async function importProPublicKey(
  publicKeyBase64Url: string = PRO_PUBLIC_KEY_BASE64URL,
): Promise<CryptoKey> {
  const raw = decodeBase64Url(publicKeyBase64Url)
  return crypto.subtle.importKey('raw', raw as unknown as ArrayBuffer, { name: 'Ed25519' }, false, ['verify'])
}

/**
 * Verify a Pro license token locally. Returns the payload when valid.
 * `publicKeyBase64Url` is injectable for tests / rotation.
 */
export async function verifyLicense(
  token: string,
  publicKeyBase64Url: string = PRO_PUBLIC_KEY_BASE64URL,
): Promise<LicenseResult> {
  const trimmed = token.trim()
  const dot = trimmed.lastIndexOf('.')
  if (dot <= 0 || dot === trimmed.length - 1) return { ok: false, reason: 'malformed' }

  let payloadBytes: Uint8Array
  let signatureBytes: Uint8Array
  try {
    payloadBytes = decodeBase64Url(trimmed.slice(0, dot))
    signatureBytes = decodeBase64Url(trimmed.slice(dot + 1))
  } catch {
    return { ok: false, reason: 'malformed' }
  }

  let payload: ProLicensePayload
  try {
    payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as ProLicensePayload
  } catch {
    return { ok: false, reason: 'malformed' }
  }

  if (payload.plan !== 'pro' || typeof payload.issuedAt !== 'number') {
    return { ok: false, reason: 'wrong-plan' }
  }

  let key: CryptoKey
  try {
    key = await importProPublicKey(publicKeyBase64Url)
  } catch {
    return { ok: false, reason: 'bad-signature' }
  }

  const valid = await crypto.subtle.verify(
    { name: 'Ed25519' },
    key,
    signatureBytes as unknown as ArrayBuffer,
    payloadBytes as unknown as ArrayBuffer,
  )
  return valid ? { ok: true, payload } : { ok: false, reason: 'bad-signature' }
}

