/**
 * Pro "saved cleanup presets": named filter setups the user re-applies.
 *
 * A preset only remembers the filter controls (type, date mode, dates) and,
 * optionally, the Google Photos view the user was on. Applying a preset only
 * hands the values back so the surface can fill its controls: it never starts
 * a run, never navigates, and never schedules anything. The person still
 * starts the run, the dry run still works, and the consent acknowledgement is
 * still required (docs/vision.md: not an unattended scheduler).
 *
 * The filter itself stays owned by photo-filter.ts: a preset is valid only if
 * `buildFilterFromControls` accepts its controls. Storage is injected
 * ({@link PresetStore}): chrome.storage.local in the extension
 * (src/extension/api.ts), localStorage for the userscript.
 */
import { buildFilterFromControls } from './photo-filter'
import { isSupportedPhotosUrl } from './surface'

export const PRESETS_KEY = 'gpdt_presets_v1'
export const MAX_PRESETS = 20
export const MAX_PRESET_NAME = 40

export const PRESETS_PRO_ERROR = 'Saved presets need Pro.'

/** The filter controls a preset remembers (same inputs as buildFilterFromControls). */
export interface PresetControls {
  type: string
  dateMode: string
  dateA: string
  dateB: string
}

export interface CleanupPreset extends PresetControls {
  id: string
  name: string
  /** Optional note of the Photos view (origin + path only) the preset was saved on. */
  viewUrl?: string
}

export type PresetFailure = 'pro-required' | 'invalid-name' | 'invalid-controls' | 'full' | 'not-found' | 'storage'

export type PresetResult<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; reason: PresetFailure; error: string }

export interface PresetStore {
  /** Raw stored value (unvalidated); null/undefined when nothing is stored or unreadable. */
  read(): Promise<unknown>
  write(presets: CleanupPreset[]): Promise<boolean>
}

const FAILURE_TEXT: Record<PresetFailure, string> = {
  'pro-required': PRESETS_PRO_ERROR,
  'invalid-name': `Give the preset a name (up to ${MAX_PRESET_NAME} characters).`,
  'invalid-controls': 'This filter setup is not valid.',
  full: `You can save up to ${MAX_PRESETS} presets. Delete one first.`,
  'not-found': 'That preset no longer exists.',
  storage: 'Could not save presets on this device.',
}

const fail = (reason: PresetFailure, error?: string): { ok: false; reason: PresetFailure; error: string } =>
  ({ ok: false, reason, error: error ?? FAILURE_TEXT[reason] })

export function cleanPresetName(name: unknown): string | null {
  if (typeof name !== 'string') return null
  const n = name.replace(/\s+/g, ' ').trim()
  return n.length > 0 && n.length <= MAX_PRESET_NAME ? n : null
}

/** Origin + path of a supported Photos URL (no query or hash); null otherwise. */
export function normalizeViewUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || !isSupportedPhotosUrl(raw)) return null
  const u = new URL(raw)
  return `${u.origin}${u.pathname}`
}

/** Normalize controls so an unused date never lingers; null when the filter would be invalid. */
function normalizeControls(c: PresetControls): PresetControls | null {
  const built = buildFilterFromControls(c.type, c.dateMode, c.dateA, c.dateB)
  if (!built.ok) return null
  const f = built.filter
  const type = f.kind === 'type' ? f.type : f.kind === 'date' && f.type ? f.type : 'all'
  if (f.kind === 'date') {
    return f.range.mode === 'between'
      ? { type, dateMode: 'between', dateA: f.range.from, dateB: f.range.to }
      : { type, dateMode: f.range.mode, dateA: f.range.date, dateB: '' }
  }
  return { type, dateMode: 'off', dateA: '', dateB: '' }
}

/** Keep only well-formed presets (valid id, name, controls, view); drop the rest, dedupe ids, cap. */
export function sanitizePresets(raw: unknown): CleanupPreset[] {
  if (!Array.isArray(raw)) return []
  const out: CleanupPreset[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (out.length >= MAX_PRESETS) break
    if (typeof item !== 'object' || item === null) continue
    const o = item as Record<string, unknown>
    const name = cleanPresetName(o.name)
    if (typeof o.id !== 'string' || o.id.length === 0 || o.id.length > 64 || seen.has(o.id) || !name) continue
    if (![o.type, o.dateMode, o.dateA, o.dateB].every(v => typeof v === 'string')) continue
    const controls = normalizeControls({
      type: o.type as string, dateMode: o.dateMode as string, dateA: o.dateA as string, dateB: o.dateB as string,
    })
    if (!controls) continue
    const viewUrl = normalizeViewUrl(o.viewUrl)
    seen.add(o.id)
    out.push({ id: o.id, name, ...controls, ...(viewUrl ? { viewUrl } : {}) })
  }
  return out
}

let idCounter = 0
function newId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  idCounter += 1
  return `p${Date.now().toString(36)}${idCounter}`
}

/**
 * The hint text target: the saved view when it differs from the page the user
 * is on now, else null. Display only; nothing ever navigates to it.
 */
export function presetViewHint(preset: CleanupPreset, currentUrl: string | null | undefined): string | null {
  if (!preset.viewUrl) return null
  return normalizeViewUrl(currentUrl) === preset.viewUrl ? null : preset.viewUrl
}

export interface PresetManager {
  /** Saved presets (always empty for a free user). */
  list(): Promise<CleanupPreset[]>
  save(name: string, controls: PresetControls, viewUrl?: string | null): Promise<PresetResult<{ preset: CleanupPreset }>>
  /** Returns the controls to fill in. Starts nothing, navigates nowhere. */
  apply(id: string): Promise<PresetResult<{ preset: CleanupPreset }>>
  rename(id: string, name: string): Promise<PresetResult>
  remove(id: string): Promise<PresetResult>
}

export function createPresetManager(store: PresetStore, isPro: () => boolean | Promise<boolean>): PresetManager {
  const load = async (): Promise<CleanupPreset[]> => {
    try {
      return sanitizePresets(await store.read())
    } catch {
      return []
    }
  }
  const persist = async (list: CleanupPreset[]): Promise<boolean> => {
    try {
      return await store.write(list)
    } catch {
      return false
    }
  }
  const mutate = async (
    id: string,
    change: (list: CleanupPreset[], index: number) => CleanupPreset[],
  ): Promise<PresetResult> => {
    if (!(await isPro())) return fail('pro-required')
    const list = await load()
    const index = list.findIndex(p => p.id === id)
    if (index < 0) return fail('not-found')
    return (await persist(change(list, index))) ? { ok: true } : fail('storage')
  }

  return {
    async list() {
      return (await isPro()) ? load() : []
    },
    async save(name, controls, viewUrl) {
      if (!(await isPro())) return fail('pro-required')
      const clean = cleanPresetName(name)
      if (!clean) return fail('invalid-name')
      const built = buildFilterFromControls(controls.type, controls.dateMode, controls.dateA, controls.dateB)
      if (!built.ok) return fail('invalid-controls', built.error)
      const normalized = normalizeControls(controls)
      if (!normalized) return fail('invalid-controls')
      const list = await load()
      if (list.length >= MAX_PRESETS) return fail('full')
      const view = normalizeViewUrl(viewUrl)
      const preset: CleanupPreset = { id: newId(), name: clean, ...normalized, ...(view ? { viewUrl: view } : {}) }
      return (await persist([...list, preset])) ? { ok: true, preset } : fail('storage')
    },
    async apply(id) {
      if (!(await isPro())) return fail('pro-required')
      const preset = (await load()).find(p => p.id === id)
      return preset ? { ok: true, preset } : fail('not-found')
    },
    async rename(id, name) {
      const clean = cleanPresetName(name)
      if (!clean) return (await isPro()) ? fail('invalid-name') : fail('pro-required')
      return mutate(id, (list, i) => list.map((p, j) => (j === i ? { ...p, name: clean } : p)))
    },
    async remove(id) {
      return mutate(id, (list, i) => list.filter((_, j) => j !== i))
    },
  }
}

/** Userscript / in-page store: localStorage. Unreadable or corrupt data reads as empty. */
export function createLocalStoragePresetStore(key = PRESETS_KEY): PresetStore {
  return {
    async read() {
      try {
        const raw = window.localStorage.getItem(key)
        return raw ? JSON.parse(raw) : null
      } catch {
        return null
      }
    },
    async write(presets) {
      try {
        window.localStorage.setItem(key, JSON.stringify(presets))
        return true
      } catch {
        return false
      }
    },
  }
}
