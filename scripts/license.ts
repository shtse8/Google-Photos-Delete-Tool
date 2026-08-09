/**
 * Pro license seller tooling (zero-server).
 *
 *   bun run license:keygen            # generate a keypair; saves the private
 *                                     # key to ~/.gpdt/gpdt-license-private.pem
 *                                     # and prints the public key to embed.
 *   bun run license:issue --email=x   # sign a Pro license payload → token
 *   bun run license:verify <token>    # verify a token against the embedded key
 *
 * The private key NEVER enters this repository. Keep it out of git,
 * backups, and any machine that does not own the Pro business. Losing it
 * invalidates every issued token; regenerate and release a new key instead.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { homedir } from 'node:os'

/**
 * Seller private key location. Override with $GPDT_PRO_PRIVATE_KEY;
 * defaults to ~/.gpdt/gpdt-license-private.pem (mode 600). The file may
 * be PEM ("-----BEGIN PRIVATE KEY-----") or a bare base64url PKCS8 DER.
 */
const PRIVATE_KEY_PATH = process.env.GPDT_PRO_PRIVATE_KEY ?? resolve(homedir(), '.gpdt', 'gpdt-license-private.pem')

function usage(command: string): never {
  console.error(`Usage: bun run license:${command} ${command === 'issue' ? '[--email <email>]' : '<token>'}`)
  process.exit(1)
}

function b64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url')
}

function derToPem(der: Uint8Array, label: string): string {
  const b64 = Buffer.from(der).toString('base64')
  const lines = b64.match(/.{1,64}/g) ?? []
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----\n`
}

async function keygen(): Promise<void> {
  const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', kp.privateKey))
  const rawPub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey))

  mkdirSync(resolve(homedir(), '.gpdt'), { recursive: true })
  writeFileSync(PRIVATE_KEY_PATH, derToPem(pkcs8, 'PRIVATE KEY'), { mode: 0o600 })

  console.log(`Private key  -> ${PRIVATE_KEY_PATH} (mode 600, keep out of git)`)
  console.log(`Public key   -> ${b64url(rawPub)}`)
  console.log('')
  console.log('Embed the public key into src/core/license.ts:')
  console.log(`  export const PRO_PUBLIC_KEY_BASE64URL = '${b64url(rawPub)}'`)
}

async function loadPrivateKey(): Promise<CryptoKey> {
  const fromEnv = process.env.GPDT_PRO_PRIVATE_KEY
  let raw: string
  if (fromEnv) {
    raw = fromEnv
  } else {
    try {
      raw = readFileSync(PRIVATE_KEY_PATH, 'utf-8')
    } catch {
      console.error(`No private key at ${PRIVATE_KEY_PATH} (set $GPDT_PRO_PRIVATE_KEY or run "bun run license:keygen").`)
      process.exit(1)
    }
  }
  // Accept PEM or bare base64url PKCS8 DER.
  const body = raw.includes('-----')
    ? raw.replace(/-----(BEGIN|END) [^-]+-----/g, '').replace(/\s+/g, '')
    : raw.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/')
  const der = Buffer.from(body, 'base64')
  return crypto.subtle.importKey('pkcs8', der, { name: 'Ed25519' }, false, ['sign'])
}

async function issue(email?: string): Promise<void> {
  const key = await loadPrivateKey()
  const payload: { plan: 'pro'; email?: string; issuedAt: number } = {
    plan: 'pro',
    issuedAt: Date.now(),
  }
  if (email) payload.email = email

  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload))
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, key, payloadBytes))
  const token = `${b64url(payloadBytes)}.${b64url(sig)}`
  console.log(token)
}

async function verify(token: string): Promise<void> {
  const { verifyLicense } = await import('../src/core/license')
  const result = await verifyLicense(token)
  if (result.ok) {
    console.log('VALID Pro license:', JSON.stringify(result.payload))
    return
  }
  console.error(`INVALID: ${result.reason}`)
  process.exit(1)
}

const [command, ...rest] = process.argv.slice(2)

switch (command) {
  case 'keygen':
    await keygen()
    break
  case 'issue': {
    const emailArg = rest.find((a) => a.startsWith('--email='))
    await issue(emailArg ? emailArg.slice('--email='.length) : undefined)
    break
  }
  case 'verify': {
    if (!rest[0]) usage('verify')
    await verify(rest[0])
    break
  }
  default:
    console.error('Unknown command. Use: keygen | issue | verify')
    process.exit(1)
}
