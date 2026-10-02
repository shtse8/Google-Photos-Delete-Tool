/**
 * Size budget gate — runs AFTER `bun run build` and `bun run zip`.
 *
 * Fails when a tracked file is more than `tolerancePercent` over its recorded
 * size in budgets/size.json. content.js is injected into every photos.google.com
 * page and the zip is what the store serves, so silent growth costs every user.
 * A deliberate increase is recorded with `bun run size:check --write` in the
 * same PR, so the new size is reviewed. Shrinking never fails.
 */
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const budgetPath = resolve(root, 'budgets/size.json')
const budget = JSON.parse(readFileSync(budgetPath, 'utf-8')) as { tolerancePercent: number; files: Record<string, number> }
const write = process.argv.includes('--write')

let failures = 0
for (const [file, recorded] of Object.entries(budget.files)) {
  const path = resolve(root, file)
  if (!existsSync(path)) {
    console.error(`  ✗ ${file} missing: run "bun run build" and "bun run zip" first`)
    failures++
    continue
  }
  const size = statSync(path).size
  const limit = Math.floor(recorded * (1 + budget.tolerancePercent / 100))
  const delta = ((size - recorded) / recorded) * 100
  if (write) {
    budget.files[file] = size
    console.log(`  recorded ${file}: ${size} B`)
  } else if (size > limit) {
    console.error(`  ✗ ${file}: ${size} B is ${delta.toFixed(1)}% over the ${recorded} B budget (limit ${limit} B). Shrink it, or record the new size with "bun run size:check --write" and justify it in the PR.`)
    failures++
  } else {
    console.log(`  ✓ ${file}: ${size} B (${delta >= 0 ? '+' : ''}${delta.toFixed(1)}% vs ${recorded} B, limit ${limit} B)`)
  }
}
if (write) writeFileSync(budgetPath, JSON.stringify(budget, null, 2) + '\n')
process.exit(failures ? 1 : 0)
