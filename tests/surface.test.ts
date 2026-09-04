import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  SUPPORTED_HOST,
  SUPPORTED_ORIGIN,
  SUPPORTED_MATCH_PATTERN,
  isSupportedPhotosUrl,
  identifyPhotosView,
  admitSurface,
  activateLocalSurface,
  describePhotosView,
} from '../src/core/surface'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p: string): string => readFileSync(resolve(root, p), 'utf-8')

describe('isSupportedPhotosUrl', () => {
  it('admits exact https://photos.google.com URLs', () => {
    expect(isSupportedPhotosUrl('https://photos.google.com/')).toBe(true)
    expect(isSupportedPhotosUrl('https://photos.google.com')).toBe(true)
    expect(isSupportedPhotosUrl('https://photos.google.com/u/0/album/abc')).toBe(true)
    expect(isSupportedPhotosUrl('https://photos.google.com/search/foo?authuser=1')).toBe(true)
    expect(isSupportedPhotosUrl('https://PHOTOS.GOOGLE.COM/u/0/')).toBe(true)
    expect(isSupportedPhotosUrl('https://photos.google.com:443/')).toBe(true)
  })

  it('rejects missing, empty, and unparseable input', () => {
    expect(isSupportedPhotosUrl(undefined)).toBe(false)
    expect(isSupportedPhotosUrl(null)).toBe(false)
    expect(isSupportedPhotosUrl('')).toBe(false)
    expect(isSupportedPhotosUrl('photos.google.com')).toBe(false)
    expect(isSupportedPhotosUrl('/u/0/')).toBe(false)
    expect(isSupportedPhotosUrl('not a url')).toBe(false)
  })

  it('rejects lookalike hosts and weaker schemes — the substring bug', () => {
    expect(isSupportedPhotosUrl('https://photos.google.com.evil.com/')).toBe(false)
    expect(isSupportedPhotosUrl('https://evil.com/photos.google.com')).toBe(false)
    expect(isSupportedPhotosUrl('https://evil.com/?q=photos.google.com')).toBe(false)
    expect(isSupportedPhotosUrl('https://notphotos.google.com/')).toBe(false)
    expect(isSupportedPhotosUrl('https://www.photos.google.com/')).toBe(false)
    expect(isSupportedPhotosUrl('https://photos.google.com./')).toBe(false)
    expect(isSupportedPhotosUrl('http://photos.google.com/')).toBe(false)
    expect(isSupportedPhotosUrl('https://photos.google.com:8443/')).toBe(false)
    expect(isSupportedPhotosUrl('https://user:pass@photos.google.com/')).toBe(false)
    expect(isSupportedPhotosUrl('ftp://photos.google.com/')).toBe(false)
  })
})

describe('identifyPhotosView', () => {
  it('returns null on an unsupported URL', () => {
    expect(identifyPhotosView('https://example.com/')).toBeNull()
    expect(identifyPhotosView(undefined)).toBeNull()
  })

  it('treats / and /u/<n>/ as the library', () => {
    expect(identifyPhotosView('https://photos.google.com/')).toEqual({
      kind: 'library',
      path: '/',
    })
    expect(identifyPhotosView('https://photos.google.com/u/0')).toEqual({
      kind: 'library',
      path: '/',
      account: '0',
    })
    expect(identifyPhotosView('https://photos.google.com/u/1/')).toEqual({
      kind: 'library',
      path: '/',
      account: '1',
    })
  })

  it('classifies known current-view families, including /u/<n>/ prefixes', () => {
    expect(identifyPhotosView('https://photos.google.com/albums')?.kind).toBe('albums')
    expect(identifyPhotosView('https://photos.google.com/u/0/album/AF1QipXxx')).toEqual({
      kind: 'album',
      path: '/album/AF1QipXxx',
      account: '0',
      target: 'AF1QipXxx',
    })
    expect(identifyPhotosView('https://photos.google.com/search/hello%20world')?.target).toBe('hello world')
    expect(identifyPhotosView('https://photos.google.com/u/0/trash')?.kind).toBe('trash')
    expect(identifyPhotosView('https://photos.google.com/u/0/trash/item')?.kind).toBe('trash')
    expect(identifyPhotosView('https://photos.google.com/photo/abc')?.kind).toBe('photo')
    expect(identifyPhotosView('https://photos.google.com/memory/xyz')?.kind).toBe('memory')
    expect(identifyPhotosView('https://photos.google.com/share/tok')?.kind).toBe('share')
    expect(identifyPhotosView('https://photos.google.com/sharing/tok')?.kind).toBe('share')
    expect(identifyPhotosView('https://photos.google.com/places')?.kind).toBe('places')
    expect(identifyPhotosView('https://photos.google.com/collections')?.kind).toBe('collections')
  })

  it('does not treat a path that merely contains "trash" as trash', () => {
    const view = identifyPhotosView('https://photos.google.com/trashbin')
    expect(view?.kind).toBe('other')
    expect(view?.path).toBe('/trashbin')
  })
})

describe('admitSurface / activateLocalSurface', () => {
  it('admits a supported view and refuses anything else', () => {
    const ok = admitSurface('https://photos.google.com/u/0/search/cats')
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(ok.view.kind).toBe('search')
    expect(admitSurface('https://example.com/')).toEqual({ ok: false, reason: 'unsupported-url' })
  })

  it('mounts only on an admitted surface', () => {
    const mount = vi.fn()
    expect(activateLocalSurface('https://evil.com/?q=photos.google.com', mount)).toBe('refused')
    expect(mount).not.toHaveBeenCalled()
    expect(activateLocalSurface('https://photos.google.com/u/0/', mount)).toBe('activated')
    expect(mount).toHaveBeenCalledTimes(1)
  })
})

describe('describePhotosView', () => {
  it('names the current view as the action scope', () => {
    expect(describePhotosView({ kind: 'library', path: '/' })).toBe('Library')
    expect(describePhotosView({
      kind: 'album',
      path: '/album/AF1',
      target: 'AF1',
    })).toBe('Album · AF1')
    expect(describePhotosView({ kind: 'other', path: '/utilities' })).toBe('/utilities')
  })
})

describe('GPDT-ENTER constants stay the single host writer', () => {
  it('names the exact photos.google.com origin', () => {
    expect(SUPPORTED_HOST).toBe('photos.google.com')
    expect(SUPPORTED_ORIGIN).toBe('https://photos.google.com')
    expect(SUPPORTED_MATCH_PATTERN).toBe('https://photos.google.com/*')
  })

  it('manifest host and content-script matches equal the authority', () => {
    const manifest = JSON.parse(read('src/extension/manifest.json')) as {
      host_permissions: string[]
      content_scripts: Array<{ matches: string[] }>
    }
    expect(manifest.host_permissions).toEqual([SUPPORTED_MATCH_PATTERN])
    expect(manifest.content_scripts[0]?.matches).toEqual([SUPPORTED_MATCH_PATTERN])
  })

  it('source manifest version equals package version', () => {
    const manifest = JSON.parse(read('src/extension/manifest.json')) as {
      version: string
    }
    const pkg = JSON.parse(read('package.json')) as { version: string }
    expect(manifest.version).toBe(pkg.version)
  })
})
