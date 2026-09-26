/**
 * Type filtering for photo tiles (Pro feature).
 *
 * Google Photos tiles carry an aria-label whose first token is the item
 * type, e.g. "Screenshot - 10 mars 2012, 10:19:24" / "Video - ..." /
 * "Photo - ...". Classification matches the FIRST TOKEN (not a substring)
 * against the multilingual keyword lists in the versioned selector pack,
 * so "photo" never matches inside a longer word. Unknown labels are
 * EXCLUDED by type filters (fail closed: a filter deletes only what it
 * can positively classify).
 */
import { PACK } from './selector-pack'
import { normalizeText } from './selectors'

export type PhotoType = 'photo' | 'video' | 'screenshot' | 'animation' | 'collage' | 'unknown'

export type PhotoFilter =
  | { kind: 'all' }
  | { kind: 'type'; type: Exclude<PhotoType, 'unknown'> }
  /** Exactly these Google Photos item ids (chosen in the duplicate review). */
  | { kind: 'ids'; ids: readonly string[] }

export const PHOTO_TYPES: readonly Exclude<PhotoType, 'unknown'>[] = [
  'photo',
  'video',
  'screenshot',
  'animation',
  'collage',
]

const NORMALIZED_TYPE_KEYWORDS = Object.fromEntries(
  PHOTO_TYPES.map(type => [
    type,
    (PACK.photoTypes[type] ?? []).map(normalizeText).filter(k => k.length > 0),
  ]),
)

/** First token of the label (the type word), normalized. */
export function labelTypeToken(label: string): string {
  const firstSegment = label.split(/[-–—]/)[0] ?? label
  return normalizeText(firstSegment)
}

export function classifyLabel(label: string | null | undefined): PhotoType {
  if (!label || label.trim().length === 0) return 'unknown'
  const token = labelTypeToken(label)
  if (!token) return 'unknown'
  // Longest, most specific types first so "screenshot" beats "photo" in
  // any locale where screenshot labels embed the photo word.
  const order: Exclude<PhotoType, 'unknown'>[] = ['screenshot', 'animation', 'collage', 'video', 'photo']
  for (const type of order) {
    if (NORMALIZED_TYPE_KEYWORDS[type].some(k => token === k || token.startsWith(k + ' '))) {
      return type
    }
  }
  return 'unknown'
}

export function shouldSelectTile(label: string | null | undefined, filter: PhotoFilter): boolean {
  if (filter.kind === 'all') return true
  // An id filter needs the tile id; a label alone never matches it.
  if (filter.kind === 'ids') return false
  return classifyLabel(label) === filter.type
}

/**
 * Whether a tile is in scope for `filter`. An id filter matches only a tile
 * whose id is known and listed; a tile that cannot be identified is never
 * selected (fail closed).
 */
export function tileMatchesFilter(
  tile: { label(): string | null; id?(): string | null },
  filter: PhotoFilter,
  idSet?: ReadonlySet<string>,
): boolean {
  if (filter.kind !== 'ids') return shouldSelectTile(tile.label(), filter)
  const id = tile.id?.() ?? null
  if (!id) return false
  return (idSet ?? new Set(filter.ids)).has(id)
}

/** Short log text for a filter (an id filter logs its size, not every id). */
export function describeFilter(filter: PhotoFilter): string {
  return filter.kind === 'ids' ? `ids(${filter.ids.length})` : JSON.stringify(filter)
}
