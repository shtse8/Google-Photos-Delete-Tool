/**
 * Browser implementation of the EngineDom adapter.
 *
 * The engine never touches `document`/`window` directly; this module is
 * the only place where DOM APIs meet the engine. Everything else in
 * `core/` stays pure and unit-testable.
 */
import { SELECTOR_DEFS, queryOne, queryAll, queryScrollable, findDeleteToolbarButton, findConfirmDialog, findConfirmButton } from './selectors'
import { sleep } from './utils'
import type { ClickTarget, EngineDom, PhotoTile, ScrollTarget } from './dom-adapter'
import { tileIdOf } from './dedup/browser-grid'

function isClickable(el: Element): boolean {
  const he = el as HTMLElement
  if (he.hasAttribute('disabled')) return false
  if (he.getAttribute('aria-disabled') === 'true') return false
  return true
}

/**
 * Click the way a pointer does: pointer/mouse down and up, then click, at
 * the element's centre. Google Photos can ignore a bare synthetic
 * `click()` on a checkbox whose handler listens for the pointer sequence.
 */
export function pointerClick(el: HTMLElement): void {
  const r = el.getBoundingClientRect()
  const init = {
    bubbles: true,
    cancelable: true,
    composed: true,
    button: 0,
    clientX: r.left + r.width / 2,
    clientY: r.top + r.height / 2,
  }
  const fire = (type: string) => {
    const Ctor = type.startsWith('pointer') && typeof PointerEvent !== 'undefined' ? PointerEvent : MouseEvent
    el.dispatchEvent(new Ctor(type, init))
  }
  for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) fire(t)
}

function wrapTile(el: Element): PhotoTile {
  return {
    click: () => pointerClick(el as HTMLElement),
    label: () => {
      const labeled = el.closest('[aria-label]')
      return labeled?.getAttribute('aria-label') ?? null
    },
    id: () => tileIdOf(el),
  }
}

function wrapScrollTarget(el: HTMLElement): ScrollTarget {
  return {
    get scrollTop() { return el.scrollTop },
    // The engine resets the gallery to the top after each batch; without a
    // setter that assignment throws in strict mode and fails the run.
    set scrollTop(v: number) { el.scrollTop = v },
    get scrollHeight() { return el.scrollHeight },
    get clientHeight() { return el.clientHeight },
    scrollBy: (opts) => el.scrollBy(opts),
    scrollTo: (opts) => el.scrollTo(opts),
  }
}

function findScrollTarget(): ScrollTarget | null {
  // The gallery scroller is pack-owned (`scrollContainer` def): a DOM
  // drift is a pack data patch. Unknown DOM returns null (fail closed).
  const container = queryScrollable(SELECTOR_DEFS.scrollContainer)
  if (container) {
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
