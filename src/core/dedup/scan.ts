/**
 * Scan the current Google Photos view for duplicate candidates.
 *
 * Scrolls the view from the top (never clicking anything), reads each
 * tile's id, label and thumbnail address, and hashes thumbnails in the
 * background while scrolling continues. Every DOM and network touch goes
 * through `ScanDeps`, so the whole loop runs in tests on a scripted fake.
 *
 * Bounded and in the person's control: fixed-concurrency hashing, a
 * settle budget per scroll step, end-of-view detection, progress after
 * every step, and an AbortSignal that stops scrolling and hashing.
 */
import type { ScrollTarget } from '../dom-adapter'
import { pack } from './phash'
import type { DupItem } from './group'

export interface GridTile {
  id: string
  label: string | null
  thumbUrl: string
}

export interface ScanDeps {
  /** Tiles currently rendered in the view. */
  harvest(): GridTile[]
  findScrollTarget(): ScrollTarget | null
  /** Fetch and hash one thumbnail; null when it cannot be read. */
  hashThumb(url: string, signal: AbortSignal): Promise<Uint8Array | null>
  sleep(ms: number): Promise<void>
}

export interface ScannedItem extends DupItem {
  label: string | null
  thumbUrl: string
  /** Position in the view, top first. */
  order: number
}

export interface ScanProgress {
  phase: 'scanning' | 'hashing' | 'done' | 'cancelled'
  found: number
  hashed: number
  failed: number
}

export interface ScanOptions {
  signal?: AbortSignal
  onProgress?: (p: ScanProgress) => void
  /** Parallel thumbnail fetches. Default 6. */
  concurrency?: number
  /** Max wait for new tiles after a scroll step. Default 1500 ms. */
  scrollSettleMs?: number
  /** Poll interval while settling. Default 150 ms. */
  pollMs?: number
  /** Steps without new tiles or scroll movement before the end. Default 3. */
  endOfListAttempts?: number
}

export interface ScanResult {
  items: ScannedItem[]
  found: number
  failed: number
  cancelled: boolean
}

/**
 * Read the capture time from a tile label such as
 * "Photo - Landscape - Mar 3, 2024, 10:22:13 AM". Returns null when no
 * part of the label parses as a date (other locales often do not).
 */
export function parseLabelDate(label: string | null | undefined): number | null {
  if (!label) return null
  const parts = label.replace(/[  ]/g, ' ').split(/\s[-–—]\s/)
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i].trim()
    if (!/\d{4}/.test(part)) continue
    const t = Date.parse(part)
    if (Number.isFinite(t)) return t
  }
  return null
}

export async function scanView(deps: ScanDeps, opts: ScanOptions = {}): Promise<ScanResult> {
  const signal = opts.signal ?? new AbortController().signal
  const concurrency = Math.max(1, opts.concurrency ?? 6)
  const settleMs = opts.scrollSettleMs ?? 1500
  const pollMs = opts.pollMs ?? 150
  const endAttempts = opts.endOfListAttempts ?? 3

  const seen = new Map<string, { tile: GridTile; order: number }>()
  const queue: string[] = []
  let head = 0
  const hashes = new Map<string, Uint8Array>()
  let failed = 0
  let scanning = true

  const progress = (phase: ScanProgress['phase']): void =>
    opts.onProgress?.({ phase, found: seen.size, hashed: hashes.size, failed })

  const harvest = (): number => {
    let added = 0
    for (const tile of deps.harvest()) {
      if (seen.has(tile.id)) continue
      seen.set(tile.id, { tile, order: seen.size })
      queue.push(tile.id)
      added++
    }
    if (added > 0) wake()
    return added
  }

  // Hashing workers: pull ids off the queue while the scroll continues.
  let wakeWaiters: (() => void)[] = []
  const wake = (): void => { const w = wakeWaiters; wakeWaiters = []; w.forEach((f) => f()) }
  const waitForWork = (): Promise<void> => new Promise((resolve) => wakeWaiters.push(resolve))
  signal.addEventListener('abort', wake, { once: true })

  const worker = async (): Promise<void> => {
    while (!signal.aborted) {
      const id = head < queue.length ? queue[head++] : undefined
      if (id === undefined) {
        if (!scanning) return
        await waitForWork()
        continue
      }
      const entry = seen.get(id)
      if (!entry) continue
      let hash: Uint8Array | null = null
      try {
        hash = await deps.hashThumb(entry.tile.thumbUrl, signal)
      } catch {
        hash = null
      }
      if (signal.aborted) return
      if (hash) hashes.set(id, hash)
      else failed++
      progress(scanning ? 'scanning' : 'hashing')
    }
  }
  const workers = Array.from({ length: concurrency }, () => worker())

  try {
    const target = deps.findScrollTarget()
    if (target) {
      target.scrollTo({ top: 0, left: 0, behavior: 'auto' })
      await deps.sleep(pollMs)
    }
    harvest()
    progress('scanning')

    let idle = 0
    while (!signal.aborted && target) {
      const beforeTop = target.scrollTop
      const beforeHeight = target.scrollHeight
      target.scrollBy({ top: Math.max(200, Math.floor((target.clientHeight || 800) * 0.9)), left: 0, behavior: 'auto' })

      let gained = 0
      let quietPolls = 0
      for (let waited = 0; waited < settleMs && !signal.aborted; waited += pollMs) {
        await deps.sleep(pollMs)
        const added = harvest()
        gained += added
        // New tiles arrived and then stopped arriving: move on early.
        quietPolls = added > 0 ? 0 : quietPolls + 1
        if (gained > 0 && quietPolls >= 2) break
      }
      progress('scanning')

      const moved = target.scrollTop > beforeTop || target.scrollHeight > beforeHeight
      const atBottom = target.scrollTop + target.clientHeight + 4 >= target.scrollHeight
      if (gained === 0 && (!moved || atBottom)) {
        idle++
        if (idle >= endAttempts) break
      } else {
        idle = 0
      }
    }
  } finally {
    scanning = false
    wake()
  }

  if (!signal.aborted) progress('hashing')
  await Promise.all(workers)

  const items: ScannedItem[] = []
  for (const [id, { tile, order }] of seen) {
    const hash = hashes.get(id)
    if (!hash) continue
    items.push({
      id,
      hash: pack(hash),
      label: tile.label,
      thumbUrl: tile.thumbUrl,
      order,
      takenAt: parseLabelDate(tile.label),
    })
  }
  const cancelled = signal.aborted
  opts.onProgress?.({ phase: cancelled ? 'cancelled' : 'done', found: seen.size, hashed: hashes.size, failed })
  return { items, found: seen.size, failed, cancelled }
}
