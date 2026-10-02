/**
 * Engine throughput and heap benchmark against the mock Google Photos grid.
 *
 *   bun run bench:engine                       # N = 500, 2000, 5000; dry and delete
 *   bun run bench:engine --n 500,2000          # subset of sizes
 *   bun run bench:engine --modes delete        # subset of modes
 *   bun run bench:engine --out bench-engine.json
 *   bun run bench:engine --check               # fail on > 2x regression vs bench/engine-baseline.json
 *   bun run bench:engine --write-baseline      # record the run; refuses slower/heavier rows
 *   bun run bench:engine --write-baseline --loosen   # record them anyway (say why in the PR)
 *   bun run bench:engine --scenarios busy      # default (quiet page) and busy (live-page timing)
 *
 * Runs the real engine + real browserDom adapter (bundled from src/) in
 * headless Chromium on a local deterministic page; no network, no Google.
 * Browser: CHROMIUM_PATH, else /usr/bin/chromium. One browser launch per run.
 */
import { chromium } from 'playwright-core'
import { build } from 'vite'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SCENARIOS, mockPageHtml, type ScenarioName } from './mock-grid'
import type { BenchResult } from './engine-entry'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const baselinePath = resolve(root, 'bench/engine-baseline.json')
/** A run fails only when it is this many times worse than the baseline. */
const BUDGET = 2

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const flag = (name: string) => process.argv.includes(`--${name}`)

const sizes = (arg('n') ?? '500,2000,5000').split(',').map(Number)
const scenarios = (arg('scenarios') ?? 'default,busy').split(',') as ScenarioName[]
const modes = (arg('modes') ?? 'dry,delete').split(',') as Array<'dry' | 'delete'>
const out = arg('out')

interface Row {
  scenario: ScenarioName
  n: number
  mode: 'dry' | 'delete'
  status: string
  error?: string
  count: number
  elapsedS: number
  photosPerMinute: number
  sleepSharePct: number
  sleeps: number
  peakHeapMB: number
  heapGrowthMB: number
  longTasks: { count: number; totalMs: number; maxMs: number }
  violations: string[]
}
const round = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d

const bundled = await build({
  configFile: false,
  root,
  logLevel: 'warn',
  build: {
    write: false,
    target: 'es2022',
    minify: false,
    lib: { entry: resolve(root, 'scripts/bench/engine-entry.ts'), formats: ['iife'], name: '__gpdtBench', fileName: () => 'bench.js' },
  },
})
const output = (Array.isArray(bundled) ? bundled[0] : bundled) as { output: Array<{ type: string; code?: string }> }
const script = output.output.find((o) => o.type === 'chunk')?.code
if (!script) throw new Error('bench bundle produced no chunk')

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args: ['--enable-precise-memory-info', '--no-sandbox'],
})
const rows: Row[] = []
try {
  for (const scenario of scenarios) {
  for (const n of sizes) {
    for (const mode of modes) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
      await page.setContent(mockPageHtml({ n, ...SCENARIOS[scenario] }))
      await page.addScriptTag({ content: script })
      const r = (await page.evaluate(
        (dryRun) => (window as unknown as { __gpdtBench: (o: { dryRun: boolean }) => Promise<unknown> }).__gpdtBench({ dryRun }),
        mode === 'dry',
      )) as BenchResult
      const mock = (await page.evaluate(() => {
        const m = (window as unknown as { __mock: { stats: Record<string, number>; remaining: () => number } }).__mock
        return { ...m.stats, remaining: m.remaining() }
      })) as { checkboxClicks: number; toolbarClicks: number; confirmClicks: number; deleted: number; remaining: number }
      // Safety readbacks: a dry run clicks nothing at all; a delete run deletes
      // exactly what it reports and leaves nothing behind.
      const violations: string[] = []
      if (mode === 'dry') {
        if (mock.checkboxClicks || mock.toolbarClicks || mock.confirmClicks) {
          violations.push(`dry run clicked checkbox=${mock.checkboxClicks} toolbar=${mock.toolbarClicks} confirm=${mock.confirmClicks}`)
        }
      } else {
        if (mock.remaining !== 0) violations.push(`${mock.remaining} photos left in the grid`)
        if (mock.deleted !== r.count) violations.push(`grid deleted ${mock.deleted} but the engine reported ${r.count}`)
      }
      const row: Row = {
        scenario, n, mode, status: r.status, error: r.error, count: r.count,
        elapsedS: round(r.elapsedMs / 1000),
        photosPerMinute: round((r.count / r.elapsedMs) * 60_000),
        sleepSharePct: round((r.sleepMs / r.elapsedMs) * 100),
        sleeps: r.sleeps,
        peakHeapMB: round(r.peakHeapBytes / 1048576),
        heapGrowthMB: round((r.peakHeapBytes - r.startHeapBytes) / 1048576),
        longTasks: { count: r.longTasks.count, totalMs: round(r.longTasks.totalMs), maxMs: round(r.longTasks.maxMs) },
        violations,
      }
      rows.push(row)
      console.error(`${scenario} n=${n} ${mode}: ${row.status} ${row.count} photos in ${row.elapsedS}s = ${row.photosPerMinute}/min, heap ${row.peakHeapMB} MB${violations.length ? ' VIOLATIONS ' + violations.join('; ') : ''}`)
      await page.close()
    }
  }
  }
} finally {
  await browser.close()
}

const report = { generatedAt: new Date().toISOString(), scenarios: SCENARIOS, rows }
const json = JSON.stringify(report, null, 2) + '\n'
if (out) writeFileSync(out, json)
else process.stdout.write(json)
const same = (a: Row, b: Row) => (a.scenario ?? 'default') === (b.scenario ?? 'default') && a.n === b.n && a.mode === b.mode
let failed = false
if (flag('write-baseline')) {
  // The baseline only ratchets: a row that is slower or heavier than the
  // recorded one is refused unless --loosen says the loosening is intended.
  const prevFile = existsSync(baselinePath) ? (JSON.parse(readFileSync(baselinePath, 'utf-8')) as { rows: Row[]; note?: string }) : { rows: [] as Row[], note: undefined }
  if (!flag('loosen')) {
    for (const r of rows) {
      const b = prevFile.rows.find((x) => same(x, r))
      if (b && (r.photosPerMinute < b.photosPerMinute || r.peakHeapMB > b.peakHeapMB)) {
        console.error(`REFUSED ${r.scenario} n=${r.n} ${r.mode}: ${r.photosPerMinute}/min, ${r.peakHeapMB} MB is slower or heavier than the baseline ${b.photosPerMinute}/min, ${b.peakHeapMB} MB (use --loosen to record it)`)
        failed = true
      }
    }
  }
  if (!failed) {
    // Merge by (scenario, n, mode) so long sizes can be recorded in separate runs.
    const kept = prevFile.rows.filter((p) => !rows.some((r) => same(p, r))).map((p) => ({ ...p, scenario: p.scenario ?? 'default' }))
    const order = (r: Row) => r.scenario + String(r.n).padStart(6, '0') + r.mode
    const merged = [...kept, ...rows].sort((a, b) => order(a).localeCompare(order(b)))
    writeFileSync(baselinePath, JSON.stringify({ note: prevFile.note, ...report, rows: merged }, null, 2) + '\n')
  }
}

for (const r of rows) {
  const expected = r.n
  if (r.status !== 'done' || r.count !== expected) {
    console.error(`FAIL ${r.scenario} n=${r.n} ${r.mode}: status=${r.status} count=${r.count}/${expected} ${r.error ?? ''}`)
    failed = true
  }
  if (r.violations.length) {
    console.error(`FAIL ${r.scenario} n=${r.n} ${r.mode}: ${r.violations.join('; ')}`)
    failed = true
  }
}
if (flag('check')) {
  if (!existsSync(baselinePath)) throw new Error('no baseline: run with --write-baseline first')
  const base = JSON.parse(readFileSync(baselinePath, 'utf-8')) as { rows: Row[] }
  for (const r of rows) {
    const b = base.rows.find((x) => same(x, r))
    if (!b) continue
    if (r.photosPerMinute * BUDGET < b.photosPerMinute) {
      console.error(`REGRESSION ${r.scenario} n=${r.n} ${r.mode}: ${r.photosPerMinute}/min vs baseline ${b.photosPerMinute}/min (budget ${BUDGET}x)`)
      failed = true
    }
    if (r.peakHeapMB > b.peakHeapMB * BUDGET) {
      console.error(`REGRESSION ${r.scenario} n=${r.n} ${r.mode}: heap ${r.peakHeapMB} MB vs baseline ${b.peakHeapMB} MB (budget ${BUDGET}x)`)
      failed = true
    }
  }
}
if (failed) process.exit(1)
