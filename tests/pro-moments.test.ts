// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { buildDryRunTeaser, countLabelTypes, dateReportLine, proUrl } from '../src/core/pro-moments'
import { renderProTeaser } from '../src/ui/pro-teaser/teaser'
import { showPostRunPrompt } from '../src/ui/post-run/prompt'
import { claimPostRunPrompt } from '../src/core/post-run-prompt'

const labels = [
  'Screenshot - 10 Mar 2012, 10:19:24',
  'Screenshot - 11 Mar 2012, 10:19:24',
  'Video - 1 Jan 2020, 09:00:00',
  'Photo - 2 Jan 2020, 09:00:00',
]
const counts = countLabelTypes(labels)

describe('dry-run teaser', () => {
  it('shows per-type counts and the CTA for free users', () => {
    const t = buildDryRunTeaser(counts, labels.length, false)
    expect(t).not.toBeNull()
    expect(t!.countsLine).toBe('This view has 1 photo, 1 video, 2 screenshots.')
    expect(t!.ctaLine).toBe('Delete only the types you choose with Pro — US$9.99 once')
    const u = new URL(t!.url)
    expect(u.hash).toBe('#pro')
    expect(u.searchParams.get('utm_source')).toBe('extension')
    expect(u.searchParams.get('utm_medium')).toBe('dryrun_teaser')
    expect(u.searchParams.get('utm_campaign')).toBe('pro')
  })
  it('never shows for Pro users or an empty scan', () => {
    expect(buildDryRunTeaser(counts, labels.length, true)).toBeNull()
    expect(buildDryRunTeaser(countLabelTypes([]), 0, false)).toBeNull()
  })
  it('falls back to a total when no label is classifiable', () => {
    const c = countLabelTypes(['???'])
    expect(buildDryRunTeaser(c, 1, false)!.countsLine).toBe('This view has 1 items.')
  })
  it('renders a dismissable link and nothing for null', () => {
    const host = document.createElement('div')
    renderProTeaser(host, buildDryRunTeaser(counts, labels.length, false))
    const a = host.querySelector('a')!
    expect(a.getAttribute('href')).toBe(proUrl('dryrun_teaser'))
    host.querySelector('button')!.click()
    expect(host.children.length).toBe(0)
    renderProTeaser(host, null)
    expect(host.style.display).toBe('none')
  })
})

describe('post-run card button', () => {
  const result = { dryRun: false, stopped: false, status: 'done' as const, deleted: 5, filterKind: 'all' as const }
  const mem = () => ({ isShown: async () => false, markShown: async () => {} })
  const buttons = (): string[] =>
    [...document.querySelectorAll('#gpdt-post-run-prompt button')].map(b => b.textContent ?? '')

  it('shows Get Pro for free users and not for Pro users', async () => {
    document.body.replaceChildren()
    showPostRunPrompt((await claimPostRunPrompt(result, mem(), 'chrome', false))!)
    expect(buttons()).toContain('Get Pro')
    document.body.replaceChildren()
    showPostRunPrompt((await claimPostRunPrompt(result, mem(), 'chrome', true))!)
    expect(buttons()).not.toContain('Get Pro')
    expect(buttons()).toContain('Dismiss')
  })
})

describe('teaser dismissal', () => {
  it('stays dismissed for the same result and shows again for a new one', () => {
    const host = document.createElement('div')
    const teaser = buildDryRunTeaser(counts, labels.length, false)!
    renderProTeaser(host, teaser)
    expect(host.style.display).toBe('block')
    ;(host.querySelector('button') as HTMLButtonElement).click()
    expect(host.style.display).toBe('none')
    renderProTeaser(host, teaser)
    expect(host.style.display).toBe('none')
    const other = buildDryRunTeaser(countLabelTypes([...labels, 'Video - 2 Jan 2020, 09:00:00']), labels.length + 1, false)!
    renderProTeaser(host, other)
    expect(host.style.display).toBe('block')
  })
})

describe('date filter report line and link', () => {
  it('names the skipped-unreadable count exactly', () => {
    expect(dateReportLine({ matched: 3, skippedUnreadable: 2, total: 9 }))
      .toBe('3 of 9 items match the date filter. 2 items skipped: date not readable.')
    expect(dateReportLine({ matched: 3, skippedUnreadable: 0, total: 9 })).toBe('3 of 9 items match the date filter.')
  })
  it('the Get Pro link carries utm_medium=date_filter and the #pro anchor', () => {
    const u = new URL(proUrl('date_filter'))
    expect(u.searchParams.get('utm_medium')).toBe('date_filter')
    expect(u.hash).toBe('#pro')
  })
})
