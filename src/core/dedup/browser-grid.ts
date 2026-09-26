/**
 * Browser side of duplicate finding: read tiles from the Google Photos
 * grid and hash their thumbnails.
 *
 * Tiles are found through the versioned selector pack (`mediaLink`,
 * `thumbnail`); a tile without a readable id or thumbnail is skipped, never
 * guessed. Thumbnails are fetched only from Google's own image hosts
 * (`*.googleusercontent.com`, `*.usercontent.google.com`) — the same
 * servers the grid already loads them from — at 64 px, decoded in memory,
 * reduced to 1024 gray pixels, and hashed. Nothing is stored or sent
 * anywhere else.
 */
import { SELECTOR_DEFS, type SelectorDef } from '../selectors'
import { diagnostics } from '../diagnostics'
import { HASH_RESOLUTION, perceptualHash, rgbaToGray } from './phash'
import type { GridTile } from './scan'

const THUMB_PX = 64

function selectorsOf(def: SelectorDef): string {
  return [def.primary, ...def.fallbacks].join(', ')
}

/** Google Photos item id from a tile link (`./photo/AF1Qip…`). */
export function mediaIdFromHref(href: string | null | undefined): string | null {
  if (!href) return null
  const m = /\/(?:photo|video)\/([A-Za-z0-9_-]{8,})/.exec(href)
  return m ? m[1] : null
}

/** True only for Google's own image hosts over https. */
export function isGoogleImageUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' &&
      (u.hostname.endsWith('.googleusercontent.com') || u.hostname.endsWith('.usercontent.google.com'))
  } catch {
    return false
  }
}

/**
 * Ask Google's image server for a small copy: replace the size suffix
 * after the last `=` in the path (`…=w288-h192-no` → `…=w64-h64-no`).
 * URLs without a size suffix are returned unchanged.
 */
export function sizedThumbUrl(url: string, px = THUMB_PX): string {
  const q = url.indexOf('?')
  const path = q >= 0 ? url.slice(0, q) : url
  const query = q >= 0 ? url.slice(q) : ''
  const slash = path.lastIndexOf('/')
  const eq = path.lastIndexOf('=')
  if (eq <= slash) return url
  return `${path.slice(0, eq)}=w${px}-h${px}-no${query}`
}

/** Thumbnail address from `background-image: url("…")` or an `<img src>`. */
export function thumbUrlOf(el: Element): string | null {
  const style = (el as HTMLElement).style?.backgroundImage || el.getAttribute('style') || ''
  const m = /url\(\s*(['"]?)(.*?)\1\s*\)/.exec(style)
  const raw = m ? m[2] : el.getAttribute('src')
  if (!raw) return null
  const url = raw.replace(/&quot;/g, '').replace(/&amp;/g, '&')
  return isGoogleImageUrl(url) ? url : null
}

function thumbnailNear(link: Element): Element | null {
  const sel = selectorsOf(SELECTOR_DEFS.thumbnail)
  if (link.matches(sel)) return link
  return link.querySelector(sel) ?? link.parentElement?.querySelector(sel) ?? null
}

/** Every tile rendered right now that has both an id and a Google thumbnail. */
export function harvestGridTiles(root: ParentNode = document): GridTile[] {
  const links = root.querySelectorAll(selectorsOf(SELECTOR_DEFS.mediaLink))
  const tiles: GridTile[] = []
  const ids = new Set<string>()
  let noThumb = 0
  for (const link of links) {
    const id = mediaIdFromHref(link.getAttribute('href'))
    if (!id || ids.has(id)) continue
    const thumbEl = thumbnailNear(link)
    const thumbUrl = thumbEl ? thumbUrlOf(thumbEl) : null
    if (!thumbUrl) { noThumb++; continue }
    ids.add(id)
    const label = link.getAttribute('aria-label') ?? link.closest('[aria-label]')?.getAttribute('aria-label') ?? null
    tiles.push({ id, label, thumbUrl })
  }
  diagnostics.recordSelector(SELECTOR_DEFS.mediaLink.name, links.length > 0 ? 'primary' : 'none')
  diagnostics.recordSelector(SELECTOR_DEFS.thumbnail.name, tiles.length > 0 ? 'primary' : noThumb > 0 ? 'none' : 'primary')
  return tiles
}

/**
 * Item id for a tile's checkbox: the nearest ancestor that holds exactly
 * one media link. Two or more links (or none within reach) means the
 * tile cannot be identified, so the answer is null (fail closed).
 */
export function tileIdOf(el: Element, maxDepth = 6): string | null {
  const sel = selectorsOf(SELECTOR_DEFS.mediaLink)
  const own = el.closest(sel)
  if (own) return mediaIdFromHref(own.getAttribute('href'))
  let node: Element | null = el.parentElement
  for (let depth = 0; node && depth < maxDepth; depth++, node = node.parentElement) {
    const links = node.querySelectorAll(sel)
    if (links.length === 1) return mediaIdFromHref(links[0].getAttribute('href'))
    if (links.length > 1) return null
  }
  return null
}

type Canvas2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D
let ctx: Canvas2D | null = null

function context(): Canvas2D {
  if (ctx) return ctx
  const size = HASH_RESOLUTION
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(size, size)
    : Object.assign(document.createElement('canvas'), { width: size, height: size })
  const c = canvas.getContext('2d', { willReadFrequently: true }) as Canvas2D | null
  if (!c) throw new Error('Canvas 2D is not available in this browser.')
  c.imageSmoothingEnabled = true
  c.imageSmoothingQuality = 'high'
  ctx = c
  return c
}

/**
 * Fetch as the page does. Firefox content scripts expose the page's own
 * `content.fetch`; a plain `fetch` there would carry the extension's
 * origin, which Google's image servers do not allow.
 */
function pageFetch(): typeof fetch {
  const f = (globalThis as { content?: { fetch?: typeof fetch } }).content?.fetch
  return typeof f === 'function' ? f : fetch
}

/** Fetch one thumbnail from Google, hash it, and forget the pixels. */
export async function hashThumbnail(url: string, signal: AbortSignal): Promise<Uint8Array | null> {
  if (!isGoogleImageUrl(url)) return null
  const res = await pageFetch()(sizedThumbUrl(url), { credentials: 'include', cache: 'force-cache', signal })
  if (!res.ok) return null
  const bitmap = await createImageBitmap(await res.blob())
  try {
    const c = context()
    const size = HASH_RESOLUTION
    c.clearRect(0, 0, size, size)
    c.drawImage(bitmap, 0, 0, size, size)
    return perceptualHash(rgbaToGray(c.getImageData(0, 0, size, size).data))
  } finally {
    bitmap.close()
  }
}
