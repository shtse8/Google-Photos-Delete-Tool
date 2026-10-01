/**
 * Renders the free-user dry-run teaser (core/pro-moments.ts) into a host
 * element: per-type counts, one line about Pro, a Get Pro link and a dismiss
 * control. Plain text and a link only; it never blocks or clicks anything.
 */
import type { DryRunTeaser } from '../../core/pro-moments'
import { getLocale, t } from '../../extension/popup/i18n'

/** The teaser copy in the active locale (English where no locale is set, e.g. the userscript). */
function localize(teaser: DryRunTeaser): { counts: string; cta: string; link: string } {
  const fmt = (n: number): string => n.toLocaleString(getLocale())
  const counts = teaser.parts.length > 0
    ? t('pro.teaser.counts', {
        list: teaser.parts
          .map((p) => t(`pro.types.${p.type}${p.n === 1 ? 'One' : 'Many'}`, { n: fmt(p.n) }))
          .join(t('pro.teaser.sep')),
      })
    : t('pro.teaser.total', { n: fmt(teaser.total) })
  const v = teaser.variant === 'b' ? 'B' : 'A'
  return { counts, cta: t(`pro.teaser.cta${v}`), link: t(`pro.teaser.link${v}`) }
}

export function renderProTeaser(host: HTMLElement, teaser: DryRunTeaser | null): void {
  host.replaceChildren()
  // A dismissed teaser stays hidden when the same result is re-rendered
  // (repeat status messages); a new dry run with different counts shows again.
  if (!teaser || host.dataset.dismissed === teaser.countsLine) {
    host.style.display = 'none'
    return
  }
  host.style.cssText = 'display:block;margin-top:8px;font-size:12px;line-height:1.4;color:inherit'
  const copy = localize(teaser)
  const counts = document.createElement('div')
  counts.textContent = copy.counts
  const cta = document.createElement('div')
  cta.style.cssText = 'opacity:0.85;margin-top:2px'
  cta.append(copy.cta + ' ')
  const link = document.createElement('a')
  link.href = teaser.url
  link.target = '_blank'
  link.rel = 'noopener'
  link.textContent = copy.link
  link.style.cssText = 'font-weight:600;margin-right:10px'
  const dismiss = document.createElement('button')
  dismiss.type = 'button'
  dismiss.textContent = t('pro.teaser.dismiss')
  dismiss.style.cssText = 'all:unset;cursor:pointer;opacity:0.6;text-decoration:underline'
  dismiss.addEventListener('click', () => {
    host.dataset.dismissed = teaser.countsLine
    renderProTeaser(host, null)
  })
  cta.append(link, dismiss)
  host.append(counts, cta)
}
