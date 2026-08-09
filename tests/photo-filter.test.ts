import { describe, it, expect } from 'vitest'
import { classifyLabel, shouldSelectTile, labelTypeToken, PHOTO_TYPES } from '../src/core/photo-filter'

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
