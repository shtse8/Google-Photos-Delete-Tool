/**
 * Renders the free-user dry-run teaser (core/pro-moments.ts) into a host
 * element: per-type counts, one line about Pro, a Get Pro link and a dismiss
 * control. Plain text and a link only; it never blocks or clicks anything.
 */
import type { DryRunTeaser } from '../../core/pro-moments'

export function renderProTeaser(host: HTMLElement, teaser: DryRunTeaser | null): void {
  host.replaceChildren()
  // A dismissed teaser stays hidden when the same result is re-rendered
  // (repeat status messages); a new dry run with different counts shows again.
  if (!teaser || host.dataset.dismissed === teaser.countsLine) {
    host.style.display = 'none'
    return
  }
  host.style.cssText = 'display:block;margin-top:8px;font-size:12px;line-height:1.4;color:inherit'
  const counts = document.createElement('div')
  counts.textContent = teaser.countsLine
  const cta = document.createElement('div')
  cta.style.cssText = 'opacity:0.85;margin-top:2px'
  cta.append(teaser.ctaLine + ' ')
  const link = document.createElement('a')
  link.href = teaser.url
  link.target = '_blank'
  link.rel = 'noopener'
  link.textContent = teaser.linkLabel
  link.style.cssText = 'font-weight:600;margin-right:10px'
  const dismiss = document.createElement('button')
  dismiss.type = 'button'
  dismiss.textContent = 'Dismiss'
  dismiss.style.cssText = 'all:unset;cursor:pointer;opacity:0.6;text-decoration:underline'
  dismiss.addEventListener('click', () => {
    host.dataset.dismissed = teaser.countsLine
    renderProTeaser(host, null)
  })
  cta.append(link, dismiss)
  host.append(counts, cta)
}
