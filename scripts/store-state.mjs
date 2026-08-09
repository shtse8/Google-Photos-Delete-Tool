/**
 * Store publish state — what is LIVE in each store (not what was pushed).
 *
 * State lives in the `store-state` branch as state.json:
 *   { "cws": "v2.0.5", "edge": null, "amo": null }
 *
 * A store's state is only advanced AFTER the platform API confirms a
 * publish succeeded. The scheduled retry loop compares the latest release
 * tag against this record, so it never re-publishes a version that is
 * already live, and never spams stores with duplicate-version errors.
 *
 * Plain Node — no dependencies, runs on stock runners.
 *
 * Commands (run from the repo root, with origin/store-state fetched):
 *   node scripts/store-state.mjs pending <store> <tag>
 *     → prints "pending" or "up-to-date" (exit 0 either way)
 *   node scripts/store-state.mjs set <store> <tag>
 *     → reads the current origin/store-state:state.json, applies the
 *       update, and writes the result to $STATE_FILE (default ./state.json).
 *       The caller does the branch checkout/commit/push — never run the
 *       script from inside a store-state checkout (the branch only
 *       contains state.json).
 */
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const [cmd, store, tag] = process.argv.slice(2)
const STORES = ['cws', 'edge', 'amo']

function readState() {
  try {
    return JSON.parse(execSync('git show origin/store-state:state.json', { encoding: 'utf-8' }))
  } catch {
    return {}
  }
}

if (cmd === 'pending') {
  if (!STORES.includes(store) || !tag) {
    console.error('usage: store-state pending <cws|edge|amo> <tag>')
    process.exit(2)
  }
  const state = readState()
  console.log(state[store] === tag ? 'up-to-date' : 'pending')
} else if (cmd === 'set') {
  if (!STORES.includes(store) || !tag) {
    console.error('usage: store-state set <cws|edge|amo> <tag>')
    process.exit(2)
  }
  const state = readState()
  state[store] = tag
  const out = process.env.STATE_FILE || 'state.json'
  writeFileSync(out, `${JSON.stringify(state, null, 2)}\n`)
  console.log(`store-state: ${store}=${tag}`)
} else {
  console.error('usage: store-state <pending|set> <cws|edge|amo> <tag>')
  process.exit(2)
}
