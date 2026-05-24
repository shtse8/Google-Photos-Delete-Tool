/**
 * Cross-platform zip script — replaces the Unix `zip` command in package.json.
 * Bundles dist/extension/* into google-photos-delete-tool.zip at the repo root.
 *
 * Works on Linux, macOS and Windows (no external `zip` binary required).
 */
import archiver from 'archiver'
import { createWriteStream, existsSync } from 'fs'
import { resolve } from 'path'

const root = resolve(import.meta.dir, '..')
const extensionDir = resolve(root, 'dist/extension')
const zipPath = resolve(root, 'google-photos-delete-tool.zip')

if (!existsSync(extensionDir)) {
  console.error(`[zip] dist/extension not found — run "bun run build" first`)
  process.exit(1)
}

const output = createWriteStream(zipPath)
const archive = archiver('zip', { zlib: { level: 9 } })

output.on('close', () => {
  const kb = (archive.pointer() / 1024).toFixed(1)
  console.log(`[zip] wrote ${zipPath} (${kb} KB)`)
})

archive.on('warning', (err) => {
  if (err.code === 'ENOENT') {
    console.warn('[zip] warning:', err)
  } else {
    throw err
  }
})
archive.on('error', (err) => {
  throw err
})

archive.pipe(output)
archive.directory(extensionDir, false)
await archive.finalize()
