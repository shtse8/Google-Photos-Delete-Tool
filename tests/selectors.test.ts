import { describe, it, expect } from 'vitest'
import {
  normalizeText,
  containsAnyKeyword,
  DELETE_KEYWORDS,
  CANCEL_KEYWORDS,
} from '../src/core/selectors'

describe('normalizeText', () => {
  it('returns empty string for null/undefined/empty', () => {
    expect(normalizeText(null)).toBe('')
    expect(normalizeText(undefined)).toBe('')
    expect(normalizeText('')).toBe('')
  })

  it('lowercases input', () => {
    expect(normalizeText('SUPPRIMER')).toBe('supprimer')
    expect(normalizeText('Move To Trash')).toBe('move to trash')
  })

  it('strips combining diacritics', () => {
    expect(normalizeText('Déplacer vers la corbeille')).toBe('deplacer vers la corbeille')
    expect(normalizeText('À la corbeille')).toBe('a la corbeille')
    expect(normalizeText('Löschen')).toBe('loschen')
    expect(normalizeText('Eliminár')).toBe('eliminar')
  })

  it('collapses whitespace and trims', () => {
    expect(normalizeText('  Move   to\nTrash  ')).toBe('move to trash')
  })

  it('leaves CJK characters intact', () => {
    expect(normalizeText('ゴミ箱に移動')).toBe('ゴミ箱に移動')
    expect(normalizeText('删除')).toBe('删除')
    expect(normalizeText('휴지통으로 이동')).toBe('휴지통으로 이동')
  })
})

describe('containsAnyKeyword - DELETE_KEYWORDS', () => {
  it('matches English variants', () => {
    expect(containsAnyKeyword('Move to trash', DELETE_KEYWORDS)).toBe(true)
    expect(containsAnyKeyword('Move to bin', DELETE_KEYWORDS)).toBe(true)
    expect(containsAnyKeyword('Delete', DELETE_KEYWORDS)).toBe(true)
    expect(containsAnyKeyword('Remove', DELETE_KEYWORDS)).toBe(true)
  })

  it('matches French variants (the user’s case)', () => {
    expect(containsAnyKeyword('Mettre à la corbeille', DELETE_KEYWORDS)).toBe(true)
    expect(containsAnyKeyword('Placer dans la corbeille', DELETE_KEYWORDS)).toBe(true)
    expect(containsAnyKeyword('Déplacer vers la corbeille', DELETE_KEYWORDS)).toBe(true)
    expect(containsAnyKeyword('Supprimer', DELETE_KEYWORDS)).toBe(true)
  })

  it('matches Spanish', () => {
    expect(containsAnyKeyword('Mover a la papelera', DELETE_KEYWORDS)).toBe(true)
    expect(containsAnyKeyword('Eliminar', DELETE_KEYWORDS)).toBe(true)
  })

  it('matches German', () => {
    expect(containsAnyKeyword('In den Papierkorb verschieben', DELETE_KEYWORDS)).toBe(true)
    expect(containsAnyKeyword('Löschen', DELETE_KEYWORDS)).toBe(true)
  })

  it('matches Italian', () => {
    expect(containsAnyKeyword('Sposta nel cestino', DELETE_KEYWORDS)).toBe(true)
    expect(containsAnyKeyword('Elimina', DELETE_KEYWORDS)).toBe(true)
  })

  it('matches Portuguese', () => {
    expect(containsAnyKeyword('Mover para o lixo', DELETE_KEYWORDS)).toBe(true)
    expect(containsAnyKeyword('Excluir', DELETE_KEYWORDS)).toBe(true)
  })

  it('matches CJK', () => {
    expect(containsAnyKeyword('ゴミ箱に移動', DELETE_KEYWORDS)).toBe(true)
    expect(containsAnyKeyword('削除', DELETE_KEYWORDS)).toBe(true)
    expect(containsAnyKeyword('移至回收站', DELETE_KEYWORDS)).toBe(true)
    expect(containsAnyKeyword('휴지통으로 이동', DELETE_KEYWORDS)).toBe(true)
  })

  it('does not match unrelated text', () => {
    expect(containsAnyKeyword('Share', DELETE_KEYWORDS)).toBe(false)
    expect(containsAnyKeyword('Partager', DELETE_KEYWORDS)).toBe(false)
    expect(containsAnyKeyword('Compartir', DELETE_KEYWORDS)).toBe(false)
    expect(containsAnyKeyword('Download', DELETE_KEYWORDS)).toBe(false)
    expect(containsAnyKeyword('Add to album', DELETE_KEYWORDS)).toBe(false)
    expect(containsAnyKeyword('', DELETE_KEYWORDS)).toBe(false)
    expect(containsAnyKeyword(null, DELETE_KEYWORDS)).toBe(false)
  })
})

describe('containsAnyKeyword - CANCEL_KEYWORDS', () => {
  it('matches Cancel across languages', () => {
    expect(containsAnyKeyword('Cancel', CANCEL_KEYWORDS)).toBe(true)
    expect(containsAnyKeyword('Annuler', CANCEL_KEYWORDS)).toBe(true)
    expect(containsAnyKeyword('Cancelar', CANCEL_KEYWORDS)).toBe(true)
    expect(containsAnyKeyword('Abbrechen', CANCEL_KEYWORDS)).toBe(true)
    expect(containsAnyKeyword('Annulla', CANCEL_KEYWORDS)).toBe(true)
    expect(containsAnyKeyword('キャンセル', CANCEL_KEYWORDS)).toBe(true)
    expect(containsAnyKeyword('取消', CANCEL_KEYWORDS)).toBe(true)
    expect(containsAnyKeyword('취소', CANCEL_KEYWORDS)).toBe(true)
  })

  it('does not match destructive verbs', () => {
    expect(containsAnyKeyword('Move to trash', CANCEL_KEYWORDS)).toBe(false)
    expect(containsAnyKeyword('Mettre à la corbeille', CANCEL_KEYWORDS)).toBe(false)
  })
})

describe('DELETE_KEYWORDS vs CANCEL_KEYWORDS - no overlap', () => {
  it('no destructive label is misread as cancel', () => {
    const destructiveLabels = [
      'Move to trash',
      'Mettre à la corbeille',
      'Mover a la papelera',
      'In den Papierkorb verschieben',
      'Sposta nel cestino',
      'Mover para o lixo',
      'ゴミ箱に移動',
      '移至回收站',
      '휴지통으로 이동',
    ]
    for (const label of destructiveLabels) {
      expect(
        containsAnyKeyword(label, DELETE_KEYWORDS),
        `expected DELETE match for "${label}"`,
      ).toBe(true)
      expect(
        containsAnyKeyword(label, CANCEL_KEYWORDS),
        `expected NO CANCEL match for "${label}"`,
      ).toBe(false)
    }
  })

  it('no cancel label is misread as destructive', () => {
    const cancelLabels = [
      'Cancel',
      'Annuler',
      'Cancelar',
      'Abbrechen',
      'Annulla',
      'キャンセル',
      '取消',
      '취소',
    ]
    for (const label of cancelLabels) {
      expect(
        containsAnyKeyword(label, CANCEL_KEYWORDS),
        `expected CANCEL match for "${label}"`,
      ).toBe(true)
      expect(
        containsAnyKeyword(label, DELETE_KEYWORDS),
        `expected NO DELETE match for "${label}"`,
      ).toBe(false)
    }
  })
})
