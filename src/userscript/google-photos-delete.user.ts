/**
 * Google Photos Delete Tool — Userscript (Tampermonkey / Violentmonkey / Greasemonkey)
 *
 * The metadata header is injected at build time by scripts/build.ts.
 */
import { DeleteEngine, type Progress, formatElapsed, formatEta } from '../core'

const PANEL_ID = 'gpdt-panel'

const createStyles = (): string => `
  #${PANEL_ID} {
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 999999;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px;
    color: #e0e0e0;
    background: rgba(30, 30, 50, 0.85);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    width: 280px;
    overflow: hidden;
    transition: all 0.3s ease;
    user-select: none;
  }
  #${PANEL_ID}.minimized {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  #${PANEL_ID}.minimized .gpdt-body { display: none; }
  #${PANEL_ID}.minimized .gpdt-mini-icon { display: flex; }
  .gpdt-mini-icon {
    display: none;
    font-size: 20px;
    align-items: center;
    justify-content: center;
  }
  .gpdt-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    background: rgba(255,255,255,0.05);
    border-bottom: 1px solid rgba(255,255,255,0.08);
  }
  .gpdt-title {
    font-weight: 700;
    font-size: 13px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .gpdt-header-btns {
    display: flex;
    gap: 4px;
  }
  .gpdt-header-btns button {
    background: none;
    border: none;
    color: #888;
    cursor: pointer;
    font-size: 14px;
    padding: 2px 6px;
    border-radius: 4px;
    line-height: 1;
    transition: all 0.15s;
  }
  .gpdt-header-btns button:hover { color: #fff; background: rgba(255,255,255,0.1); }
  .gpdt-content {
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .gpdt-status-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    color: #a1a1aa;
  }
  .gpdt-status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #666;
    flex-shrink: 0;
    transition: background 0.2s;
  }
  .gpdt-status-dot.running { background: #22c55e; animation: gpdt-pulse 1.5s infinite; }
  .gpdt-status-dot.paused { background: #f59e0b; animation: gpdt-pulse 2s infinite; }
  .gpdt-status-dot.done { background: #4f8cff; }
  .gpdt-status-dot.error { background: #ef4444; }
  @keyframes gpdt-pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(0.85); }
  }
  .gpdt-stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .gpdt-stat {
    background: rgba(255,255,255,0.05);
    border-radius: 10px;
    padding: 10px 12px;
    text-align: center;
  }
  .gpdt-stat-value {
    font-size: 18px;
    font-weight: 700;
    color: #fff;
    line-height: 1.2;
    font-variant-numeric: tabular-nums;
  }
  .gpdt-stat-label {
    font-size: 10px;
    color: #71717a;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-top: 2px;
  }
  .gpdt-progress {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .gpdt-progress-bar {
    flex: 1;
    height: 6px;
    background: rgba(255,255,255,0.08);
    border-radius: 3px;
    overflow: hidden;
  }
  .gpdt-progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #4f8cff, #6c5ce7);
    border-radius: 3px;
    width: 0%;
    transition: width 0.4s ease;
  }
  .gpdt-progress-label {
    font-size: 11px;
    font-weight: 600;
    color: #a1a1aa;
    min-width: 32px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .gpdt-controls {
    display: flex;
    gap: 8px;
  }
  .gpdt-btn {
    flex: 1;
    padding: 10px;
    border: none;
    border-radius: 10px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }
  .gpdt-btn:active { transform: scale(0.97); }
  .gpdt-btn-start {
    background: linear-gradient(135deg, #4f8cff, #6c5ce7);
    color: #fff;
    box-shadow: 0 2px 8px rgba(79,140,255,0.3);
  }
  .gpdt-btn-start:hover { opacity: 0.9; }
  .gpdt-btn-pause {
    background: #f59e0b;
    color: #fff;
  }
  .gpdt-btn-pause:hover { background: #d97706; }
  .gpdt-btn-stop {
    background: #ef4444;
    color: #fff;
  }
  .gpdt-btn-stop:hover { background: #dc2626; }
  .gpdt-hidden { display: none !important; }
`

const createPanel = (): HTMLElement => {
  const style = document.createElement('style')
  style.textContent = createStyles()
  document.head.appendChild(style)

  const panel = document.createElement('div')
  panel.id = PANEL_ID
  panel.innerHTML = `
    <div class="gpdt-mini-icon">🗑️</div>
    <div class="gpdt-body">
      <div class="gpdt-header">
        <span class="gpdt-title">🗑️ Photos Delete</span>
        <div class="gpdt-header-btns">
          <button class="gpdt-minimize" title="Minimize">−</button>
          <button class="gpdt-close" title="Close">×</button>
        </div>
      </div>
      <div class="gpdt-content">
        <div class="gpdt-status-bar">
          <span class="gpdt-status-dot"></span>
          <span class="gpdt-status-text">Ready</span>
        </div>
        <div class="gpdt-stats">
          <div class="gpdt-stat">
            <div class="gpdt-stat-value gpdt-deleted">0</div>
            <div class="gpdt-stat-label">Deleted</div>
          </div>
          <div class="gpdt-stat">
            <div class="gpdt-stat-value gpdt-speed">—</div>
            <div class="gpdt-stat-label">Per min</div>
          </div>
          <div class="gpdt-stat">
            <div class="gpdt-stat-value gpdt-elapsed">0s</div>
            <div class="gpdt-stat-label">Elapsed</div>
          </div>
          <div class="gpdt-stat">
            <div class="gpdt-stat-value gpdt-eta">—</div>
            <div class="gpdt-stat-label">ETA</div>
          </div>
        </div>
        <div class="gpdt-progress">
          <div class="gpdt-progress-bar">
            <div class="gpdt-progress-fill"></div>
          </div>
          <span class="gpdt-progress-label">0%</span>
        </div>
        <div class="gpdt-controls">
          <button class="gpdt-btn gpdt-btn-start gpdt-start-btn">▶ Start</button>
          <button class="gpdt-btn gpdt-btn-pause gpdt-pause-btn gpdt-hidden">⏸ Pause</button>
          <button class="gpdt-btn gpdt-btn-start gpdt-resume-btn gpdt-hidden">▶ Resume</button>
          <button class="gpdt-btn gpdt-btn-stop gpdt-stop-btn gpdt-hidden">⏹ Stop</button>
        </div>
      </div>
    </div>
  `
  document.body.appendChild(panel)
  return panel
}

const getStatusClass = (status: Progress['status']): string => {
  switch (status) {
    case 'idle': return ''
    case 'paused': return 'paused'
    case 'done': return 'done'
    case 'error': return 'error'
    default: return 'running'
  }
}

const getStatusText = (status: Progress['status']): string => {
  switch (status) {
    case 'idle': return 'Ready'
    case 'selecting': return 'Selecting photos…'
    case 'deleting': return 'Deleting batch…'
    case 'scrolling': return 'Loading more…'
    case 'paused': return 'Paused'
    case 'done': return 'Complete!'
    case 'error': return 'Error'
    default: return status
  }
}

;(async () => {
  const panel = createPanel()
  let engine: DeleteEngine | null = null
  let state: 'idle' | 'running' | 'paused' = 'idle'
  const MAX_COUNT = 10_000

  const $deleted = panel.querySelector('.gpdt-deleted') as HTMLElement
  const $speed = panel.querySelector('.gpdt-speed') as HTMLElement
  const $elapsed = panel.querySelector('.gpdt-elapsed') as HTMLElement
  const $eta = panel.querySelector('.gpdt-eta') as HTMLElement
  const $dot = panel.querySelector('.gpdt-status-dot') as HTMLElement
  const $statusText = panel.querySelector('.gpdt-status-text') as HTMLElement
  const $progressFill = panel.querySelector('.gpdt-progress-fill') as HTMLElement
  const $progressLabel = panel.querySelector('.gpdt-progress-label') as HTMLElement
  const $startBtn = panel.querySelector('.gpdt-start-btn') as HTMLButtonElement
  const $pauseBtn = panel.querySelector('.gpdt-pause-btn') as HTMLButtonElement
  const $resumeBtn = panel.querySelector('.gpdt-resume-btn') as HTMLButtonElement
  const $stopBtn = panel.querySelector('.gpdt-stop-btn') as HTMLButtonElement
  const $minimize = panel.querySelector('.gpdt-minimize') as HTMLButtonElement
  const $close = panel.querySelector('.gpdt-close') as HTMLButtonElement

  const setUIState = (newState: 'idle' | 'running' | 'paused'): void => {
    state = newState
    $startBtn.classList.toggle('gpdt-hidden', state !== 'idle')
    $pauseBtn.classList.toggle('gpdt-hidden', state !== 'running')
    $resumeBtn.classList.toggle('gpdt-hidden', state !== 'paused')
    $stopBtn.classList.toggle('gpdt-hidden', state === 'idle')
  }

  const updateUI = (progress: Progress): void => {
    $deleted.textContent = progress.deleted.toLocaleString()

    const elapsed = Date.now() - progress.startedAt
    $elapsed.textContent = formatElapsed(elapsed)

    if (progress.deleted > 0 && elapsed > 0) {
      const rate = Math.round(progress.deleted / (elapsed / 60_000))
      $speed.textContent = rate.toLocaleString()

      const remaining = MAX_COUNT - progress.deleted
      if (remaining > 0 && rate > 0) {
        const etaMs = (remaining / rate) * 60_000
        $eta.textContent = formatEta(etaMs)
      } else {
        $eta.textContent = '—'
      }
    }

    // Progress bar
    const pct = Math.min(100, (progress.deleted / MAX_COUNT) * 100)
    $progressFill.style.width = `${pct}%`
    $progressLabel.textContent = `${Math.round(pct)}%`

    $dot.className = `gpdt-status-dot ${getStatusClass(progress.status)}`
    $statusText.textContent = getStatusText(progress.status)

    if (progress.status === 'done' || progress.status === 'error' || progress.status === 'idle') {
      setUIState('idle')
    } else if (progress.status === 'paused') {
      setUIState('paused')
    }
  }

  const start = async (): Promise<void> => {
    setUIState('running')
    $speed.textContent = '—'
    $deleted.textContent = '0'
    $elapsed.textContent = '0s'
    $eta.textContent = '—'
    $progressFill.style.width = '0%'
    $progressLabel.textContent = '0%'

    engine = new DeleteEngine({ maxCount: MAX_COUNT }, updateUI)
    const result = await engine.run()

    console.log(
      `[GPDT] Done — ${result.deleted} photos deleted in ${formatElapsed(Date.now() - result.startedAt)}`,
    )
  }

  const pause = (): void => {
    engine?.pause()
    setUIState('paused')
  }

  const resume = (): void => {
    engine?.resume()
    setUIState('running')
  }

  const stop = (): void => {
    engine?.stop()
    engine = null
    setUIState('idle')
  }

  $startBtn.addEventListener('click', () => void start())
  $pauseBtn.addEventListener('click', pause)
  $resumeBtn.addEventListener('click', resume)
  $stopBtn.addEventListener('click', stop)

  $minimize.addEventListener('click', () => {
    panel.classList.add('minimized')
  })

  panel.addEventListener('click', (e) => {
    if (panel.classList.contains('minimized') && e.target === panel.querySelector('.gpdt-mini-icon')) {
      panel.classList.remove('minimized')
    }
  })

  $close.addEventListener('click', () => {
    stop()
    panel.remove()
  })
})()
