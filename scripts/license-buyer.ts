/**
 * First-purchase readback: decide whether an issued token is a valid Pro
 * token for the expected buyer. Pure (keys are injected) so tests can use
 * throwaway keys; the CLI passes the embedded keys. The token itself is never
 * part of the report.
 */
import { verifyLicense } from '../src/core/license'

export interface BuyerReport {
  valid: boolean
  /** 'old' = the first embedded key, 'new' = any later one (the current key signs new tokens). */
  key: 'old' | 'new' | null
  plan: string | null
  emailMatch: boolean
  issuedAt: string | null
  /** True only when valid, plan is pro and the email matches. */
  ok: boolean
}

export async function verifyBuyer(
  token: string,
  expectedEmail: string,
  keys: readonly string[],
): Promise<BuyerReport> {
  for (let i = 0; i < keys.length; i++) {
    const result = await verifyLicense(token, keys[i])
    if (!result.ok) continue
    const { plan, email, issuedAt } = result.payload
    const emailMatch =
      typeof email === 'string' && email.trim().toLowerCase() === expectedEmail.trim().toLowerCase()
    const issued = typeof issuedAt === 'number' && Number.isFinite(issuedAt) ? new Date(issuedAt) : null
    return {
      valid: true,
      key: i === 0 ? 'old' : 'new',
      plan,
      emailMatch,
      issuedAt: issued && !Number.isNaN(issued.getTime()) ? issued.toISOString() : null,
      ok: plan === 'pro' && emailMatch,
    }
  }
  return { valid: false, key: null, plan: null, emailMatch: false, issuedAt: null, ok: false }
}

const yn = (b: boolean): string => (b ? 'yes' : 'no')

export function formatBuyerReport(r: BuyerReport): string {
  return [
    `valid: ${yn(r.valid)}`,
    `key: ${r.key ?? 'none'}`,
    `plan: ${r.plan ?? 'none'}`,
    `email match: ${yn(r.emailMatch)}`,
    `issuedAt: ${r.issuedAt ?? 'none'}`,
  ].join('\n')
}
