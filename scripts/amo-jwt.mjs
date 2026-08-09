/**
 * AMO API v5 JWT signing (zero-dependency, HS256 per Mozilla docs).
 *
 * Contract (verified 2026-08-09 from mozilla/addons-server docs/topics/api/auth.rst):
 *   Authorization: JWT <token>
 *   claims: { iss: <api key>, jti: <unique nonce>, iat, exp (<= iat+300) }
 *   algorithm: HMAC-SHA256, signed with the API secret.
 *
 * Reads FIREFOX_JWT_ISSUER / FIREFOX_JWT_SECRET from the environment.
 *   node scripts/amo-jwt.mjs            # prints a fresh token
 *   node scripts/amo-jwt.mjs --selfcheck  # sign + verify roundtrip, exit 0/1
 */
import { createHmac, randomUUID } from 'node:crypto'

const b64url = (buf) => Buffer.from(buf).toString('base64url')

export function signAmoJwt(issuer, secret, now = Math.floor(Date.now() / 1000)) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = b64url(JSON.stringify({ iss: issuer, jti: randomUUID(), iat: now, exp: now + 60 }))
  const sig = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url')
  return `${header}.${payload}.${sig}`
}

export function verifyAmoJwt(token, secret) {
  const [h, p, s] = token.split('.')
  if (!h || !p || !s) return false
  const expected = createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url')
  return expected === s
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--selfcheck')) {
    const secret = 'test-secret'
    const token = signAmoJwt('user:1:key', secret)
    if (!verifyAmoJwt(token, secret) || verifyAmoJwt(token, 'wrong-secret')) {
      console.error('amo-jwt: selfcheck FAILED')
      process.exit(1)
    }
    // structural checks
    const [h, p] = token.split('.')
    const hdr = JSON.parse(Buffer.from(h, 'base64url').toString())
    const claims = JSON.parse(Buffer.from(p, 'base64url').toString())
    if (hdr.alg !== 'HS256' || claims.iss !== 'user:1:key' || claims.exp - claims.iat !== 60) {
      console.error('amo-jwt: structure check FAILED')
      process.exit(1)
    }
    console.log('amo-jwt: selfcheck OK (HS256, iss/jti/iat/exp, JWT prefix)')
    process.exit(0)
  }
  const issuer = process.env.FIREFOX_JWT_ISSUER
  const secret = process.env.FIREFOX_JWT_SECRET
  if (!issuer || !secret) {
    console.error('amo-jwt: set FIREFOX_JWT_ISSUER and FIREFOX_JWT_SECRET')
    process.exit(2)
  }
  console.log(signAmoJwt(issuer, secret))
}
