import { describe, it, expect } from 'vitest'
import {
  MAX_PRESETS,
  createPresetManager,
  presetViewHint,
  sanitizePresets,
  type CleanupPreset,
  type PresetControls,
  type PresetStore,
} from '../src/core/presets'
import { buildFilterFromControls } from '../src/core/photo-filter'

const memoryStore = (initial: unknown = null): PresetStore & { value: unknown } => {
  const s = {
    value: initial,
    async read() { return s.value },
    async write(p: CleanupPreset[]) { s.value = JSON.parse(JSON.stringify(p)); return true },
  }
  return s
}

const oldScreenshots: PresetControls = { type: 'screenshot', dateMode: 'before', dateA: '2025-10-01', dateB: '' }
const ALBUM = 'https://photos.google.com/album/AF1Qip?foo=1#x'

describe('saved presets (Pro)', () => {
  it('saves, applies, renames and deletes', async () => {
    const m = createPresetManager(memoryStore(), () => true)
    const saved = await m.save('  Old   screenshots ', oldScreenshots, ALBUM)
    expect(saved.ok).toBe(true)
    if (!saved.ok) return
    expect(saved.preset.name).toBe('Old screenshots')
    expect(saved.preset.viewUrl).toBe('https://photos.google.com/album/AF1Qip')

    const applied = await m.apply(saved.preset.id)
    expect(applied.ok && applied.preset).toMatchObject(oldScreenshots)
    // the applied controls build the same filter the owner builds directly
    if (applied.ok) {
      const { type, dateMode, dateA, dateB } = applied.preset
      expect(buildFilterFromControls(type, dateMode, dateA, dateB))
        .toEqual(buildFilterFromControls('screenshot', 'before', '2025-10-01', ''))
    }

    expect((await m.rename(saved.preset.id, 'Screens')).ok).toBe(true)
    expect((await m.list())[0].name).toBe('Screens')

    expect((await m.remove(saved.preset.id)).ok).toBe(true)
    expect(await m.list()).toEqual([])
    expect((await m.apply(saved.preset.id)).ok).toBe(false)
  })

  it('caps at 20 presets', async () => {
    const m = createPresetManager(memoryStore(), () => true)
    for (let i = 0; i < MAX_PRESETS; i++) {
      expect((await m.save(`p${i}`, { type: 'video', dateMode: 'off', dateA: '', dateB: '' })).ok).toBe(true)
    }
    const over = await m.save('one too many', oldScreenshots)
    expect(over).toMatchObject({ ok: false, reason: 'full' })
    expect(await m.list()).toHaveLength(MAX_PRESETS)
  })

  it('refuses an empty name and an invalid filter setup', async () => {
    const m = createPresetManager(memoryStore(), () => true)
    expect(await m.save('   ', oldScreenshots)).toMatchObject({ ok: false, reason: 'invalid-name' })
    expect(await m.save('x'.repeat(41), oldScreenshots)).toMatchObject({ ok: false, reason: 'invalid-name' })
    expect(await m.save('bad', { type: 'all', dateMode: 'between', dateA: '2025-02-01', dateB: '2025-01-01' }))
      .toMatchObject({ ok: false, reason: 'invalid-controls' })
    expect(await m.list()).toEqual([])
  })

  it('ignores corrupt and unknown preset data safely', async () => {
    const good = { id: 'a', name: 'Good', type: 'video', dateMode: 'off', dateA: '', dateB: '' }
    const raw = [
      good,
      null, 42, 'x', [],
      { ...good, id: 'b', type: 'video', dateMode: 'bogus' },
      { ...good, id: 'c', dateMode: 'before', dateA: 'not-a-date' },
      { ...good, id: 'd', name: '' },
      { ...good, id: 7 },
      { ...good },                               // duplicate id
      { ...good, id: 'e', viewUrl: 'https://evil.example/x' },
      { id: 'f', name: 'No controls' },
    ]
    const clean = sanitizePresets(raw)
    expect(clean.map(p => p.id)).toEqual(['a', 'e'])
    expect(clean[1].viewUrl).toBeUndefined()
    expect(sanitizePresets('garbage')).toEqual([])
    expect(sanitizePresets({ presets: [] })).toEqual([])

    const throwing: PresetStore = { read: async () => { throw new Error('boom') }, write: async () => false }
    const m = createPresetManager(throwing, () => true)
    expect(await m.list()).toEqual([])
    expect(await m.save('x', oldScreenshots)).toMatchObject({ ok: false, reason: 'storage' })
  })

  it('free users can not save, apply, rename or delete', async () => {
    const stored: CleanupPreset[] = [{ id: 'a', name: 'Good', type: 'video', dateMode: 'off', dateA: '', dateB: '' }]
    const store = memoryStore(stored)
    const m = createPresetManager(store, () => false)
    expect(await m.list()).toEqual([])
    expect(await m.save('n', oldScreenshots)).toMatchObject({ ok: false, reason: 'pro-required' })
    expect(await m.apply('a')).toMatchObject({ ok: false, reason: 'pro-required' })
    expect(await m.rename('a', 'z')).toMatchObject({ ok: false, reason: 'pro-required' })
    expect(await m.remove('a')).toMatchObject({ ok: false, reason: 'pro-required' })
    expect(store.value).toEqual(stored)
  })

  it('shows a view hint only when the saved view differs from the current page', () => {
    const p: CleanupPreset = { id: 'a', name: 'n', ...oldScreenshots, viewUrl: 'https://photos.google.com/album/AF1Qip' }
    expect(presetViewHint(p, 'https://photos.google.com/album/AF1Qip?x=1')).toBeNull()
    expect(presetViewHint(p, 'https://photos.google.com/')).toBe('https://photos.google.com/album/AF1Qip')
    expect(presetViewHint({ ...p, viewUrl: undefined }, 'https://photos.google.com/')).toBeNull()
  })
})
