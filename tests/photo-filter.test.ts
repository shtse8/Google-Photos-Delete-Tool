import { describe, it, expect } from 'vitest'
import {
  classifyLabel,
  shouldSelectTile,
  labelTypeToken,
  PHOTO_TYPES,
  parseLabelDay,
  inputDayKey,
  dayInRange,
  filterRequiresPro,
  buildFilterFromControls,
  type PhotoFilter,
} from '../src/core/photo-filter'

describe('classifyLabel', () => {
  it('classifies the first label token across locales', () => {
    expect(classifyLabel('Photo - 10 mars 2012, 10:19:24')).toBe('photo')
    expect(classifyLabel('Screenshot - 1 jan 2020')).toBe('screenshot')
    expect(classifyLabel('Video - clip')).toBe('video')
    expect(classifyLabel('Animation - loop')).toBe('animation')
    expect(classifyLabel('Collage - c')).toBe('collage')
  })

  it('handles CJK labels', () => {
    expect(classifyLabel('写真 - 2020-01-01')).toBe('photo')
    expect(classifyLabel('動画 - clip')).toBe('video')
    expect(classifyLabel('スクリーンショット - x')).toBe('screenshot')
  })

  it('returns unknown for empty / unclassifiable labels', () => {
    expect(classifyLabel(null)).toBe('unknown')
    expect(classifyLabel('')).toBe('unknown')
    expect(classifyLabel('   ')).toBe('unknown')
    expect(classifyLabel('mystery token')).toBe('unknown')
  })

  it('never matches a type as a substring of a longer word', () => {
    // "video" must not match inside "videographer"-style tokens; the
    // matcher compares the FIRST TOKEN only.
    expect(classifyLabel('Video games folder - x')).toBe('video') // first token IS video
    expect(classifyLabel('Photo Editor - x')).toBe('photo') // first token is the type word
  })

  it('exposes the labelled token extractor', () => {
    expect(labelTypeToken('Screenshot - 10 mars')).toBe('screenshot')
    expect(labelTypeToken('Photo — 10 mars')).toBe('photo')
  })
})

describe('shouldSelectTile', () => {
  it('selects everything under an "all" filter', () => {
    expect(shouldSelectTile('Photo - a', { kind: 'all' })).toBe(true)
    expect(shouldSelectTile('Video - b', { kind: 'all' })).toBe(true)
    expect(shouldSelectTile(null, { kind: 'all' })).toBe(true)
  })

  it('selects only matching types under a type filter', () => {
    expect(shouldSelectTile('Screenshot - a', { kind: 'type', type: 'screenshot' })).toBe(true)
    expect(shouldSelectTile('Photo - b', { kind: 'type', type: 'screenshot' })).toBe(false)
    expect(shouldSelectTile(null, { kind: 'type', type: 'screenshot' })).toBe(false)
  })
})

describe('PHOTO_TYPES', () => {
  it('lists all filterable types without "unknown"', () => {
    expect(PHOTO_TYPES).toEqual(['photo', 'video', 'screenshot', 'animation', 'collage'])
  })
})

describe('parseLabelDay (fail closed)', () => {
  it('D Month YYYY, English (fixture: Photo - 2 Jan 2020, 09:00:00)', () => {
    expect(parseLabelDay('Photo - 2 Jan 2020, 09:00:00')).toBe(20200102)
    expect(parseLabelDay('Screenshot - 10 Mar 2012, 10:19:24')).toBe(20120310)
    expect(parseLabelDay('Screenshot - 1 jan 2020')).toBe(20200101)
  })
  it('D Month YYYY, French (fixture: Photo - 10 mars 2012, 10:19:24)', () => {
    expect(parseLabelDay('Photo - 10 mars 2012, 10:19:24')).toBe(20120310)
    expect(parseLabelDay('Screenshot - 10 mars 2012, 10:19:24')).toBe(20120310)
  })
  it('Month D, YYYY (fixture: Photo - Landscape - Mar 3, 2024, 10:22:13 AM)', () => {
    expect(parseLabelDay('Photo - Landscape - Mar 3, 2024, 10:22:13 AM')).toBe(20240303)
    expect(parseLabelDay('Video - Mar 4, 2024, 9:00:00 AM')).toBe(20240304)
    expect(parseLabelDay('Photo - Landscape - Mar 3, 2024, 10:22:13\u202fPM')).toBe(20240303)
  })
  it('YYYY-MM-DD (fixture: 写真 - 2020-01-01)', () => {
    expect(parseLabelDay('写真 - 2020-01-01')).toBe(20200101)
  })
  it('returns null for anything it cannot read with certainty', () => {
    expect(parseLabelDay(null)).toBeNull()
    expect(parseLabelDay('')).toBeNull()
    expect(parseLabelDay('Photo - Landscape')).toBeNull()
    expect(parseLabelDay('Photo - xyz 2024 abc')).toBeNull()
    expect(parseLabelDay('Photo - 10 mars')).toBeNull()
    expect(parseLabelDay('Photo - 31 Feb 2020')).toBeNull()
    expect(parseLabelDay('Photo - 5 Foo 2020')).toBeNull()
    expect(parseLabelDay('Photo - 03/04/2020')).toBeNull()
    expect(parseLabelDay('Photo 2 Jan 2020')).toBeNull()
  })
})

describe('dayInRange', () => {
  const d = (s: string): number => inputDayKey(s)!
  it('before is strictly earlier than the day', () => {
    const r = { mode: 'before', date: '2016-01-01' } as const
    expect(dayInRange(d('2015-12-31'), r)).toBe(true)
    expect(dayInRange(d('2016-01-01'), r)).toBe(false)
  })
  it('after is strictly later than the day', () => {
    const r = { mode: 'after', date: '2016-01-01' } as const
    expect(dayInRange(d('2016-01-02'), r)).toBe(true)
    expect(dayInRange(d('2016-01-01'), r)).toBe(false)
  })
  it('between includes both end days', () => {
    const r = { mode: 'between', from: '2020-01-02', to: '2020-01-04' } as const
    expect(dayInRange(d('2020-01-01'), r)).toBe(false)
    expect(dayInRange(d('2020-01-02'), r)).toBe(true)
    expect(dayInRange(d('2020-01-04'), r)).toBe(true)
    expect(dayInRange(d('2020-01-05'), r)).toBe(false)
  })
  it('an invalid or reversed range matches nothing', () => {
    expect(dayInRange(20200102, { mode: 'between', from: '2020-02-01', to: '2020-01-01' })).toBe(false)
    expect(dayInRange(20200102, { mode: 'before', date: 'nope' })).toBe(false)
  })
})

describe('shouldSelectTile with a date filter', () => {
  const before2016: PhotoFilter = { kind: 'date', range: { mode: 'before', date: '2016-01-01' } }
  const between: PhotoFilter = { kind: 'date', range: { mode: 'between', from: '2020-01-02', to: '2020-01-02' } }
  it('selects by label date', () => {
    expect(shouldSelectTile('Photo - 10 Mar 2012, 10:19:24', before2016)).toBe(true)
    expect(shouldSelectTile('Photo - 2 Jan 2020, 09:00:00', before2016)).toBe(false)
  })
  it('the inclusive end day matches through the whole day', () => {
    expect(shouldSelectTile('Photo - 2 Jan 2020, 23:59:59', between)).toBe(true)
    expect(shouldSelectTile('Photo - 3 Jan 2020, 00:00:00', between)).toBe(false)
  })
  it('an unparseable date is NOT selected', () => {
    expect(shouldSelectTile('Photo - Landscape', before2016)).toBe(false)
    expect(shouldSelectTile('Photo - 10 mars', before2016)).toBe(false)
    expect(shouldSelectTile(null, before2016)).toBe(false)
  })
  it('combines with the type filter: both must match', () => {
    const f: PhotoFilter = { kind: 'date', range: { mode: 'before', date: '2016-01-01' }, type: 'screenshot' }
    expect(shouldSelectTile('Screenshot - 10 Mar 2012, 10:19:24', f)).toBe(true)
    expect(shouldSelectTile('Photo - 10 Mar 2012, 10:19:24', f)).toBe(false)
    expect(shouldSelectTile('Screenshot - 2 Jan 2020, 09:00:00', f)).toBe(false)
  })
})

describe('Pro gating and control mapping', () => {
  it('only the date filter requires Pro', () => {
    expect(filterRequiresPro({ kind: 'date', range: { mode: 'before', date: '2016-01-01' } })).toBe(true)
    expect(filterRequiresPro({ kind: 'all' })).toBe(false)
    expect(filterRequiresPro({ kind: 'type', type: 'video' })).toBe(false)
  })
  it('maps controls to a filter and refuses a date mode without valid dates', () => {
    expect(buildFilterFromControls('all', 'off', '', '')).toEqual({ ok: true, filter: { kind: 'all' } })
    expect(buildFilterFromControls('video', 'off', '', '')).toEqual({ ok: true, filter: { kind: 'type', type: 'video' } })
    expect(buildFilterFromControls('video', 'before', '2016-01-01', '')).toEqual({
      ok: true,
      filter: { kind: 'date', range: { mode: 'before', date: '2016-01-01' }, type: 'video' },
    })
    expect(buildFilterFromControls('all', 'between', '2020-01-01', '2020-02-01')).toEqual({
      ok: true,
      filter: { kind: 'date', range: { mode: 'between', from: '2020-01-01', to: '2020-02-01' } },
    })
    expect(buildFilterFromControls('all', 'before', '', '').ok).toBe(false)
    expect(buildFilterFromControls('all', 'between', '2020-01-01', '').ok).toBe(false)
    expect(buildFilterFromControls('all', 'between', '2020-03-01', '2020-02-01').ok).toBe(false)
  })
})
