import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { formatReadout, parseCsv, readout } from '../scripts/checkout-readout'

const csv = readFileSync(new URL('./fixtures/checkout-sessions.csv', import.meta.url), 'utf8')

describe('checkout readout', () => {
  it('groups paid sessions by utm_source, utm_medium and utm_content', () => {
    const r = readout(csv)
    expect(r.sessions).toBe(8)
    expect(r.paid).toBe(6)
    const find = (s: string, m: string, c: string) => r.rows.find((x) => x.source === s && x.medium === m && x.content === c)
    expect(find('extension', 'dryrun_teaser', 'a')).toMatchObject({ paid: 1, sessions: 2, revenue: { USD: 9.99 } })
    expect(find('extension', 'dryrun_teaser', 'b')).toMatchObject({ paid: 2, sessions: 2, revenue: { USD: 1019.49 } })
    expect(find('extension', 'post_run', 'b')).toMatchObject({ paid: 1, sessions: 2 })
    expect(find('(none)', '(none)', '(none)')).toMatchObject({ paid: 1, sessions: 1 })
    expect(find('ext, ension', 'license_box', 'a')?.paid).toBe(1)
  })

  it('sorts by paid sessions and prints a table', () => {
    const out = formatReadout(csv)
    expect(out).toContain('Paid sessions: 6 of 8')
    expect(out).toContain('extension | dryrun_teaser | b | 2 | 2 | 1019.49 USD')
    expect(readout(csv).rows[0].content).toBe('b')
  })

  it('accepts metadata[utm_*] headers, CRLF and quoted newlines', () => {
    const text = 'Status,Payment Status,metadata[utm_content]\r\ncomplete,paid,"a\nx"\r\ncomplete,paid,b\r\n'
    expect(parseCsv(text)).toHaveLength(3)
    expect(readout(text).rows.map((x) => x.content).sort()).toEqual(['a\nx', 'b'])
  })

  it('rejects a file that is not a Checkout sessions export', () => {
    expect(() => readout('a,b\n1,2\n')).toThrow(/Checkout sessions/)
  })
})
