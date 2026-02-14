import { DeleteEngine, type Progress } from '../core'

let engine: DeleteEngine | null = null

const reportProgress = (progress: Progress): void => {
  // Send to background for badge update and popup relay
  chrome.runtime.sendMessage({ type: 'progress', data: progress })
  // Log to console
  const { deleted, selected, status } = progress
  console.log(`[Google Photos Delete] ${status} — ${deleted} deleted, ${selected} selected`)
}

interface StartOptions {
  maxCount?: number
  dryRun?: boolean
}

const start = ({ maxCount = 10_000, dryRun = false }: StartOptions): void => {
  if (engine) {
    console.warn('[Google Photos Delete] Already running — stop first')
    return
  }

  engine = new DeleteEngine({ maxCount, dryRun }, (progress) => {
    reportProgress(progress)
    if (progress.status === 'done' || progress.status === 'error') {
      engine = null
    }
  })

  const mode = dryRun ? '(dry run) ' : ''
  console.log(`[Google Photos Delete] Starting ${mode}— target: ${maxCount} photos`)
  engine.run()
}

const pause = (): void => {
  if (!engine) return
  engine.pause()
  console.log('[Google Photos Delete] Paused')
}

const resume = (): void => {
  if (!engine) return
  engine.resume()
  console.log('[Google Photos Delete] Resumed')
}

const stop = (): void => {
  if (!engine) return
  engine.stop()
  engine = null
  console.log('[Google Photos Delete] Stopped')
}

// Listen for messages from popup or background
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.action) {
    case 'start':
      start({ maxCount: message.maxCount, dryRun: message.dryRun })
      sendResponse({ ok: true })
      break
    case 'pause':
      pause()
      sendResponse({ ok: true })
      break
    case 'resume':
      resume()
      sendResponse({ ok: true })
      break
    case 'stop':
      stop()
      sendResponse({ ok: true })
      break
    case 'toggle':
      if (engine) {
        stop()
      } else {
        start({ maxCount: message.maxCount, dryRun: message.dryRun })
      }
      sendResponse({ ok: true })
      break
    case 'status':
      sendResponse({
        running: !!engine,
        paused: engine?.isPaused ?? false,
      })
      break
  }
})

console.log('[Google Photos Delete] Extension loaded — use the popup to start.')
