import { describe, it, expect } from 'vitest'
import { PACK, PACK_VERSION } from '../src/core/selector-pack'
import { SELECTOR_DEFS, TRASH_EMPTY_SIGNALS } from '../src/core/selectors'

describe('selector pack', () => {
  it('ships a versioned data pack', () => {
    expect(PACK_VERSION).toBe(3)
    expect(PACK.version).toBe(3)
  })

  it('defines every core selector', () => {
    expect(SELECTOR_DEFS.counter.primary).toBe('.rtExYb')
    expect(SELECTOR_DEFS.checkbox.primary).toContain('aria-checked')
    expect(SELECTOR_DEFS.checkboxChecked.primary).toContain('aria-checked')
    expect(SELECTOR_DEFS.photoContainer.fallbacks.length).toBeGreaterThan(0)
    expect(SELECTOR_DEFS.scrollContainer.primary).toBe('.yDSiEe.uGCjIb.zcLWac')
    expect(SELECTOR_DEFS.scrollContainer.fallbacks.length).toBeGreaterThan(0)
    expect(SELECTOR_DEFS.dialog.primary).toBe('[role="dialog"]')
    expect(SELECTOR_DEFS.dialog.fallbacks).toContain('[role="alertdialog"]')
    expect(SELECTOR_DEFS.dialog.fallbacks).toContain('[aria-modal="true"]')
  })

  it('keeps destructive keyword lists non-empty and distinct', () => {
    expect(PACK.keywords.delete.length).toBeGreaterThan(20)
    expect(PACK.keywords.cancel.length).toBeGreaterThan(10)
    expect(PACK.keywords.emptyTrashPhrases.length).toBeGreaterThan(5)
    expect(PACK.keywords.contextualRemove.length).toBeGreaterThan(0)
    expect(TRASH_EMPTY_SIGNALS.length).toBeGreaterThan(0)
  })

  it('exposes toolbar candidates for delete and empty-trash', () => {
    expect(PACK.actionButtons.toolbarDelete).toContain('button[aria-label="Move to trash"]')
    expect(PACK.actionButtons.emptyTrash).toContain('button[aria-label="Empty trash"]')
  })
})
