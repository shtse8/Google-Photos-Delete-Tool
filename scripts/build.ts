/**
 * Build script that runs separate Vite builds for each output target:
 * - Chrome extension (MV3, self-contained IIFE entries)
 * - Standalone inject script (console paste)
 * - Userscript (Tampermonkey/Violentmonkey with metadata header)
 * - Bookmarklet (minified javascript: URL)
 */
import { build } from 'vite'
import { resolve } from 'path'
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
  existsSync,
  renameSync,
  rmSync,
} from 'fs'

const root = resolve(import.meta.dir, '..')
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8'))

// ─── Chrome Extension ────────────────────────────────────────────

const extensionDir = resolve(root, 'dist/extension')

const extensionEntries = [
  { name: 'content', input: 'src/extension/content.ts' },
  { name: 'background', input: 'src/extension/background.ts' },
  { name: 'popup', input: 'src/extension/popup/popup.ts' },
]

// Wipe the extension output dir up-front rather than relying on the
// first Vite invocation to do it (which broke if anyone reordered the
// entries above).
rmSync(extensionDir, { recursive: true, force: true })
mkdirSync(extensionDir, { recursive: true })

for (let i = 0; i < extensionEntries.length; i++) {
  const entry = extensionEntries[i]
  console.log(`[extension] Building ${entry.name}...`)
  await build({
    configFile: false,
    root,
    build: {
      outDir: extensionDir,
      emptyOutDir: false, // we already wiped it; reuse the same dir across entries
      target: 'es2022',
      sourcemap: false, // shipped artifact — no maps
      lib: {
        entry: resolve(root, entry.input),
        formats: ['iife'],
        name: `__gpdt_${entry.name}`,
        fileName: () => `${entry.name}.js`,
        // Vite ≥ 6 supports `cssFileName` here, which removes the need
        // for the post-build rename. Setting it on every entry is fine
        // — only the entry that ships CSS (popup) actually uses it.
        cssFileName: 'popup',
      },
      rollupOptions: {
        output: {
          inlineDynamicImports: true,
        },
      },
      minify: true,
    },
    logLevel: 'warn',
  })
}

console.log('[extension] Copying assets...')

// Manifest with version
const manifest = JSON.parse(
  readFileSync(resolve(root, 'src/extension/manifest.json'), 'utf-8'),
)
manifest.version = pkg.version
writeFileSync(resolve(extensionDir, 'manifest.json'), JSON.stringify(manifest, null, 2))

// popup.html
writeFileSync(
  resolve(extensionDir, 'popup.html'),
  readFileSync(resolve(root, 'src/extension/popup/popup.html'), 'utf-8'),
)

// Icons
const iconsOut = resolve(extensionDir, 'icons')
mkdirSync(iconsOut, { recursive: true })
for (const size of [16, 32, 48, 128]) {
  const name = `icon-${size}.png`
  const src = resolve(root, `src/extension/icons/${name}`)
  if (existsSync(src)) copyFileSync(src, resolve(iconsOut, name))
}

// Fallback for environments where `cssFileName` isn't honoured yet
// (older Vite). Always run the rename — overwrite any stale popup.css
// from a previous build instead of silently keeping it.
const wrongCss = resolve(extensionDir, 'google-photos-delete-tool.css')
const correctCss = resolve(extensionDir, 'popup.css')
if (existsSync(wrongCss)) {
  if (existsSync(correctCss)) rmSync(correctCss)
  renameSync(wrongCss, correctCss)
}

console.log('✅ Extension → dist/extension/')

// ─── Standalone Inject ───────────────────────────────────────────

console.log('[standalone] Building inject.js...')
await build({
  configFile: false,
  root,
  build: {
    outDir: resolve(root, 'dist/standalone'),
    emptyOutDir: true,
    target: 'es2022',
    lib: {
      entry: resolve(root, 'src/standalone/inject.ts'),
      formats: ['iife'],
      name: 'GooglePhotosDeleteTool',
      fileName: () => 'inject.js',
    },
    rollupOptions: { output: { inlineDynamicImports: true } },
    minify: false, // Keep readable for console paste
  },
  logLevel: 'warn',
})
console.log('✅ Standalone → dist/standalone/inject.js')

// ─── Userscript ──────────────────────────────────────────────────

console.log('[userscript] Building...')
const userscriptDir = resolve(root, 'dist/userscript')
mkdirSync(userscriptDir, { recursive: true })

await build({
  configFile: false,
  root,
  build: {
    outDir: userscriptDir,
    emptyOutDir: true,
    target: 'es2022',
    lib: {
      entry: resolve(root, 'src/userscript/google-photos-delete.user.ts'),
      formats: ['iife'],
      name: 'GooglePhotosDeleteUserscript',
      fileName: () => 'google-photos-delete.user.js',
    },
    rollupOptions: { output: { inlineDynamicImports: true } },
    minify: false,
  },
  logLevel: 'warn',
})

// Prepend userscript metadata header
const userscriptHeader = `// ==UserScript==
// @name         Google Photos Delete Tool
// @namespace    https://github.com/shtse8/Google-Photos-Delete-Tool
// @version      ${pkg.version}
// @description  The fastest way to bulk delete your Google Photos
// @author       Kyle Tse
// @match        https://photos.google.com/*
// @grant        none
// @homepage     https://github.com/shtse8/Google-Photos-Delete-Tool
// @supportURL   https://github.com/shtse8/Google-Photos-Delete-Tool/issues
// @license      MIT
// @downloadURL  https://github.com/shtse8/Google-Photos-Delete-Tool/releases/latest/download/google-photos-delete.user.js
// @updateURL    https://github.com/shtse8/Google-Photos-Delete-Tool/releases/latest/download/google-photos-delete.user.js
// ==/UserScript==
`

const userscriptPath = resolve(userscriptDir, 'google-photos-delete.user.js')
const userscriptCode = readFileSync(userscriptPath, 'utf-8')
writeFileSync(userscriptPath, userscriptHeader + '\n' + userscriptCode)

console.log('✅ Userscript → dist/userscript/google-photos-delete.user.js')

// ─── Bookmarklet ─────────────────────────────────────────────────

console.log('[bookmarklet] Building...')
const bookmarkletBuildDir = resolve(root, 'dist/_bookmarklet_tmp')

await build({
  configFile: false,
  root,
  build: {
    outDir: bookmarkletBuildDir,
    emptyOutDir: true,
    target: 'es2022',
    lib: {
      entry: resolve(root, 'src/standalone/inject.ts'),
      formats: ['iife'],
      name: 'GPDT',
      fileName: () => 'bookmarklet.js',
    },
    rollupOptions: { output: { inlineDynamicImports: true } },
    minify: true,
  },
  logLevel: 'warn',
})

const minified = readFileSync(resolve(bookmarkletBuildDir, 'bookmarklet.js'), 'utf-8').trim()
const bookmarkletUrl = `javascript:${encodeURIComponent(minified)}`

// Output bookmarklet.txt
writeFileSync(resolve(root, 'dist/bookmarklet.txt'), bookmarkletUrl)

// Output bookmarklet.html from template
const template = readFileSync(resolve(root, 'src/bookmarklet/template.html'), 'utf-8')
writeFileSync(
  resolve(root, 'dist/bookmarklet.html'),
  template.replace('{{BOOKMARKLET_URL}}', bookmarkletUrl),
)

// Clean up temp
rmSync(bookmarkletBuildDir, { recursive: true, force: true })

console.log('✅ Bookmarklet → dist/bookmarklet.txt + dist/bookmarklet.html')

// ─── Summary ─────────────────────────────────────────────────────

console.log('\n📦 Build complete!')
console.log('   dist/extension/                     Chrome extension')
console.log('   dist/standalone/inject.js            Console paste')
console.log('   dist/userscript/*.user.js            Tampermonkey')
console.log('   dist/bookmarklet.txt                 Bookmarklet URL')
console.log('   dist/bookmarklet.html                Draggable link page')
