import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { createWriteStream, mkdtempSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import archiver from 'archiver'

const script = fileURLToPath(new URL('../scripts/zip-content-digest.sh', import.meta.url))
const dir = mkdtempSync(join(tmpdir(), 'zip-digest-'))

async function makeZip(name: string, files: Record<string, string>, date: Date): Promise<string> {
  const path = join(dir, name)
  const out = createWriteStream(path)
  const archive = archiver('zip', { zlib: { level: 9 } })
  const done = new Promise<void>((resolve, reject) => { out.on('close', () => resolve()); archive.on('error', reject) })
  archive.pipe(out)
  for (const [n, body] of Object.entries(files)) archive.append(body, { name: n, date })
  await archive.finalize()
  await done
  return path
}
const digest = (zip: string) => execFileSync(script, [zip], { encoding: 'utf8' }).trim()
const sha = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex')

describe('zip-content-digest.sh', () => {
  const files = { 'manifest.json': '{"version":"3.6.1"}', 'popup.html': '<a href="x">', '_locales/en/messages.json': '{}' }
  it('is equal for the same files zipped at different times, although the bytes differ', async () => {
    const a = await makeZip('a.zip', files, new Date('2026-10-03T13:35:00Z'))
    const b = await makeZip('b.zip', { 'popup.html': files['popup.html'], '_locales/en/messages.json': '{}', 'manifest.json': files['manifest.json'] }, new Date('2026-10-04T09:00:00Z'))
    expect(sha(a)).not.toBe(sha(b))
    expect(digest(a)).toMatch(/^[0-9a-f]{64}$/)
    expect(digest(a)).toBe(digest(b))
  })
  it('changes when one file changes', async () => {
    const a = await makeZip('c.zip', files, new Date('2026-10-03T13:35:00Z'))
    const b = await makeZip('d.zip', { ...files, 'popup.html': '<a href="y">' }, new Date('2026-10-03T13:35:00Z'))
    expect(digest(a)).not.toBe(digest(b))
  })
})
