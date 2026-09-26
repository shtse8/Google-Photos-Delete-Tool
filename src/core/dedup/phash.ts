/**
 * Perceptual hash (pHash) of a 32x32 grayscale image.
 *
 * Ported from SylphxAI/photo-dedup `crates/photo-dedup-core/src/dct.rs`
 * (DCT-II over 32x32, keep the top-left 8x8, one bit per coefficient
 * above the median of the AC magnitudes). The golden vectors in
 * tests/fixtures/photo-dedup-phash.json prove the port gives the same
 * bits. Pure TypeScript, no DOM: the browser side only has to supply
 * the 1024 gray pixels.
 */

export const HASH_RESOLUTION = 32
const HASH_SIZE = 8
const HASH_BITS = 64

/** A 64-bit hash as two unsigned 32-bit halves (bytes 0-3 and 4-7, little-endian). */
export interface Hash64 {
  lo: number
  hi: number
}

// DCT constants, stored as float32 exactly like the source crate.
const COEFFS = new Float32Array(HASH_RESOLUTION * HASH_SIZE)
const NORMS = new Float32Array(HASH_SIZE)
{
  const scale = Math.fround(Math.sqrt(2 / HASH_RESOLUTION))
  for (let u = 0; u < HASH_SIZE; u++) {
    for (let x = 0; x < HASH_RESOLUTION; x++) {
      COEFFS[u * HASH_RESOLUTION + x] = Math.cos(((2 * x + 1) * u * Math.PI) / (2 * HASH_RESOLUTION))
    }
    NORMS[u] = u === 0 ? scale / Math.SQRT2 : scale
  }
}

/**
 * Hash 1024 gray pixels (row-major, 0-255). Returns the 8 hash bytes;
 * bit `i` lives in byte `i >> 3` at position `i & 7`.
 */
export function perceptualHash(gray: ArrayLike<number>): Uint8Array {
  const size = HASH_RESOLUTION
  if (gray.length !== size * size) {
    throw new Error(`perceptualHash: expected ${size * size} pixels, got ${gray.length}`)
  }
  const out = new Float32Array(HASH_SIZE * HASH_SIZE)
  const temp = new Float32Array(HASH_SIZE)
  for (let y = 0; y < size; y++) {
    const row = y * size
    for (let u = 0; u < HASH_SIZE; u++) {
      let sum = 0
      const off = u * size
      for (let x = 0; x < size; x++) sum += gray[row + x] * COEFFS[off + x]
      temp[u] = NORMS[u] * sum
    }
    for (let v = 0; v < HASH_SIZE; v++) {
      const norm = NORMS[v]
      const coeff = COEFFS[v * size + y]
      const o = v * HASH_SIZE
      // Same operation order as the source crate, so float rounding matches.
      for (let u = 0; u < HASH_SIZE; u++) out[o + u] = out[o + u] + norm * temp[u] * coeff
    }
  }

  // Median of |AC| (every coefficient but the DC term), k = floor(63 / 2).
  const ac = Array.from(out.subarray(1), Math.abs).sort((a, b) => a - b)
  const median = ac[ac.length >> 1]

  const hash = new Uint8Array(HASH_BITS / 8)
  for (let i = 0; i < HASH_BITS; i++) {
    if (out[i] > median) hash[i >> 3] |= 1 << (i & 7)
  }
  return hash
}

/** RGBA (canvas ImageData order) → gray, ITU-R BT.601 weights. */
export function rgbaToGray(rgba: ArrayLike<number>): Uint8Array {
  const n = rgba.length >> 2
  const gray = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    const p = i << 2
    gray[i] = Math.round(0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2])
  }
  return gray
}

export function toHex(hash: Uint8Array): string {
  let s = ''
  for (const b of hash) s += b.toString(16).padStart(2, '0')
  return s
}

export function fromHex(hex: string): Uint8Array | null {
  if (hex.length !== 16 || !/^[0-9a-f]+$/i.test(hex)) return null
  const out = new Uint8Array(8)
  for (let i = 0; i < 8; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

export function pack(hash: Uint8Array): Hash64 {
  return {
    lo: (hash[0] | (hash[1] << 8) | (hash[2] << 16) | (hash[3] << 24)) >>> 0,
    hi: (hash[4] | (hash[5] << 8) | (hash[6] << 16) | (hash[7] << 24)) >>> 0,
  }
}

export function popcount32(n: number): number {
  n = n - ((n >>> 1) & 0x55555555)
  n = (n & 0x33333333) + ((n >>> 2) & 0x33333333)
  return (((n + (n >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24
}

export function hammingDistance(a: Hash64, b: Hash64): number {
  return popcount32((a.lo ^ b.lo) >>> 0) + popcount32((a.hi ^ b.hi) >>> 0)
}

/** 1 = identical hashes, 0 = every bit differs. */
export function similarityFromDistance(distance: number): number {
  return Math.max(0, 1 - distance / HASH_BITS)
}

/** Largest Hamming distance that still meets `threshold` similarity. */
export function maxDistanceFor(threshold: number): number {
  const t = Math.min(1, Math.max(0, threshold))
  return Math.floor((1 - t) * HASH_BITS + 1e-9)
}
