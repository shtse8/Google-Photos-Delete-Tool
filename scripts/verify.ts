/**
 * Artifact verification (smoke gate) — runs AFTER `bun run build`.
 *
 * Checks that the built artifacts are structurally correct and
 * self-consistent before they can be zipped / released:
 *   - manifest version == package version (both variants)
 *   - Firefox manifest shape (background.scripts, no service_worker)
 *   - userscript metadata header matches the package version
 *   - IIFE self-containment (no import/import()/export statements)
 *   - no raw async chrome.* calls leaked into built extension JS
 *     (content/popup/background must go through src/extension/api.ts
 *     wrappers so the same files run in Chromium AND Firefox)
 *   - popup assets (html/css/icons) present
 */
import { readFileSync, existsSync } from 'fs'
import { SUPPORTED_MATCH_PATTERN } from '../src/core/surface'
import { fileURLToPath } from 'node:url'
import { resolve } from 'path'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8'))

let failures = 0

function check(ok: boolean, what: string): void {
  if (ok) {
    console.log(`  ✓ ${what}`)
  } else {
    failures++
    console.error(`  ✗ ${what}`)
  }
}

function read(path: string): string {
  return readFileSync(resolve(root, path), 'utf-8')
}

console.log('verify: package version =', pkg.version)

// ─── Chrome manifest ────────────────────────────────────────────
{
  const m = JSON.parse(read('dist/extension/manifest.json'))
  check(m.version === pkg.version, `chrome manifest version == ${pkg.version}`)
  check(m.manifest_version === 3, 'chrome manifest_version == 3')
  check(
    typeof m.background?.service_worker === 'string',
    'chrome background.service_worker present',
  )
  check(!m.background?.scripts, 'chrome background has no scripts array')
  check(m.permissions?.length === 1 && m.permissions[0] === 'storage', 'chrome permissions == ["storage"]')
  check(Array.isArray(m.host_permissions) && m.host_permissions.includes(SUPPORTED_MATCH_PATTERN), 'chrome host_permissions cover photos.google.com')
  check(Array.isArray(m.content_scripts?.[0]?.matches) && m.content_scripts[0].matches.includes(SUPPORTED_MATCH_PATTERN), 'chrome content_scripts match photos.google.com')
}

// ─── Firefox manifest ───────────────────────────────────────────
{
  const m = JSON.parse(read('dist/extension-firefox/manifest.json'))
  check(m.version === pkg.version, `firefox manifest version == ${pkg.version}`)
  check(m.manifest_version === 3, 'firefox manifest_version == 3')
  check(!m.background?.service_worker, 'firefox background has NO service_worker (unsupported in Firefox MV3)')
  check(Array.isArray(m.background?.scripts) && m.background.scripts.includes('background.js'), 'firefox background.scripts includes background.js')
  check(!!m.browser_specific_settings?.gecko?.id, 'firefox browser_specific_settings.gecko.id present')
}

// ─── Extension built JS ─────────────────────────────────────────
/**
 * The api.ts callback wrappers are bundled inline, so each raw chrome.*
 * async call appears AT MOST ONCE per file — inside the wrapper
 * definition itself. Any count above the expected one means a raw call
 * slipped in outside api.ts (which would break Firefox, where chrome.*
 * is callback-only). Event listeners (chrome.runtime.onMessage,
 * chrome.tabs.onRemoved) and chrome.runtime.id are callback-based in
 * both browsers and allowed freely.
 */
const EXTENSION_JS = ['content.js', 'background.js', 'popup.js']
const RAW_CHROME_MAX: Array<[RegExp, string, number]> = [
  [/chrome\.storage\.local\.get\(/, 'raw chrome.storage.local.get calls (wrapper only)', 1],
  [/chrome\.storage\.local\.set\(/, 'raw chrome.storage.local.set calls (wrapper only)', 1],
  [/chrome\.storage\.local\.remove\(/, 'raw chrome.storage.local.remove calls (wrapper only)', 1],
  [/chrome\.runtime\.sendMessage\(/, 'raw chrome.runtime.sendMessage calls (wrapper only)', 1],
  [/chrome\.tabs\.query\(/, 'raw chrome.tabs.query calls (wrapper only)', 1],
  [/chrome\.tabs\.sendMessage\(/, 'raw chrome.tabs.sendMessage calls (wrapper only)', 1],
  [/chrome\.tabs\.create\(/, 'raw chrome.tabs.create calls (wrapper only)', 1],
  [/chrome\.action\.setBadgeText\(/, 'raw chrome.action.setBadgeText calls (wrapper only)', 1],
  [/chrome\.action\.setBadgeBackgroundColor\(/, 'raw chrome.action.setBadgeBackgroundColor calls (wrapper only)', 1],
]

for (const dir of ['extension', 'extension-firefox']) {
  for (const file of EXTENSION_JS) {
    const rel = `dist/${dir}/${file}`
    if (!existsSync(resolve(root, rel))) {
      check(false, `${rel} exists`)
      continue
    }
    const code = read(rel)
    check(!/\bimport\s*\(/.test(code), `${rel} has no dynamic import()`)
    check(!/\bimport\s+/.test(code), `${rel} has no import statements (IIFE self-contained)`)
    check(!/\bexport\s+/.test(code), `${rel} has no export statements (IIFE self-contained)`)
    for (const [re, label, max] of RAW_CHROME_MAX) {
      const count = (code.match(re) ?? []).length
      check(count <= max, `${rel}: ${label} (${count} <= ${max})`)
    }
  }
  // Popup assets
  for (const asset of ['popup.html', 'popup.css']) {
    check(existsSync(resolve(root, `dist/${dir}/${asset}`)), `dist/${dir}/${asset} exists`)
  }
  for (const size of [16, 32, 48, 128]) {
    check(existsSync(resolve(root, `dist/${dir}/icons/icon-${size}.png`)), `dist/${dir}/icons/icon-${size}.png exists`)
  }
}

// ─── Userscript ─────────────────────────────────────────────────
{
  const header = read('dist/userscript/google-photos-delete.user.js').split('\n').slice(0, 30).join('\n')
  check(header.includes(`// @version      ${pkg.version}`), 'userscript @version == package version')
  check(header.includes(`// @match        ${SUPPORTED_MATCH_PATTERN}`), 'userscript @match covers photos.google.com')
  check(header.includes('// @grant        none'), 'userscript @grant none')
  check(!header.includes('bookmarklet'), 'userscript header has no bookmarklet residue')
}

// ─── Standalone ─────────────────────────────────────────────────
{
  const rel = 'dist/standalone/inject.js'
  const code = read(rel)
  check(existsSync(resolve(root, rel)), `${rel} exists`)
  check(code.length > 1000, `${rel} is non-trivial (${code.length} bytes)`)
  check(!/\bimport\s*\(/.test(code), `${rel} has no dynamic import()`)
  check(!/\bimport\s+/.test(code), `${rel} has no import statements`)
}

// ─── Selector pack integrity ────────────────────────────────────
{
  const pack = JSON.parse(read('src/selector-packs/pack-v1.json'))
  check(pack.version === 2, 'selector pack version == 2 (photoTypes present)')
  check(!!pack.photoTypes?.photo?.length && !!pack.photoTypes?.screenshot?.length, 'pack photoTypes keyword lists non-empty')
}

if (failures > 0) {
  console.error(`\n❌ verify failed with ${failures} problem(s)`)
  process.exit(1)
}
console.log('\n✅ verify: all artifacts consistent')
