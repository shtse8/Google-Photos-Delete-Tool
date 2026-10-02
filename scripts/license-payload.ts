/**
 * Pro token payload, shared with the Money licence capability:
 * { plan, email, issuedAt, order }. The email is required (the token is bound
 * to the purchaser); order is the Stripe payment or session id when known.
 * Verifiers ignore fields they do not read, so `order` needs no client change.
 */
export interface IssuePayload {
  plan: 'pro'
  email: string
  issuedAt: number
  order?: string
}

export function buildIssuePayload(email: string | undefined, order: string | undefined, now = Date.now()): IssuePayload {
  const e = (email ?? '').trim()
  if (!e || !e.includes('@')) throw new Error('--email=<the email the buyer paid with> is required')
  const payload: IssuePayload = { plan: 'pro', email: e, issuedAt: now }
  const o = (order ?? '').trim()
  if (o) payload.order = o
  return payload
}
