/**
 * Storefront listing — single source of truth guard.
 *
 * Reads storefront/listing.json and enforces every store's character
 * limits (source-level evidence: a listing that violates a limit can
 * never reach a store workflow). Also emits the exact JSON payload for
 * the Chrome Web Store metadata-only update API.
 *
 *   bun run listing:check          # validate (CI)
 *   bun run listing:cws            # emit CWS metadata payload
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const read = (p: string) => readFileSync(resolve(root, p), 'utf-8')

const pkg = JSON.parse(read('package.json'))
const listing = JSON.parse(read('storefront/listing.json'))

// When emitting a machine payload (--cws-metadata), stdout must carry ONLY
// the JSON — diagnostics go to stderr so `bun run listing:cws > file` is safe.
const emitting = process.argv.includes('--cws-metadata')
const log = (msg: string) => (emitting ? console.error(msg) : console.log(msg))

let failures = 0
function check(ok: boolean, what: string): void {
  if (ok) {
    log(`  ✓ ${what}`)
  } else {
    failures++
    console.error(`  ✗ ${what}`)
  }
}

// ─── Applicability: listing must track the current release ───────
check(
  listing.appliesTo === pkg.version,
  `listing.appliesTo (${listing.appliesTo}) == package version (${pkg.version})`,
)

// ─── Character limits (live store policies) ──────────────────────
const LIMITS = {
  'cws.title': [listing.cws.title, 75],
  'cws.summary': [listing.cws.summary, 132],
  'cws.description': [listing.cws.description.join('\n\n'), 16000],
  'edge.name': [listing.edge.name, 45],
  'edge.shortDescription': [listing.edge.shortDescription, 132],
  'edge.description': [listing.edge.description.join('\n\n'), 10000],
  'amo.name': [listing.amo.name, 50],
  'amo.summary': [listing.amo.summary, 250],
  'amo.description': [listing.amo.description.join('\n\n'), 10000],
} as const

for (const [field, [text, max]] of Object.entries(LIMITS)) {
  check(typeof text === 'string' && text.length > 0 && text.length <= max, `${field}: ${text.length} chars (max ${max})`)
}

// ─── Content sanity: Pro disclosure is required by store policy ──
for (const store of ['cws', 'edge', 'amo'] as const) {
  const text = listing[store].description.join('\n\n').toLowerCase()
  const summary = (listing[store].summary ?? '').toLowerCase()
  check(
    text.includes('free forever') && (text.includes('pro') || summary.includes('pro')),
    `${store}: free-forever + Pro disclosure present`,
  )
}

// ─── Screenshot manifest present ─────────────────────────────────
check(Array.isArray(listing.screenshots) && listing.screenshots.length >= 3, `screenshots listed (${listing.screenshots.length})`)

if (failures > 0) {
  console.error(`\nlisting: ${failures} failure(s)`)
  process.exit(1)
}
log('listing: OK')

// ─── Emit CWS metadata payload (metadata-only update API) ────────
if (process.argv.includes('--cws-metadata')) {
  const payload = {
    title: listing.cws.title,
    summary: listing.cws.summary,
    description: listing.cws.description.join('\n\n'),
    category: listing.cws.category,
    defaultLocale: listing.cws.locale,
    homepageUrl: listing.shared.homepageUrl,
    supportUrl: listing.shared.supportUrl,
  }
  process.stdout.write(JSON.stringify(payload, null, 2))
}
