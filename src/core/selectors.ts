/**
 * Google Photos DOM selectors.
 * These may break when Google updates their UI — update here only.
 */
export const SELECTORS = {
  /** Selected photo count display */
  counter: '.rtExYb',
  /** Unchecked photo checkboxes */
  checkbox: '.ckGgle[aria-checked=false]',
  /** Main scrollable photo container */
  photoContainer: '.yDSiEe.uGCjIb.zcLWac.eejsDc.TWmIyd',
  /** Trash button in toolbar */
  deleteButton: 'button[aria-label="Move to trash"]',
} as const
