/**
 * GPDT-ENTER — supported-surface admission.
 *
 * One authority for "are we on photos.google.com, and which current
 * view is the action scope?". Extension popup, content script,
 * userscript, and standalone all consult this module; they must not
 * invent a second host check (especially not a substring `includes`).
 *
 * A match here is not authority to delete. Dry-run is the click-free
 * preview of the admitted view; destructive work still needs consent.
 */
export const SUPPORTED_HOST = 'photos.google.com'
export const SUPPORTED_ORIGIN = 'https://photos.google.com'
export const SUPPORTED_MATCH_PATTERN = 'https://photos.google.com/*'

export type PhotosViewKind =
  | 'library'
  | 'albums'
  | 'album'
  | 'search'
  | 'trash'
  | 'photo'
  | 'memory'
  | 'share'
  | 'places'
  | 'collections'
  | 'other'

export interface PhotosView {
  kind: PhotosViewKind
  /** Path after an optional `/u/<n>` prefix; always starts with `/`. */
  path: string
  /** Google account index when the URL is `/u/<n>/…`. */
  account?: string
  /** Album id, search query, photo id, etc. when the path carries one. */
  target?: string
}

export type SurfaceAdmission =
  | { ok: true; view: PhotosView }
  | { ok: false; reason: 'unsupported-url' }

const USER_PREFIX = /^\/u\/(\d+)(?=\/|$)/

const KIND_BY_HEAD: Readonly<Record<string, PhotosViewKind>> = {
  albums: 'albums',
  album: 'album',
  search: 'search',
  trash: 'trash',
  photo: 'photo',
  memory: 'memory',
  share: 'share',
  sharing: 'share',
  places: 'places',
  collections: 'collections',
}

const TARGETABLE = new Set<PhotosViewKind>([
  'album',
  'search',
  'photo',
  'memory',
  'share',
])

const KIND_LABEL_EN: Readonly<Record<PhotosViewKind, string>> = {
  library: 'Library',
  albums: 'Albums',
  album: 'Album',
  search: 'Search',
  trash: 'Trash',
  photo: 'Photo',
  memory: 'Memory',
  share: 'Shared',
  places: 'Places',
  collections: 'Collections',
  other: 'This view',
}

/**
 * Exact https://photos.google.com admission. Rejects lookalike hosts,
 * non-https, credentials, and non-default ports. `undefined`/`null`/
 * empty input is unsupported (the popup sees that for tabs it cannot
 * read).
 */
export function isSupportedPhotosUrl(raw: string | null | undefined): boolean {
  if (typeof raw !== 'string' || raw.length === 0) return false
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  return (
    url.protocol === 'https:' &&
    url.hostname.toLowerCase() === SUPPORTED_HOST &&
    url.port === '' &&
    url.username === '' &&
    url.password === ''
  )
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

/**
 * Identify the current Google Photos view that will be the action
 * scope. Returns `null` when the URL is not a supported surface.
 */
export function identifyPhotosView(raw: string | null | undefined): PhotosView | null {
  if (!isSupportedPhotosUrl(raw)) return null
  const url = new URL(raw as string)
  let path = url.pathname
  let account: string | undefined
  const user = path.match(USER_PREFIX)
  if (user) {
    account = user[1]
    path = path.slice(user[0].length)
  }
  if (path === '' || path === '/') {
    return { kind: 'library', path: '/', account }
  }
  if (!path.startsWith('/')) path = `/${path}`
  const segments = path.slice(1).split('/').filter(Boolean)
  const head = segments[0] ?? ''
  const kind = KIND_BY_HEAD[head] ?? 'other'
  const target = TARGETABLE.has(kind) && segments[1] ? decodeSegment(segments[1]) : undefined
  return { kind, path, account, target }
}

export function admitSurface(raw: string | null | undefined): SurfaceAdmission {
  const view = identifyPhotosView(raw)
  if (!view) return { ok: false, reason: 'unsupported-url' }
  return { ok: true, view }
}

/**
 * Userscript / standalone mount gate. Does not mount off-host, so a
 * pasted inject script cannot attach a panel on an unrelated site.
 */
export function activateLocalSurface(href: string, mount: () => void): 'activated' | 'refused' {
  if (!admitSurface(href).ok) return 'refused'
  mount()
  return 'activated'
}

/** English label for the in-page panel (English-only by design). */
export function describePhotosView(view: PhotosView): string {
  if (view.kind === 'other') return view.path
  const kind = KIND_LABEL_EN[view.kind]
  return view.target ? `${kind} · ${view.target}` : kind
}
