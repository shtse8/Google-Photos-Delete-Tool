/**
 * Group near-duplicate items by perceptual-hash similarity.
 *
 * Grouping rules are ported from SylphxAI/photo-dedup
 * `crates/photo-dedup-core/src/duplicate_group.rs` (`group_duplicates`):
 * walk items in order; each item not yet grouped becomes a seed, and every
 * not-yet-grouped item within the threshold of that seed joins its group.
 * Members are ordered by similarity to the seed (highest first), and the
 * best item is picked by `selectBestItem`. The golden scenarios in
 * tests/fixtures/photo-dedup-duplicate-groups.json prove the parity.
 *
 * Speed: the source prefilters with four fixed 16-bit bands, which only
 * finds every pair when the allowed distance is 3 or less. Here the
 * threshold is adjustable, so the prefilter splits the 64 bits into
 * (maxDistance + 1) bands instead. Two hashes within `d` bits must agree
 * exactly on at least one of `d + 1` bands (pigeonhole), so the prefilter
 * never misses a pair, and every candidate is then checked exactly.
 *
 * The work yields to the page every few milliseconds so a large library
 * never freezes the tab, reports progress, and stops on an AbortSignal.
 */
import { hammingDistance, maxDistanceFor, similarityFromDistance, type Hash64 } from './phash'

export interface DupItem {
  /** Stable Google Photos item id (from the tile link). */
  id: string
  hash: Hash64
  /** Pixel size, when known. The Google Photos grid does not show it. */
  width?: number | null
  height?: number | null
  /** Capture time in ms, when it could be read from the tile label. */
  takenAt?: number | null
}

export interface DupGroup {
  /** Seed first, then the other members by similarity (highest first). */
  itemIds: string[]
  /** Similarity of each member to the seed (the seed itself is 1). */
  similarities: number[]
  bestItemId: string
  /** Mean similarity of the non-seed members to the seed. */
  averageSimilarity: number
}

export interface GroupOptions {
  /** Minimum similarity (0-1) to count as a duplicate. Default 0.95. */
  threshold?: number
  signal?: AbortSignal
  onProgress?: (done: number, total: number) => void
  /** Hand control back to the page. Default: a macrotask. */
  yieldToHost?: () => Promise<void>
  /** Milliseconds of work between yields. Default 12. */
  sliceMs?: number
  now?: () => number
}

/** Default similarity: the photo-dedup image-to-image threshold. */
export const DEFAULT_THRESHOLD = 0.95

function pixels(item: DupItem): number {
  return (item.width ?? 0) * (item.height ?? 0)
}

/**
 * Pick the item to keep: most pixels, then earliest capture time (unknown
 * sorts last), then the earliest in the list.
 */
export function selectBestItem<T extends DupItem>(items: readonly T[]): T | null {
  let best: T | null = null
  for (const item of items) {
    if (!best) { best = item; continue }
    const bp = pixels(best)
    const cp = pixels(item)
    if (cp > bp) { best = item; continue }
    if (cp < bp) continue
    const bd = best.takenAt ?? Number.POSITIVE_INFINITY
    const cd = item.takenAt ?? Number.POSITIVE_INFINITY
    if (cd < bd) best = item
  }
  return best
}

/** Extract bits [start, end) (end - start <= 32) of a 64-bit hash. */
function bits(hash: Hash64, start: number, end: number): number {
  let v = 0
  for (let i = end - 1; i >= start; i--) {
    const bit = i < 32 ? (hash.lo >>> i) & 1 : (hash.hi >>> (i - 32)) & 1
    v = v * 2 + bit
  }
  return v
}

const defaultYield = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

export class GroupingAborted extends Error {
  constructor() {
    super('Duplicate grouping was cancelled.')
    this.name = 'GroupingAborted'
  }
}

export async function groupDuplicates(items: readonly DupItem[], opts: GroupOptions = {}): Promise<DupGroup[]> {
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD
  const maxDistance = maxDistanceFor(threshold)
  const yieldToHost = opts.yieldToHost ?? defaultYield
  const sliceMs = opts.sliceMs ?? 12
  const now = opts.now ?? (() => Date.now())
  const n = items.length

  // Band index: (maxDistance + 1) contiguous bands over 64 bits; widths <= 32
  // except when maxDistance is 0, where the two halves are both required.
  const bandCount = Math.min(64, maxDistance + 1)
  const bounds: number[] = []
  for (let b = 0; b <= bandCount; b++) bounds.push(Math.floor((b * 64) / bandCount))
  const buckets: Map<string | number, number[]>[] = []
  for (let b = 0; b < bandCount; b++) {
    const map = new Map<string | number, number[]>()
    const start = bounds[b]
    const end = bounds[b + 1]
    for (let i = 0; i < n; i++) {
      const h = items[i].hash
      const key = end - start > 32 ? `${h.lo}:${h.hi}` : bits(h, start, end)
      let list = map.get(key)
      if (!list) { list = []; map.set(key, list) }
      list.push(i)
    }
    buckets.push(map)
  }

  const grouped = new Uint8Array(n)
  const stamp = new Int32Array(n).fill(-1)
  const groups: DupGroup[] = []
  let sliceStart = now()

  for (let i = 0; i < n; i++) {
    if ((i & 63) === 0) {
      if (opts.signal?.aborted) throw new GroupingAborted()
      if (now() - sliceStart >= sliceMs) {
        opts.onProgress?.(i, n)
        await yieldToHost()
        if (opts.signal?.aborted) throw new GroupingAborted()
        sliceStart = now()
      }
    }
    if (grouped[i]) continue
    const seed = items[i]

    // Only later items can still be free: an earlier free item within the
    // threshold would have taken this one into its own group already.
    const found: { index: number; similarity: number }[] = []
    for (let b = 0; b < bandCount; b++) {
      const start = bounds[b]
      const end = bounds[b + 1]
      const key = end - start > 32 ? `${seed.hash.lo}:${seed.hash.hi}` : bits(seed.hash, start, end)
      const list = buckets[b].get(key)
      if (!list) continue
      for (const j of list) {
        if (j <= i || grouped[j] || stamp[j] === i) continue
        stamp[j] = i
        const d = hammingDistance(seed.hash, items[j].hash)
        if (d <= maxDistance) found.push({ index: j, similarity: similarityFromDistance(d) })
      }
    }
    if (found.length === 0) continue

    found.sort((a, b) => b.similarity - a.similarity || a.index - b.index)
    grouped[i] = 1
    for (const f of found) grouped[f.index] = 1
    const members = [seed, ...found.map((f) => items[f.index])]
    const best = selectBestItem(members) ?? seed
    groups.push({
      itemIds: members.map((m) => m.id),
      similarities: [1, ...found.map((f) => f.similarity)],
      bestItemId: best.id,
      averageSimilarity: found.reduce((sum, f) => sum + f.similarity, 0) / found.length,
    })
  }
  opts.onProgress?.(n, n)
  return groups
}
