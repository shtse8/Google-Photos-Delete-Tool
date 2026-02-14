import './popup.css'
import { formatElapsed, formatEta } from '../../core/utils'

// ─── DOM Elements ────────────────────────────────────────────────

const maxCountInput = document.getElementById('max-count') as HTMLInputElement
const dryRunInput = document.getElementById('dry-run') as HTMLInputElement
const startBtn = document.getElementById('start-btn') as HTMLButtonElement
const pauseBtn = document.getElementById('pause-btn') as HTMLButtonElement
const resumeBtn = document.getElementById('resume-btn') as HTMLButtonElement
const stopBtn = document.getElementById('stop-btn') as HTMLButtonElement
const statusDot = document.getElementById('status-dot') as HTMLElement
const statusText = document.getElementById('status-text') as HTMLElement
const errorBar = document.getElementById('error-bar') as HTMLElement
const errorText = document.getElementById('error-text') as HTMLElement
const progressFill = document.getElementById('progress-fill') as HTMLElement
const progressLabel = document.getElementById('progress-label') as HTMLElement
const statDeleted = document.getElementById('stat-deleted') as HTMLElement
const statRate = document.getElementById('stat-rate') as HTMLElement
const statElapsed = document.getElementById('stat-elapsed') as HTMLElement
const statEta = document.getElementById('stat-eta') as HTMLElement
const settingsPanel = document.getElementById('settings-panel') as HTMLElement
const noteEl = document.getElementById('note') as HTMLElement

// ─── State ───────────────────────────────────────────────────────

type UIState = 'idle' | 'running' | 'paused'
let uiState: UIState = 'idle'
let startedAt = 0
let elapsedTimer: ReturnType<typeof setInterval> | null = null

// ─── Settings Persistence ────────────────────────────────────────

chrome.storage.local.get(['maxCount', 'dryRun'], (data) => {
  if (data.maxCount) maxCountInput.value = String(data.maxCount)
  if (data.dryRun) dryRunInput.checked = true
})

const saveSettings = (): void => {
  chrome.storage.local.set({
    maxCount: parseInt(maxCountInput.value, 10) || 10_000,
    dryRun: dryRunInput.checked,
  })
}

// ─── Content Script Communication ────────────────────────────────

const sendToContent = async (message: Record<string, unknown>): Promise<unknown> => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id || !tab.url?.includes('photos.google.com')) {
    showNote('Navigate to photos.google.com first')
    return null
  }
  hideNote()
  return chrome.tabs.sendMessage(tab.id, message)
}

// ─── UI State Management ─────────────────────────────────────────

const setUIState = (state: UIState): void => {
  uiState = state

  // Button visibility
  startBtn.classList.toggle('hidden', state !== 'idle')
  pauseBtn.classList.toggle('hidden', state !== 'running')
  resumeBtn.classList.toggle('hidden', state !== 'paused')
  stopBtn.classList.toggle('hidden', state === 'idle')

  // Settings disabled during run
  maxCountInput.disabled = state !== 'idle'
  dryRunInput.disabled = state !== 'idle'
  settingsPanel.style.opacity = state !== 'idle' ? '0.5' : '1'

  // Elapsed timer
  if (state === 'running') {
    startElapsedTimer()
  } else if (state === 'idle') {
    stopElapsedTimer()
  }
}

const showNote = (text: string): void => {
  noteEl.textContent = text
  noteEl.classList.remove('hidden')
}

const hideNote = (): void => {
  noteEl.classList.add('hidden')
}

const showError = (message: string): void => {
  errorText.textContent = message
  errorBar.classList.remove('hidden')
}

const hideError = (): void => {
  errorBar.classList.add('hidden')
}

// ─── Elapsed Timer ───────────────────────────────────────────────

const startElapsedTimer = (): void => {
  stopElapsedTimer()
  elapsedTimer = setInterval(() => {
    if (startedAt > 0) {
      statElapsed.textContent = formatElapsed(Date.now() - startedAt)
    }
  }, 1000)
}

const stopElapsedTimer = (): void => {
  if (elapsedTimer !== null) {
    clearInterval(elapsedTimer)
    elapsedTimer = null
  }
}

// ─── Button Handlers ─────────────────────────────────────────────

startBtn.addEventListener('click', async () => {
  const maxCount = parseInt(maxCountInput.value, 10) || 10_000
  const dryRun = dryRunInput.checked
  saveSettings()
  hideError()

  await sendToContent({ action: 'start', maxCount, dryRun })
  startedAt = Date.now()
  setUIState('running')
})

pauseBtn.addEventListener('click', async () => {
  await sendToContent({ action: 'pause' })
  setUIState('paused')
})

resumeBtn.addEventListener('click', async () => {
  await sendToContent({ action: 'resume' })
  setUIState('running')
})

stopBtn.addEventListener('click', async () => {
  await sendToContent({ action: 'stop' })
  setUIState('idle')
})

// ─── Check if Already Running ────────────────────────────────────

sendToContent({ action: 'status' }).then((res: unknown) => {
  if (!res) return
  const status = res as { running: boolean; paused: boolean }
  if (status.paused) {
    setUIState('paused')
  } else if (status.running) {
    setUIState('running')
  }
})

// ─── Progress Updates from Content Script ────────────────────────

const STATUS_MAP: Record<string, { text: string; dot: string }> = {
  selecting: { text: '🔍 Selecting...', dot: 'running' },
  deleting: { text: '🗑️ Deleting...', dot: 'running' },
  scrolling: { text: '📜 Scrolling...', dot: 'running' },
  paused: { text: '⏸ Paused', dot: 'paused' },
  done: { text: '✅ Done!', dot: 'done' },
  error: { text: '❌ Error', dot: 'error' },
  idle: { text: '⏹ Idle', dot: '' },
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type !== 'progress') return

  const { deleted, status, startedAt: msgStartedAt, error } = message.data
  const maxCount = parseInt(maxCountInput.value, 10) || 10_000

  // Update started time
  if (msgStartedAt && startedAt === 0) {
    startedAt = msgStartedAt
  }

  // Status text & dot
  const statusInfo = STATUS_MAP[status] ?? { text: status, dot: '' }
  statusText.textContent = statusInfo.text
  statusDot.className = `status-dot ${statusInfo.dot}`

  // Error display
  if (error) {
    showError(error)
  }

  // Progress bar
  const pct = Math.min(100, (deleted / maxCount) * 100)
  progressFill.style.width = `${pct}%`
  progressLabel.textContent = `${Math.round(pct)}%`

  // Stats
  statDeleted.textContent = deleted.toLocaleString()

  if (deleted > 0 && msgStartedAt) {
    const elapsed = Date.now() - msgStartedAt
    const rate = Math.round(deleted / (elapsed / 60_000))
    statRate.textContent = rate.toLocaleString()
    statElapsed.textContent = formatElapsed(elapsed)

    // ETA
    const remaining = maxCount - deleted
    if (remaining > 0 && rate > 0) {
      const etaMs = (remaining / rate) * 60_000
      statEta.textContent = formatEta(etaMs)
    } else {
      statEta.textContent = '—'
    }
  }

  // State transitions
  if (status === 'done' || status === 'error') {
    setUIState('idle')
  } else if (status === 'paused') {
    setUIState('paused')
  } else if (uiState !== 'running' && status !== 'idle') {
    setUIState('running')
  }
})
