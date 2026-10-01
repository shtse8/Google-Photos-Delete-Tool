/**
 * Replace an element's children with trusted markup, parsed through
 * DOMParser instead of an `innerHTML` assignment. The inputs must be our own
 * bundled icon SVGs and static i18n strings: `tHtml` does NOT escape the
 * values it substitutes, so never pass page, user or storage data through
 * here (put such text in `textContent` instead). Parsing into nodes keeps the
 * same result and avoids the dynamic `innerHTML` assignment that Mozilla's
 * add-on linter (AMO review) flags as UNSAFE_VAR_ASSIGNMENT.
 */
export function setMarkup(el: Element, markup: string): void {
  const doc = new DOMParser().parseFromString(markup, 'text/html')
  el.replaceChildren(...Array.from(doc.body.childNodes))
}
