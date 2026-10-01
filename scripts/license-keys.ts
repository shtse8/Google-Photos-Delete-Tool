/**
 * Seller private-key loading, shared by `keygen` and `issue`.
 * $GPDT_PRO_PRIVATE_KEY may name a file or hold the key itself; the key
 * is never printed.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { homedir } from 'node:os'

export const DEFAULT_PRIVATE_KEY_PATH = resolve(homedir(), '.gpdt', 'gpdt-license-private.pem')

/**
 * Raw key text: the file's contents when `value` names an existing file,
 * otherwise `value` itself (PEM or base64url PKCS8 DER). Throws without
 * echoing the value when nothing usable is configured.
 */
export function readPrivateKeyText(env: string | undefined, defaultPath: string = DEFAULT_PRIVATE_KEY_PATH): string {
  const value = env && env.trim() ? env : undefined
  if (value !== undefined) {
    // A real key can never be a path to an existing file, so this is unambiguous.
    if (!value.includes('\n') && existsSync(value)) return readFileSync(value, 'utf-8')
    return value
  }
  if (existsSync(defaultPath)) return readFileSync(defaultPath, 'utf-8')
  throw new Error(`No private key at ${defaultPath} (set $GPDT_PRO_PRIVATE_KEY or run "bun run license:keygen").`)
}

/** Import PEM or bare base64url PKCS8 DER text as an Ed25519 signing key. */
export async function importPrivateKey(raw: string): Promise<CryptoKey> {
  const body = raw.includes('-----')
    ? raw.replace(/-----(BEGIN|END) [^-]+-----/g, '').replace(/\s+/g, '')
    : raw.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/')
  const der = Buffer.from(body, 'base64')
  return crypto.subtle.importKey('pkcs8', der, { name: 'Ed25519' }, false, ['sign'])
}

export async function loadPrivateKey(env: string | undefined = process.env.GPDT_PRO_PRIVATE_KEY): Promise<CryptoKey> {
  return importPrivateKey(readPrivateKeyText(env))
}

/** Where `keygen` writes: the env value as a file path, else the default. */
export function privateKeyWritePath(env: string | undefined = process.env.GPDT_PRO_PRIVATE_KEY): string {
  return env && env.trim() ? env : DEFAULT_PRIVATE_KEY_PATH
}
