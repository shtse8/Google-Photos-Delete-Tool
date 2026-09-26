// @vitest-environment happy-dom
/**
 * Fixture-based DOM test: a Google Photos grid snippet (tile link with an
 * aria-label, a background-image thumbnail, a sibling checkbox), read
 * through the selector pack exactly as in the browser.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  harvestGridTiles,
  isGoogleImageUrl,
  mediaIdFromHref,
  sizedThumbUrl,
  thumbUrlOf,
  tileIdOf,
} from '../src/core/dedup/browser-grid'

const FIXTURE = `
<div role="main" class="yDSiEe uGCjIb zcLWac">
  <div class="tile">
    <a href="./photo/AF1QipAAAA1111" aria-label="Photo - Landscape - Mar 3, 2024, 10:22:13 AM">
      <div class="RY3tic" style="background-image: url(&quot;https://lh3.googleusercontent.com/pw/AP1GczAAA=w288-h192-no?authuser=0&quot;);"></div>
    </a>
    <div class="ckGgle" role="checkbox" aria-checked="false"></div>
  </div>
  <div class="tile">
    <a href="./photo/AF1QipBBBB2222" aria-label="Video - Mar 4, 2024, 9:00:00 AM">
      <img src="https://lh3.googleusercontent.com/pw/AP1GczBBB=w288-h192-no">
    </a>
    <div class="ckGgle" role="checkbox" aria-checked="false"></div>
  </div>
  <div class="tile">
    <a href="./photo/AF1QipCCCC3333" aria-label="Photo - no thumbnail yet"></a>
    <div class="ckGgle" role="checkbox" aria-checked="false"></div>
  </div>
  <div class="tile">
    <a href="./photo/AF1QipDDDD4444" aria-label="Photo - foreign host">
      <div style="background-image: url(https://example.com/x=w288)"></div>
    </a>
  </div>
  <div class="row-of-two">
    <a href="./photo/AF1QipEEEE5555"><div style="background-image: url(https://lh3.googleusercontent.com/pw/E=w1)"></div></a>
    <a href="./photo/AF1QipFFFF6666"><div style="background-image: url(https://lh3.googleusercontent.com/pw/F=w1)"></div></a>
    <div class="ckGgle orphan" role="checkbox" aria-checked="false"></div>
  </div>
</div>`

beforeEach(() => {
  document.body.innerHTML = FIXTURE
})

describe('harvestGridTiles on a grid fixture', () => {
  it('reads id, label and a Google thumbnail for each ready tile', () => {
    const tiles = harvestGridTiles()
    expect(tiles.map((t) => t.id)).toEqual(['AF1QipAAAA1111', 'AF1QipBBBB2222', 'AF1QipEEEE5555', 'AF1QipFFFF6666'])
    expect(tiles[0]).toEqual({
      id: 'AF1QipAAAA1111',
      label: 'Photo - Landscape - Mar 3, 2024, 10:22:13 AM',
      thumbUrl: 'https://lh3.googleusercontent.com/pw/AP1GczAAA=w288-h192-no?authuser=0',
    })
    expect(tiles[1].thumbUrl).toBe('https://lh3.googleusercontent.com/pw/AP1GczBBB=w288-h192-no')
  })

  it('skips tiles without a thumbnail or with a non-Google image host', () => {
    const ids = harvestGridTiles().map((t) => t.id)
    expect(ids).not.toContain('AF1QipCCCC3333')
    expect(ids).not.toContain('AF1QipDDDD4444')
  })
})

describe('tileIdOf (checkbox → item id)', () => {
  it('finds the one media link next to a checkbox', () => {
    const boxes = document.querySelectorAll('.tile .ckGgle')
    expect(tileIdOf(boxes[0])).toBe('AF1QipAAAA1111')
    expect(tileIdOf(boxes[1])).toBe('AF1QipBBBB2222')
  })

  it('returns null when the nearest container holds two links (fail closed)', () => {
    expect(tileIdOf(document.querySelector('.orphan')!)).toBeNull()
  })
})

describe('thumbnail address helpers', () => {
  it('reads the id from photo and video links', () => {
    expect(mediaIdFromHref('./photo/AF1QipXYZ12345')).toBe('AF1QipXYZ12345')
    expect(mediaIdFromHref('https://photos.google.com/video/AF1QipXYZ12345?x=1')).toBe('AF1QipXYZ12345')
    expect(mediaIdFromHref('./albums')).toBeNull()
    expect(mediaIdFromHref(null)).toBeNull()
  })

  it('allows only Google image hosts over https', () => {
    expect(isGoogleImageUrl('https://lh3.googleusercontent.com/pw/x=w1')).toBe(true)
    expect(isGoogleImageUrl('https://photos.fife.usercontent.google.com/pw/x=w1')).toBe(true)
    expect(isGoogleImageUrl('http://lh3.googleusercontent.com/pw/x')).toBe(false)
    expect(isGoogleImageUrl('https://googleusercontent.com.evil.test/x')).toBe(false)
    expect(isGoogleImageUrl('not a url')).toBe(false)
  })

  it('asks for a small copy by rewriting the size suffix', () => {
    expect(sizedThumbUrl('https://lh3.googleusercontent.com/pw/AP1=w288-h192-no?authuser=0'))
      .toBe('https://lh3.googleusercontent.com/pw/AP1=w64-h64-no?authuser=0')
    expect(sizedThumbUrl('https://lh3.googleusercontent.com/pw/AP1=w288-h192-k-no', 224))
      .toBe('https://lh3.googleusercontent.com/pw/AP1=w224-h224-no')
    expect(sizedThumbUrl('https://lh3.googleusercontent.com/pw/AP1')).toBe('https://lh3.googleusercontent.com/pw/AP1')
  })

  it('parses background-image and img sources', () => {
    const div = document.createElement('div')
    div.setAttribute('style', 'background-image: url("https://lh3.googleusercontent.com/pw/Q=w1")')
    expect(thumbUrlOf(div)).toBe('https://lh3.googleusercontent.com/pw/Q=w1')
    const img = document.createElement('img')
    img.setAttribute('src', 'https://example.com/q.jpg')
    expect(thumbUrlOf(img)).toBeNull()
  })
})
