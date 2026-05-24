import './popup.css'
import { formatElapsed, formatEta } from '../../core/utils'
import {
  LOCALES,
  detectBrowserLocale,
  setLocale,
  getLocale,
  t,
  applyTranslations,
  type LocaleCode,
} from './i18n'
import { mountIcon } from './icons'

// ─── DOM Elements ────────────────────────────────────────────────

const maxCountInput   = document.getElementById('max-count')      as HTMLInputElement
const dryRunInput     = document.getElementById('dry-run')        as HTMLInputElement
const startBtn        = document.getElementById('start-btn')      as HTMLButtonElement
const pauseBtn        = document.getElementById('pause-btn')      as HTMLButtonElement
const resumeBtn       = document.getElementById('resume-btn')     as HTMLButtonElement
const stopBtn         = document.getElementById('stop-btn')       as HTMLButtonElement
const statusDot       = document.getElementById('status-dot')     as HTMLElement
const statusText      = document.getElementById('status-text')    as HTMLElement
const errorBar        = document.getElementById('error')          as HTMLElement
const errorText       = document.getElementById('error-text')     as HTMLElement
const progressFill    = document.getElementById('progress-fill')  as HTMLElement
const progressLabel   = document.getElementById('progress-label') as HTMLElement
const statDeleted     = document.getElementById('stat-deleted')   as HTMLElement
const statRate        = document.getElementById('stat-rate')      as HTMLElement
const statElapsed     = document.getElementById('stat-elapsed')   as HTMLElement
const statEta         = document.getElementById('stat-eta')       as HTMLElement
const settingsPanel   = document.getElementById('settings-panel') as HTMLElement
const noteEl          = document.getElementById('note')           as HTMLElement
const langTrigger     = document.getElementById('lang-trigger')   as HTMLButtonElement
const langMenu        = document.getElementById('lang-menu')      as HTMLUListElement
const langCodeLabel   = document.getElementById('lang-code')      as HTMLElement

// ─── Icon mounting (static set, attached once) ──────────────────

mountIcon('brand-icon',      'trash')
mountIcon('lang-icon',       'language')
mountIcon('lang-chevron',    'chevronDown')
mountIcon('error-icon',      'alertTriangle')
mountIcon('settings-icon',   'settings')
mountIcon('field-icon-max',  'hash')
mountIcon('field-icon-dry',  'flask')
mountIcon('start-icon',      'play')
mountIcon('pause-icon',      'pause')
mountIcon('resume-icon',     'play')
mountIcon('stop-icon',       'stop')

// ─── State ──────────────────────────────────────────────────────

type UIState = 'idle' | 'running' | 'paused'
let uiState: UIState = 'idle'
let startedAt = 0
let elapsedTimer: ReturnType<typeof setInterval> | null = null

// ─── Locale init (must happen before applyTranslations) ─────────

function pickInitialLocale(stored: string | undefined): LocaleCode {
  if (stored) {
    const known = LOCALES.find(l => l.code === stored)
    if (known) return known.code
  }
  return detectBrowserLocale()
}

function updateLangTriggerLabel(): void {
  langCodeLabel.textContent = getLocale().toUpperCase()
}

function renderLangMenu(): void {
  langMenu.replaceChildren(
    ...LOCALES.map(locale => {
      const li = document.createElement('li')
      li.className = 'lang-option'
      li.setAttribute('role', 'option')
      li.dataset.code = locale.code
      if (locale.code === getLocale()) li.setAttribute('aria-selected', 'true')

      const label = document.createElement('span')
      label.className = 'lang-option-label'
      label.textContent = locale.label

      const code = document.createElement('span')
      code.className = 'lang-option-code'
      code.textContent = locale.code.toUpperCase()

      li.append(label, code)
      li.addEventListener('click', () => {
        applyLocale(locale.code)
        closeLangMenu()
      })
      return li
    }),
  )
}

function applyLocale(code: LocaleCode): void {
  setLocale(code)
  document.documentElement.lang = code
  applyTranslations()
  updateLangTriggerLabel()
  renderLangMenu()
  refreshStatusLabel()
  chrome.storage.local.set({ locale: code })
}

function openLangMenu(): void {
  langMenu.classList.remove('hidden')
  langTrigger.setAttribute('aria-expanded', 'true')
}
function closeLangMenu(): void {
  langMenu.classList.add('hidden')
  langTrigger.setAttribute('aria-expanded', 'false')
}
function toggleLangMenu(): void {
  if (langMenu.classList.contains('hidden')) openLangMenu()
  else closeLangMenu()
}

langTrigger.addEventListener('click', (e) => {
  e.stopPropagation()
  toggleLangMenu()
})
document.addEventListener('click', (e) => {
  if (!langMenu.classList.contains('hidden') &&
      !langMenu.contains(e.target as Node) &&
      !langTrigger.contains(e.target as Node)) {
    closeLangMenu()
  }
})
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !langMenu.classList.contains('hidden')) closeLangMenu()
})

// ─── Settings persistence ───────────────────────────────────────

chrome.storage.local.get(['maxCount', 'dryRun', 'locale'], (data) => {
  const code = pickInitialLocale(data.locale)
  applyLocale(code)

  if (data.maxCount) maxCountInput.value = String(data.maxCount)
  if (data.dryRun) dryRunInput.checked = true
})

const saveSettings = (): void => {
  chrome.storage.local.set({
    maxCount: parseInt(maxCountInput.value, 10) || 10_000,
    dryRun: dryRunInput.checked,
  })
}

// ─── Content-script communication (unchanged protocol) ──────────

const sendToContent = async (message: Record<string, unknown>): Promise<unknown> => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id || !tab.url?.includes('photos.google.com')) {
    showNote(t('notes.navigateFirst'))
    return null
  }
  hideNote()
  return chrome.tabs.sendMessage(tab.id, message)
}

// ─── UI state ───────────────────────────────────────────────────

const setUIState = (state: UIState): void => {
  uiState = state

  startBtn.classList.toggle('hidden',  state !== 'idle')
  pauseBtn.classList.toggle('hidden',  state !== 'running')
  resumeBtn.classList.toggle('hidden', state !== 'paused')
  stopBtn.classList.toggle('hidden',   state === 'idle')

  maxCountInput.disabled = state !== 'idle'
  dryRunInput.disabled   = state !== 'idle'
  settingsPanel.classList.toggle('disabled', state !== 'idle')

  if (state === 'running') startElapsedTimer()
  else if (state === 'idle') stopElapsedTimer()
}

const showNote  = (text: string): void => { noteEl.textContent = text; noteEl.classList.remove('hidden') }
const hideNote  = (): void => { noteEl.classList.add('hidden') }
const showError = (msg: string): void => { errorText.textContent = msg; errorBar.classList.remove('hidden') }
const hideError = (): void => { errorBar.classList.add('hidden') }

// ─── Elapsed timer ──────────────────────────────────────────────

const startElapsedTimer = (): void => {
  stopElapsedTimer()
  elapsedTimer = setInterval(() => {
    if (startedAt > 0) statElapsed.textContent = formatElapsed(Date.now() - startedAt)
  }, 1000)
}
const stopElapsedTimer = (): void => {
  if (elapsedTimer !== null) { clearInterval(elapsedTimer); elapsedTimer = null }
}

// ─── Button handlers (unchanged protocol) ───────────────────────

startBtn.addEventListener('click', async () => {
  const maxCount = parseInt(maxCountInput.value, 10) || 10_000
  const dryRun   = dryRunInput.checked
  saveSettings()
  hideError()

  await sendToContent({ action: 'start', maxCount, dryRun })
  startedAt = Date.now()
  setUIState('running')
})

pauseBtn .addEventListener('click', async () => { await sendToContent({ action: 'pause' });  setUIState('paused')  })
resumeBtn.addEventListener('click', async () => { await sendToContent({ action: 'resume' }); setUIState('running') })
stopBtn  .addEventListener('click', async () => { await sendToContent({ action: 'stop' });   setUIState('idle')    })

// ─── Resume state from content script ───────────────────────────

sendToContent({ action: 'status' }).then((res: unknown) => {
  if (!res) return
  const status = res as { running: boolean; paused: boolean }
  if (status.paused) setUIState('paused')
  else if (status.running) setUIState('running')
})

// ─── Progress updates ───────────────────────────────────────────

let lastStatus: string = 'idle'

const STATUS_DOT: Record<string, string> = {
  selecting: 'running',
  deleting:  'running',
  scrolling: 'running',
  paused:    'paused',
  done:      'done',
  error:     'error',
  idle:      '',
}

function refreshStatusLabel(): void {
  const key = `status.${lastStatus}` as const
  statusText.textContent = t(key)
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type !== 'progress') return

  const { deleted, status, startedAt: msgStartedAt, error } = message.data
  const maxCount = parseInt(maxCountInput.value, 10) || 10_000

  if (msgStartedAt && startedAt === 0) startedAt = msgStartedAt

  lastStatus = String(status)
  refreshStatusLabel()
  statusDot.className = `status-dot ${STATUS_DOT[status] ?? ''}`.trim()

  if (error) showError(error); else hideError()

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

    const remaining = maxCount - deleted
    if (remaining > 0 && rate > 0) {
      statEta.textContent = formatEta((remaining / rate) * 60_000)
    } else {
      statEta.textContent = '—'
    }
  }

  // State transitions
  if (status === 'done' || status === 'error') setUIState('idle')
  else if (status === 'paused') setUIState('paused')
  else if (uiState !== 'running' && status !== 'idle') setUIState('running')
})

// Re-apply locale-dependent strings whenever the popup is shown after
// having been built from `applyLocale`. (Defensive; not strictly needed.)
applyTranslations()
