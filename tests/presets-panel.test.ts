// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mountPanel } from '../src/ui/panel/panel'
import { PRESETS_KEY } from '../src/core/presets'
import type { PageRunner } from '../src/core/page-runner'

const flush = async (): Promise<void> => { for (let i = 0; i < 10; i++) await Promise.resolve() }

function makeRunner(pro: boolean) {
  const start = vi.fn()
  const runner = {
    isPro: async () => pro,
    getStatus: () => ({ running: false, paused: false, progress: null }),
    getSummary: () => null,
    getLicenseToken: () => null,
    onUpdate: () => () => undefined,
    onRunSettled: () => () => undefined,
    start,
  } as unknown as PageRunner
  return { runner, start }
}

const click = async (root: Element, id: string): Promise<void> => {
  root.querySelector<HTMLElement>(`#${id}`)!.click()
  await flush()
}

function memoryLocalStorage(): Storage {
  const m = new Map<string, string>()
  return {
    get length() { return m.size },
    clear: () => m.clear(),
    getItem: (k: string) => m.get(k) ?? null,
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => { m.delete(k) },
    setItem: (k: string, v: string) => { m.set(k, String(v)) },
  }
}

describe('userscript panel presets', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', { value: memoryLocalStorage(), configurable: true })
    document.body.innerHTML = ''
    document.head.innerHTML = ''
    window.localStorage.clear()
  })

  it('Pro: save, apply fills controls and never starts a run, rename, delete', async () => {
    const { runner, start } = makeRunner(true)
    mountPanel(document.body, runner)
    await flush()
    const root = document.getElementById('gpdt-panel-root')!
    const q = <T extends HTMLElement>(id: string): T => root.querySelector<T>(`#${id}`)!

    q<HTMLSelectElement>('gpdt-filter').value = 'video'
    q<HTMLSelectElement>('gpdt-date-mode').value = 'after'
    q<HTMLInputElement>('gpdt-date-a').value = '2024-01-01'
    q<HTMLInputElement>('gpdt-preset-name').value = 'Recent videos'
    await click(root, 'gpdt-preset-save')
    expect(JSON.parse(window.localStorage.getItem(PRESETS_KEY)!)).toHaveLength(1)

    q<HTMLSelectElement>('gpdt-filter').value = 'all'
    q<HTMLSelectElement>('gpdt-date-mode').value = 'off'
    q<HTMLInputElement>('gpdt-date-a').value = ''
    await click(root, 'gpdt-preset-apply')
    expect(q<HTMLSelectElement>('gpdt-filter').value).toBe('video')
    expect(q<HTMLSelectElement>('gpdt-date-mode').value).toBe('after')
    expect(q<HTMLInputElement>('gpdt-date-a').value).toBe('2024-01-01')
    expect(start).not.toHaveBeenCalled()
    expect(q('gpdt-consent').style.display).toBe('none')

    q<HTMLInputElement>('gpdt-preset-name').value = 'Videos'
    await click(root, 'gpdt-preset-rename')
    expect(JSON.parse(window.localStorage.getItem(PRESETS_KEY)!)[0].name).toBe('Videos')

    await click(root, 'gpdt-preset-delete')
    expect(JSON.parse(window.localStorage.getItem(PRESETS_KEY)!)).toEqual([])
    expect(start).not.toHaveBeenCalled()
  })

  it('free: the row is disabled with a Pro link and nothing is saved', async () => {
    const { runner, start } = makeRunner(false)
    mountPanel(document.body, runner)
    await flush()
    const root = document.getElementById('gpdt-panel-root')!
    for (const id of ['gpdt-preset', 'gpdt-preset-save', 'gpdt-preset-apply', 'gpdt-preset-name']) {
      expect(root.querySelector<HTMLInputElement>(`#${id}`)!.disabled, id).toBe(true)
    }
    const link = root.querySelector<HTMLAnchorElement>('#gpdt-preset-pro-link')!
    expect(new URL(link.href).searchParams.get('utm_medium')).toBe('presets')
    expect(root.querySelector<HTMLElement>('#gpdt-preset-pro')!.style.display).toBe('flex')
    await click(root, 'gpdt-preset-save')
    expect(window.localStorage.getItem(PRESETS_KEY)).toBeNull()
    expect(start).not.toHaveBeenCalled()
  })

  it('corrupt stored data is ignored', async () => {
    window.localStorage.setItem(PRESETS_KEY, '{not json')
    const { runner } = makeRunner(true)
    mountPanel(document.body, runner)
    await flush()
    const root = document.getElementById('gpdt-panel-root')!
    expect(root.querySelector<HTMLSelectElement>('#gpdt-preset')!.disabled).toBe(true)
  })
})
