/**
 * Page-side benchmark runner. Bundled by scripts/bench/engine.ts into an IIFE
 * that runs the real DeleteEngine on the real browserDom adapter (the same
 * selector pack and pointer-click path the content script uses) against the
 * mock grid, and returns throughput, heap and long-task measurements.
 */
import { DeleteEngine } from '../../src/core/delete-engine'
import { browserDom } from '../../src/core/browser-dom'
import type { Config } from '../../src/core/config'

export interface BenchResult {
  status: string
  error?: string
  count: number
  elapsedMs: number
  sleepMs: number
  sleeps: number
  peakHeapBytes: number
  startHeapBytes: number
  longTasks: { count: number; totalMs: number; maxMs: number }
}

interface PerfMemory { usedJSHeapSize: number }

async function runBench(opts: { dryRun: boolean; config?: Partial<Config> }): Promise<BenchResult> {
  const heap = () => (performance as unknown as { memory: PerfMemory }).memory.usedJSHeapSize
  const lt = { count: 0, totalMs: 0, maxMs: 0 }
  const po = new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      lt.count++
      lt.totalMs += e.duration
      lt.maxMs = Math.max(lt.maxMs, e.duration)
    }
  })
  po.observe({ type: 'longtask', buffered: true })

  const startHeap = heap()
  let peak = startHeap
  const sampler = setInterval(() => { peak = Math.max(peak, heap()) }, 50)

  let sleepMs = 0
  let sleeps = 0
  const dom = {
    ...browserDom,
    sleep: async (ms: number) => {
      const t = performance.now()
      await browserDom.sleep(ms)
      sleepMs += performance.now() - t
      sleeps++
    },
  }
  // Silence the engine's per-step logging so the console does not skew timing.
  const log = console.log
  if (!(window as unknown as { __verbose?: boolean }).__verbose) console.log = () => {}
  const t0 = performance.now()
  let progress
  try {
    const engine = new DeleteEngine({ dom, config: { ...opts.config, dryRun: opts.dryRun } })
    progress = await engine.run()
  } finally {
    console.log = log
  }
  const elapsedMs = performance.now() - t0
  clearInterval(sampler)
  peak = Math.max(peak, heap())
  // Let queued long-task entries flush.
  await new Promise((r) => setTimeout(r, 100))
  po.disconnect()
  return {
    status: progress.status,
    error: progress.error,
    count: opts.dryRun ? (progress.total ?? 0) : progress.deleted,
    elapsedMs,
    sleepMs,
    sleeps,
    peakHeapBytes: peak,
    startHeapBytes: startHeap,
    longTasks: lt,
  }
}

;(window as unknown as { __gpdtBench: typeof runBench }).__gpdtBench = runBench
