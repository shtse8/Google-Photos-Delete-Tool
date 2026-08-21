/**
 * Versioned, data-driven selector pack.
 *
 * All Google-Photos-specific selectors, action-button candidates, and
 * multilingual keyword lists live in `src/selector-packs/pack-v1.json`.
 * A drift fix is a data patch (bump version, adjust selectors), never
 * code surgery. `PACK_VERSION` rides in every diagnostic report so a
 * broken installation can be matched to the exact pack it ran.
 */
import packJson from '../selector-packs/pack-v1.json'

export interface SelectorDef {
  name: string
  primary: string
  fallbacks: string[]
}

export const PACK_VERSION: number = packJson.version

export interface SelectorPack {
  version: number
  selectors: Record<
    | 'counter'
    | 'checkbox'
    | 'checkboxChecked'
    | 'photoContainer'
    | 'scrollContainer'
    | 'dialog',
    SelectorDef
  >
  actionButtons: {
    toolbarDelete: string[]
    emptyTrash: string[]
  }
  keywords: {
    delete: string[]
    cancel: string[]
    contextualRemove: string[]
    emptyTrashPhrases: string[]
  }
  photoTypes: Record<'photo' | 'video' | 'screenshot' | 'animation' | 'collage', string[]>
  trashEmptySignals: string[]
}

export const PACK: SelectorPack = packJson as SelectorPack
