/**
 * Google Photos Delete Tool — Userscript (Tampermonkey / Violentmonkey / Greasemonkey)
 *
 * The metadata header is injected at build time by scripts/build.ts.
 */
import { DeleteEngine, type Progress, formatElapsed } from '../core'

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
    background: #1e1e1e;
    border: 1px solid #333;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    width: 260px;
    overflow: hidden;
    transition: all 0.2s ease;
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
    padding: 10px 12px;
    background: #252525;
    border-bottom: 1px solid #333;
  }
  .gpdt-title {
    font-weight: 600;
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
    padding: 2px 4px;
    border-radius: 4px;
    line-height: 1;
  }
  .gpdt-header-btns button:hover { color: #fff; background: #333; }
  .gpdt-content {
    padding: 12px;
  }
  .gpdt-stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-bottom: 12px;
  }
  .gpdt-stat {
    background: #2a2a2a;
    border-radius: 8px;
    padding: 8px 10px;
    text-align: center;
  }
  .gpdt-stat-value {
    font-size: 18px;
    font-weight: 700;
    color: #fff;
    line-height: 1.2;
  }
  .gpdt-stat-label {
    font-size: 10px;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .gpdt-status {
    text-align: center;
    font-size: 11px;
    color: #888;
    margin-bottom: 10px;
  }
  .gpdt-status .dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    margin-right: 6px;
    vertical-align: middle;
  }
  .gpdt-status .dot.idle { background: #666; }
  .gpdt-status .dot.running { background: #4caf50; animation: gpdt-pulse 1.5s infinite; }
  .gpdt-status .dot.done { background: #2196f3; }
  .gpdt-status .dot.error { background: #f44336; }
  @keyframes gpdt-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
  .gpdt-btn {
    width: 100%;
    padding: 10px;
    border: none;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }
  .gpdt-btn-start {
    background: #4caf50;
    color: #fff;
  }
  .gpdt-btn-start:hover { background: #43a047; }
  .gpdt-btn-stop {
    background: #f44336;
    color: #fff;
  }
  .gpdt-btn-stop:hover { background: #e53935; }
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
        <div class="gpdt-stats">
          <div class="gpdt-stat">
            <div class="gpdt-stat-value gpdt-deleted">0</div>
            <div class="gpdt-stat-label">Deleted</div>
          </div>
          <div class="gpdt-stat">
            <div class="gpdt-stat-value gpdt-speed">—</div>
            <div class="gpdt-stat-label">Per min</div>
          </div>
        </div>
        <div class="gpdt-status">
          <span class="dot idle"></span>
          <span class="gpdt-status-text">Ready</span>
        </div>
        <button class="gpdt-btn gpdt-btn-start gpdt-toggle">▶ Start</button>
      </div>
    </div>
  `
  document.body.appendChild(panel)
  return panel
}

const getStatusClass = (status: Progress['status']): string => {
  switch (status) {
    case 'idle': return 'idle'
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
    case 'done': return 'Complete!'
    case 'error': return 'Error'
    default: return status
  }
}

;(async () => {
  const panel = createPanel()
  let engine: DeleteEngine | null = null
  let running = false

  const $deleted = panel.querySelector('.gpdt-deleted') as HTMLElement
  const $speed = panel.querySelector('.gpdt-speed') as HTMLElement
  const $dot = panel.querySelector('.dot') as HTMLElement
  const $statusText = panel.querySelector('.gpdt-status-text') as HTMLElement
  const $toggle = panel.querySelector('.gpdt-toggle') as HTMLButtonElement
  const $minimize = panel.querySelector('.gpdt-minimize') as HTMLButtonElement
  const $close = panel.querySelector('.gpdt-close') as HTMLButtonElement

  const updateUI = (progress: Progress): void => {
    $deleted.textContent = progress.deleted.toLocaleString()

    const elapsed = Date.now() - progress.startedAt
    if (progress.deleted > 0 && elapsed > 0) {
      const rate = Math.round(progress.deleted / (elapsed / 60_000))
      $speed.textContent = rate.toLocaleString()
    }

    $dot.className = `dot ${getStatusClass(progress.status)}`
    $statusText.textContent = getStatusText(progress.status)

    if (progress.status === 'done' || progress.status === 'error' || progress.status === 'idle') {
      running = false
      $toggle.textContent = '▶ Start'
      $toggle.className = 'gpdt-btn gpdt-btn-start gpdt-toggle'
    }
  }

  const start = async (): Promise<void> => {
    running = true
    $toggle.textContent = '⏹ Stop'
    $toggle.className = 'gpdt-btn gpdt-btn-stop gpdt-toggle'
    $speed.textContent = '—'
    $deleted.textContent = '0'

    engine = new DeleteEngine({}, updateUI)
    const result = await engine.run()

    console.log(
      `[GPDT] Done — ${result.deleted} photos deleted in ${formatElapsed(Date.now() - result.startedAt)}`,
    )
  }

  const stop = (): void => {
    engine?.abort()
    running = false
    $toggle.textContent = '▶ Start'
    $toggle.className = 'gpdt-btn gpdt-btn-start gpdt-toggle'
  }

  $toggle.addEventListener('click', () => {
    if (running) stop()
    else void start()
  })

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
