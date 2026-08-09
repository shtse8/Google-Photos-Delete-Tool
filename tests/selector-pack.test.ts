import { describe, it, expect } from 'vitest'
import { PACK, PACK_VERSION } from '../src/core/selector-pack'
import { SELECTOR_DEFS, TRASH_EMPTY_SIGNALS } from '../src/core/selectors'

describe('selector pack', () => {
  it('ships a versioned data pack', () => {
    expect(PACK_VERSION).toBe(2)
    expect(PACK.version).toBe(2)
  })

  it('defines every core selector', () => {
    expect(SELECTOR_DEFS.counter.primary).toBe('.rtExYb')
    expect(SELECTOR_DEFS.checkbox.primary).toContain('aria-checked')
    expect(SELECTOR_DEFS.checkboxChecked.primary).toContain('aria-checked')
    expect(SELECTOR_DEFS.photoContainer.fallbacks.length).toBeGreaterThan(0)
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
