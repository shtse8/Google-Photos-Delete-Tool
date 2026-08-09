/**
 * Browser implementation of the EngineDom adapter.
 *
 * The engine never touches `document`/`window` directly; this module is
 * the only place where DOM APIs meet the engine. Everything else in
 * `core/` stays pure and unit-testable.
 */
import { SELECTOR_DEFS, queryOne, queryAll, findDeleteToolbarButton, findConfirmDialog, findConfirmButton } from './selectors'
import { sleep } from './utils'
import type { ClickTarget, EngineDom, PhotoTile, ScrollTarget } from './dom-adapter'

function isClickable(el: Element): boolean {
  const he = el as HTMLElement
  if (he.hasAttribute('disabled')) return false
  if (he.getAttribute('aria-disabled') === 'true') return false
  return true
}

function wrapTile(el: Element): PhotoTile {
  return {
    click: () => (el as HTMLElement).click(),
    label: () => {
      const labeled = el.closest('[aria-label]')
      return labeled?.getAttribute('aria-label') ?? null
    },
  }
}

function wrapScrollTarget(el: HTMLElement): ScrollTarget {
  return {
    get scrollTop() { return el.scrollTop },
    get scrollHeight() { return el.scrollHeight },
    get clientHeight() { return el.clientHeight },
    scrollBy: (opts) => el.scrollBy(opts),
    scrollTo: (opts) => el.scrollTo(opts),
  }
}

function findScrollTarget(): ScrollTarget | null {
  const container = queryOne(SELECTOR_DEFS.photoContainer) as HTMLElement | null
  if (container && container.scrollHeight > container.clientHeight + 1) {
    return wrapScrollTarget(container)
  }
  const docScroll = (typeof document !== 'undefined' && (document.scrollingElement || document.documentElement)) as HTMLElement | null
  if (docScroll && docScroll.scrollHeight > docScroll.clientHeight + 1) {
    return wrapScrollTarget(docScroll)
  }
  return null
}

export const browserDom: EngineDom = {
  get pathname() {
    return typeof window !== 'undefined' ? window.location.pathname : '(no window)'
  },
  counterText: () => {
    const el = queryOne(SELECTOR_DEFS.counter)
    return el?.textContent ?? null
  },
  uncheckedTiles: () => {
    return queryAll(SELECTOR_DEFS.checkbox).filter(isClickable).map(wrapTile)
  },
  checkedTiles: () => {
    return queryAll(SELECTOR_DEFS.checkboxChecked).filter(isClickable).map(wrapTile)
  },
  findDeleteToolbarButton: () => findDeleteToolbarButton(),
  findConfirmDialog: () => findConfirmDialog(),
  findConfirmButton: (dialog) => findConfirmButton(dialog as HTMLElement),
  findScrollTarget,
  click: (target: ClickTarget) => (target as HTMLElement).click(),
  sleep,
}
