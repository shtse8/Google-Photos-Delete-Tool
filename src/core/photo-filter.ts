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
  /** Pro: only tiles whose label date is in `range` (and of `type`, when set). */
  | { kind: 'date'; range: DateRange; type?: Exclude<PhotoType, 'unknown'> }
  /** Exactly these Google Photos item ids (chosen in the duplicate review). */
  | { kind: 'ids'; ids: readonly string[] }

/**
 * Calendar-day range in the user's local time (dates are `YYYY-MM-DD`, as an
 * `<input type="date">` yields). `before` / `after` are exclusive of the given
 * day; `between` includes both end days.
 */
export type DateRange =
  | { mode: 'before'; date: string }
  | { mode: 'after'; date: string }
  | { mode: 'between'; from: string; to: string }

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

const MONTHS: Record<string, number> = {}
;[
  ['january', 'jan', 'janvier'],
  ['february', 'feb', 'février', 'fevrier'],
  ['march', 'mar', 'mars'],
  ['april', 'apr', 'avril'],
  ['may', 'mai'],
  ['june', 'jun', 'juin'],
  ['july', 'jul', 'juillet'],
  ['august', 'aug', 'août', 'aout'],
  ['september', 'sep', 'sept', 'septembre'],
  ['october', 'oct', 'octobre'],
  ['november', 'nov', 'novembre'],
  ['december', 'dec', 'décembre', 'decembre'],
].forEach((names, i) => names.forEach(n => { MONTHS[n] = i + 1 }))

/** A calendar day as a sortable number: 2020-01-02 -> 20200102. Null if not a real day. */
function dayKey(y: number, m: number, d: number): number | null {
  if (!(m >= 1 && m <= 12 && d >= 1 && y >= 1000 && y <= 9999)) return null
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return d <= last ? y * 10000 + m * 100 + d : null
}

/** `YYYY-MM-DD` (date input value) to a day key; null for anything else. */
export function inputDayKey(value: string | null | undefined): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '')
  return m ? dayKey(+m[1], +m[2], +m[3]) : null
}

/**
 * Calendar day shown in a tile label, or null when it cannot be read with
 * certainty. Supported forms (each segment of the label after the type word,
 * anchored at its start):
 *   D Month YYYY[, time]   "2 Jan 2020, 09:00:00", "10 mars 2012, 10:19:24"
 *   Month D, YYYY[, time]  "Mar 3, 2024, 10:22:13 AM"
 *   YYYY-MM-DD             "2020-01-01"
 * Month names: English and French. Anything else returns null; nothing is guessed.
 */
export function parseLabelDay(label: string | null | undefined): number | null {
  if (!label) return null
  const segments = label.replace(/[\u00a0\u202f]/g, ' ').split(/\s[-–—]\s/).slice(1)
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i].trim()
    let m = /^(\d{4})-(\d{2})-(\d{2})(?!\d)/.exec(seg)
    if (m) return dayKey(+m[1], +m[2], +m[3])
    m = /^(\d{1,2}) ([A-Za-zÀ-ÿ]+)\.? (\d{4})(?!\d)/.exec(seg)
    if (m) {
      const mo = MONTHS[m[2].toLowerCase()]
      return mo ? dayKey(+m[3], mo, +m[1]) : null
    }
    m = /^([A-Za-zÀ-ÿ]+)\.? (\d{1,2}), (\d{4})(?!\d)/.exec(seg)
    if (m) {
      const mo = MONTHS[m[1].toLowerCase()]
      return mo ? dayKey(+m[3], mo, +m[2]) : null
    }
  }
  return null
}

/** Whether a day key is inside `range`; an invalid range matches nothing. */
export function dayInRange(day: number, range: DateRange): boolean {
  if (range.mode === 'before') {
    const d = inputDayKey(range.date)
    return d !== null && day < d
  }
  if (range.mode === 'after') {
    const d = inputDayKey(range.date)
    return d !== null && day > d
  }
  const from = inputDayKey(range.from)
  const to = inputDayKey(range.to)
  return from !== null && to !== null && from <= to && day >= from && day <= to
}

/** Message shown when a free user tries a Pro-only filter. */
export const PRO_FILTER_ERROR = 'The date filter needs Pro. Activate a Pro license or use the unfiltered run.'

/** Whether `filter` is a Pro-only filter (the date filter). */
export function filterRequiresPro(filter: PhotoFilter): boolean {
  return filter.kind === 'date'
}

/** Whether a tile passes the type half of a date filter. */
export function dateFilterTypeMatches(label: string | null | undefined, filter: Extract<PhotoFilter, { kind: 'date' }>): boolean {
  return !filter.type || classifyLabel(label) === filter.type
}

export function shouldSelectTile(label: string | null | undefined, filter: PhotoFilter): boolean {
  if (filter.kind === 'all') return true
  if (filter.kind === 'date') {
    if (!dateFilterTypeMatches(label, filter)) return false
    const day = parseLabelDay(label)
    return day !== null && dayInRange(day, filter.range)
  }
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

export type DateControlMode = 'off' | DateRange['mode']

/**
 * Build the run filter from the popup / panel controls (type value `all` or a
 * type, date mode `off` | `before` | `after` | `between`, and the one or two
 * `YYYY-MM-DD` inputs). A date mode without valid dates is an error, never a
 * silent unfiltered run.
 */
export function buildFilterFromControls(
  typeValue: string,
  dateMode: string,
  dateA: string,
  dateB: string,
): { ok: true; filter: PhotoFilter } | { ok: false; error: string } {
  const type = (PHOTO_TYPES as readonly string[]).includes(typeValue)
    ? (typeValue as Exclude<PhotoType, 'unknown'>)
    : undefined
  if (dateMode === 'off' || !dateMode) {
    return { ok: true, filter: type ? { kind: 'type', type } : { kind: 'all' } }
  }
  let range: DateRange
  if (dateMode === 'before' || dateMode === 'after') {
    if (inputDayKey(dateA) === null) return { ok: false, error: 'Choose a date for the date filter.' }
    range = { mode: dateMode, date: dateA }
  } else if (dateMode === 'between') {
    const from = inputDayKey(dateA)
    const to = inputDayKey(dateB)
    if (from === null || to === null) return { ok: false, error: 'Choose both dates for the date filter.' }
    if (from > to) return { ok: false, error: 'The start date must not be after the end date.' }
    range = { mode: 'between', from: dateA, to: dateB }
  } else {
    return { ok: false, error: 'Unknown date filter mode.' }
  }
  return { ok: true, filter: type ? { kind: 'date', range, type } : { kind: 'date', range } }
}
