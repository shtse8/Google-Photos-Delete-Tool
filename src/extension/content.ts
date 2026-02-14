import { DeleteEngine, type Progress } from '../core'

let engine: DeleteEngine | null = null

const reportProgress = (progress: Progress): void => {
  // Send to background for badge update
  chrome.runtime.sendMessage({ type: 'progress', data: progress })
  // Log to console
  const { deleted, selected, status } = progress
  console.log(`[Google Photos Delete] ${status} — ${deleted} deleted, ${selected} selected`)
}

const start = (maxCount: number): void => {
  if (engine) {
    console.warn('[Google Photos Delete] Already running — stop first')
    return
  }

  engine = new DeleteEngine({ maxCount }, (progress) => {
    reportProgress(progress)
    if (progress.status === 'done' || progress.status === 'error') {
      engine = null
    }
  })

  console.log(`[Google Photos Delete] Starting — target: ${maxCount} photos`)
  engine.run()
}

const stop = (): void => {
  if (!engine) return
  engine.abort()
  engine = null
  console.log('[Google Photos Delete] Stopped')
}

// Listen for messages from popup or background
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.action) {
    case 'start':
      start(message.maxCount ?? 10_000)
      sendResponse({ ok: true })
      break
    case 'stop':
      stop()
      sendResponse({ ok: true })
      break
    case 'toggle':
      if (engine) { stop(); } else { start(message.maxCount ?? 10_000); }
      sendResponse({ ok: true })
      break
    case 'status':
      sendResponse({ running: !!engine })
      break
  }
})

console.log('[Google Photos Delete] Extension loaded — use the popup to start.')
