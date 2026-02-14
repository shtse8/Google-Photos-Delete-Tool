/**
 * Standalone script — paste the built IIFE into Chrome DevTools console.
 */
import { DeleteEngine, formatElapsed, formatEta } from '../core'

;(async () => {
  const maxCount = 10_000

  console.log(
    '%c🗑️ Google Photos Delete Tool',
    'font-size: 16px; font-weight: bold; color: #4f8cff',
  )
  console.log(`Deleting up to ${maxCount.toLocaleString()} photos...`)
  console.log('Controls: window.__gpdt_pause() / __gpdt_resume() / __gpdt_stop()')

  const engine = new DeleteEngine({ maxCount }, (progress) => {
    const { deleted, status, startedAt } = progress
    if (deleted > 0) {
      const elapsed = Date.now() - startedAt
      const rate = Math.round(deleted / (elapsed / 60_000))
      const remaining = maxCount - deleted
      const eta = remaining > 0 && rate > 0
        ? formatEta((remaining / rate) * 60_000)
        : '—'

      console.log(
        `[Progress] ${status} | ${deleted} deleted | ${rate}/min | ${formatElapsed(elapsed)} | ETA: ${eta}`,
      )
    }
  })

  // Expose control functions globally
  const w = window as unknown as Record<string, unknown>
  w.__gpdt_pause = () => { engine.pause(); console.log('⏸ Paused') }
  w.__gpdt_resume = () => { engine.resume(); console.log('▶ Resumed') }
  w.__gpdt_stop = () => { engine.stop(); console.log('⏹ Stopped') }

  const result = await engine.run()

  console.log(
    `%c✅ Done! Deleted ${result.deleted} photos in ${formatElapsed(Date.now() - result.startedAt)}`,
    'font-size: 14px; color: #22c55e',
  )

  if (result.error) {
    console.error('Finished with error:', result.error)
  }

  // Clean up globals
  delete w.__gpdt_pause
  delete w.__gpdt_resume
  delete w.__gpdt_stop
})()
