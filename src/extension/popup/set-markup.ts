/**
 * Replace an element's children with trusted markup, parsed through
 * DOMParser instead of an `innerHTML` assignment. The inputs are our own
 * bundled icon SVGs and i18n strings (substituted values are already
 * HTML-escaped by `tHtml`); parsing them into nodes keeps the same result and
 * avoids the dynamic `innerHTML` assignment that Mozilla's add-on linter
 * (AMO review) flags as UNSAFE_VAR_ASSIGNMENT.
 */
export function setMarkup(el: Element, markup: string): void {
  const doc = new DOMParser().parseFromString(markup, 'text/html')
  el.replaceChildren(...Array.from(doc.body.childNodes))
}
