/**
 * Engine throughput and heap benchmark against the mock Google Photos grid.
 *
 *   bun run bench:engine                       # N = 500, 2000, 5000; dry and delete
 *   bun run bench:engine --n 500,2000          # subset of sizes
 *   bun run bench:engine --modes delete        # subset of modes
 *   bun run bench:engine --out bench-engine.json
 *   bun run bench:engine --check               # fail on > 2x regression vs bench/engine-baseline.json
 *   bun run bench:engine --write-baseline      # record the run as the new baseline
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
import { DEFAULT_MOCK, mockPageHtml } from './mock-grid'
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
const modes = (arg('modes') ?? 'dry,delete').split(',') as Array<'dry' | 'delete'>
const out = arg('out')

interface Row {
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
  for (const n of sizes) {
    for (const mode of modes) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
      await page.setContent(mockPageHtml({ n, ...DEFAULT_MOCK }))
      await page.addScriptTag({ content: script })
      const r = (await page.evaluate(
        (dryRun) => (window as unknown as { __gpdtBench: (o: { dryRun: boolean }) => Promise<unknown> }).__gpdtBench({ dryRun }),
        mode === 'dry',
      )) as BenchResult
      const mock = (await page.evaluate(() => (window as unknown as { __mock: { stats: unknown } }).__mock.stats)) as {
        checkboxClicks: number; deleted: number
      }
      // Safety readbacks: a dry run clicks nothing; a delete never exceeds the grid.
      if (mode === 'dry' && mock.checkboxClicks !== 0) throw new Error(`dry run clicked ${mock.checkboxClicks} checkboxes`)
      if (mode === 'delete' && mock.deleted > n) throw new Error(`deleted ${mock.deleted} > ${n}`)
      const row: Row = {
        n, mode, status: r.status, error: r.error, count: r.count,
        elapsedS: round(r.elapsedMs / 1000),
        photosPerMinute: round((r.count / r.elapsedMs) * 60_000),
        sleepSharePct: round((r.sleepMs / r.elapsedMs) * 100),
        sleeps: r.sleeps,
        peakHeapMB: round(r.peakHeapBytes / 1048576),
        heapGrowthMB: round((r.peakHeapBytes - r.startHeapBytes) / 1048576),
        longTasks: { count: r.longTasks.count, totalMs: round(r.longTasks.totalMs), maxMs: round(r.longTasks.maxMs) },
      }
      rows.push(row)
      console.error(`n=${n} ${mode}: ${row.status} ${row.count} photos in ${row.elapsedS}s = ${row.photosPerMinute}/min, heap ${row.peakHeapMB} MB`)
      await page.close()
    }
  }
} finally {
  await browser.close()
}

const report = { generatedAt: new Date().toISOString(), mock: DEFAULT_MOCK, rows }
const json = JSON.stringify(report, null, 2) + '\n'
if (out) writeFileSync(out, json)
else process.stdout.write(json)
if (flag('write-baseline')) {
  // Merge by (n, mode) so long sizes can be recorded in separate runs.
  const prev = existsSync(baselinePath) ? (JSON.parse(readFileSync(baselinePath, 'utf-8')) as { rows: Row[] }).rows : []
  const kept = prev.filter((p) => !rows.some((r) => r.n === p.n && r.mode === p.mode))
  const merged = [...kept, ...rows].sort((a, b) => a.n - b.n || a.mode.localeCompare(b.mode))
  const note = existsSync(baselinePath) ? (JSON.parse(readFileSync(baselinePath, 'utf-8')) as { note?: string }).note : undefined
  writeFileSync(baselinePath, JSON.stringify({ note, ...report, rows: merged }, null, 2) + '\n')
}

let failed = false
for (const r of rows) {
  const expected = r.n
  if (r.status !== 'done' || r.count !== expected) {
    console.error(`FAIL n=${r.n} ${r.mode}: status=${r.status} count=${r.count}/${expected} ${r.error ?? ''}`)
    failed = true
  }
}
if (flag('check')) {
  if (!existsSync(baselinePath)) throw new Error('no baseline: run with --write-baseline first')
  const base = JSON.parse(readFileSync(baselinePath, 'utf-8')) as { rows: Row[] }
  for (const r of rows) {
    const b = base.rows.find((x) => x.n === r.n && x.mode === r.mode)
    if (!b) continue
    if (r.photosPerMinute * BUDGET < b.photosPerMinute) {
      console.error(`REGRESSION n=${r.n} ${r.mode}: ${r.photosPerMinute}/min vs baseline ${b.photosPerMinute}/min (budget ${BUDGET}x)`)
      failed = true
    }
    if (r.peakHeapMB > b.peakHeapMB * BUDGET) {
      console.error(`REGRESSION n=${r.n} ${r.mode}: heap ${r.peakHeapMB} MB vs baseline ${b.peakHeapMB} MB (budget ${BUDGET}x)`)
      failed = true
    }
  }
}
if (failed) process.exit(1)
