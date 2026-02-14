/**
 * Google Photos Delete Tool — Standalone injection script.
 * Paste the built IIFE into Chrome DevTools console on photos.google.com.
 * Creates a floating widget UI with controls, progress bar, and stats.
 */
import { DeleteEngine, formatElapsed, formatEta, type Progress, type EngineStatus } from '../core'

;(() => {
  // Remove any existing widget
  document.getElementById('gpdt-container')?.remove()

  const container = document.createElement('div')
  container.id = 'gpdt-container'
  container.innerHTML = `
<div id="gpdt-widget" style="
  position:fixed; bottom:20px; right:20px; z-index:99999;
  background:rgba(30,30,50,0.92); color:#e8e8e8; border-radius:14px;
  box-shadow:0 8px 32px rgba(0,0,0,0.5); padding:16px 20px;
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
  font-size:13px; min-width:280px; user-select:none;
  border:1px solid rgba(255,255,255,0.08); backdrop-filter:blur(16px);
">
  <!-- Title bar -->
  <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
    <span style="font-weight:700; font-size:14px;">🗑️ Google Photos Delete Tool</span>
    <div style="display:flex; gap:4px;">
      <button id="gpdt-min" style="background:none;border:none;color:#666;cursor:pointer;font-size:16px;padding:0 4px;line-height:1;" title="Minimize">−</button>
      <button id="gpdt-close" style="background:none;border:none;color:#666;cursor:pointer;font-size:14px;padding:0 4px;line-height:1;" title="Close">✕</button>
    </div>
  </div>
  <div id="gpdt-body">
    <!-- Config: Max count -->
    <div style="margin-bottom:8px;">
      <label style="font-size:11px;color:#888;display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.3px;">Max photos to delete</label>
      <input id="gpdt-max" type="number" value="10000" min="1" style="
        width:100%;padding:6px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);
        background:rgba(255,255,255,0.06);color:#e8e8e8;font-size:12px;outline:none;
        box-sizing:border-box;
      " />
    </div>
    <!-- Config: Dry run -->
    <div style="margin-bottom:10px;">
      <label style="font-size:11px;color:#888;display:flex;align-items:center;gap:6px;cursor:pointer;">
        <input id="gpdt-dryrun" type="checkbox" style="cursor:pointer;accent-color:#3b82f6;" />
        <span>Dry run (test without deleting)</span>
      </label>
    </div>
    <!-- Progress -->
    <div id="gpdt-progress" style="display:none;">
      <div style="background:rgba(255,255,255,0.06);border-radius:4px;height:5px;overflow:hidden;margin-bottom:8px;">
        <div id="gpdt-bar" style="height:100%;background:linear-gradient(90deg,#10b981,#3b82f6);width:0%;transition:width 0.3s ease;border-radius:4px;"></div>
      </div>
      <div id="gpdt-stats" style="font-size:11px;color:#999;margin-bottom:6px;"></div>
    </div>
    <!-- Error -->
    <div id="gpdt-error" style="display:none;font-size:11px;color:#ef4444;background:rgba(239,68,68,0.1);padding:6px 10px;border-radius:6px;margin-bottom:8px;"></div>
    <!-- Buttons -->
    <button id="gpdt-start" style="
      width:100%;padding:9px;border:none;border-radius:8px;font-size:13px;font-weight:600;
      background:linear-gradient(135deg,#10b981,#3b82f6);color:#fff;cursor:pointer;
      transition:opacity 0.2s;
    ">▶ Start Deleting</button>
    <div id="gpdt-running-btns" style="display:none;gap:8px;">
      <button id="gpdt-pause" style="
        flex:1;padding:9px;border:none;border-radius:8px;font-size:13px;font-weight:600;
        background:linear-gradient(135deg,#f59e0b,#ef4444);color:#fff;cursor:pointer;
        transition:opacity 0.2s;
      ">⏸ Pause</button>
      <button id="gpdt-stop" style="
        flex:1;padding:9px;border:none;border-radius:8px;font-size:13px;font-weight:600;
        background:#ef4444;color:#fff;cursor:pointer;
        transition:opacity 0.2s;
      ">■ Stop</button>
    </div>
  </div>
</div>
`
  document.body.appendChild(container)

  let engine: DeleteEngine | null = null
  let minimized = false

  const $ = (id: string) => document.getElementById(id)!
  const widget = $('gpdt-widget')
  const body = $('gpdt-body')
  const progressEl = $('gpdt-progress')
  const bar = $('gpdt-bar')
  const stats = $('gpdt-stats')
  const errorEl = $('gpdt-error')
  const startBtn = $('gpdt-start') as HTMLButtonElement
  const runningBtns = $('gpdt-running-btns')
  const pauseBtn = $('gpdt-pause') as HTMLButtonElement
  const stopBtn = $('gpdt-stop') as HTMLButtonElement
  const minBtn = $('gpdt-min')
  const closeBtn = $('gpdt-close')
  const maxInput = $('gpdt-max') as HTMLInputElement
  const dryRunCheck = $('gpdt-dryrun') as HTMLInputElement

  // --- Minimize / Close ---

  minBtn.addEventListener('click', () => {
    minimized = !minimized
    body.style.display = minimized ? 'none' : 'block'
    minBtn.textContent = minimized ? '+' : '−'
    widget.style.minWidth = minimized ? 'auto' : '280px'
  })

  closeBtn.addEventListener('click', () => {
    engine?.stop()
    container.remove()
  })

  // --- Status text helper ---

  const statusText: Record<EngineStatus, string> = {
    idle: '⏳ Ready',
    selecting: '🔍 Selecting photos...',
    deleting: '🗑️ Deleting batch...',
    scrolling: '📜 Loading more...',
    paused: '⏸ Paused',
    done: '✅ Done!',
    error: '❌ Error',
  }

  // --- UI update ---

  const updateUI = (p: Progress): void => {
    const maxCount = parseInt(maxInput.value, 10) || 10_000
    const running = !['idle', 'done', 'error'].includes(p.status)

    // Show/hide button groups
    startBtn.style.display = running ? 'none' : 'block'
    runningBtns.style.display = running ? 'flex' : 'none'

    // Disable config while running
    maxInput.disabled = running
    dryRunCheck.disabled = running

    // Progress bar
    progressEl.style.display = (p.deleted > 0 || running) ? 'block' : 'none'
    if (maxCount > 0) {
      bar.style.width = `${Math.min(100, (p.deleted / maxCount) * 100)}%`
    }

    // Pause button text
    if (engine) {
      pauseBtn.textContent = engine.isPaused ? '▶ Resume' : '⏸ Pause'
      pauseBtn.style.background = engine.isPaused
        ? 'linear-gradient(135deg,#10b981,#3b82f6)'
        : 'linear-gradient(135deg,#f59e0b,#ef4444)'
    }

    // Error display
    errorEl.style.display = p.status === 'error' ? 'block' : 'none'
    if (p.status === 'error') {
      errorEl.textContent = p.error || 'Something went wrong'
    }

    // Stats line
    const elapsed = Date.now() - p.startedAt
    const rate = engine ? engine.log.ratePerMinute() : 0
    const etaMs = engine ? engine.log.estimateRemaining(maxCount) : null

    let statsLine = statusText[p.status] || p.status
    if (p.deleted > 0) {
      statsLine += ` · ${p.deleted.toLocaleString()} deleted`
      if (rate > 0 && running) {
        statsLine += ` · ${Math.round(rate)}/min`
      }
      if (etaMs !== null && etaMs > 0 && running) {
        statsLine += ` · ETA ${formatEta(etaMs)}`
      }
      if (!running && p.status === 'done') {
        statsLine = `✅ Done — ${p.deleted.toLocaleString()} deleted in ${formatElapsed(elapsed)}`
      }
    }
    stats.textContent = statsLine

    // Done state
    if (p.status === 'done') {
      startBtn.textContent = '▶ Start Again'
      bar.style.background = 'linear-gradient(90deg, #10b981, #10b981)'
    }
  }

  // --- Start ---

  startBtn.addEventListener('click', () => {
    if (engine) return

    const maxCount = parseInt(maxInput.value, 10) || 10_000
    const dryRun = dryRunCheck.checked

    // Reset UI
    errorEl.style.display = 'none'
    bar.style.width = '0%'
    bar.style.background = 'linear-gradient(90deg, #10b981, #3b82f6)'
    startBtn.textContent = '▶ Start Deleting'

    engine = new DeleteEngine({ maxCount, dryRun }, (p) => {
      updateUI(p)
      if (p.status === 'done' || p.status === 'error') {
        engine = null
      }
    })
    engine.run()
  })

  // --- Pause / Resume ---

  pauseBtn.addEventListener('click', () => {
    if (!engine) return
    if (engine.isPaused) {
      engine.resume()
    } else {
      engine.pause()
    }
  })

  // --- Stop ---

  stopBtn.addEventListener('click', () => {
    engine?.stop()
    engine = null
    startBtn.style.display = 'block'
    runningBtns.style.display = 'none'
    stats.textContent = '⏹ Stopped'
  })

  console.log('🗑️ Google Photos Delete Tool widget loaded')
})()
