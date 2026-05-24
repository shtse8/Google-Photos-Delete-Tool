import './popup.css'
import { formatElapsed } from '../../core/utils'
import {
  LOCALES,
  detectBrowserLocale,
  setLocale,
  getLocale,
  t,
  tHtml,
  applyTranslations,
  type LocaleCode,
  type I18nParams,
} from './i18n'
import { mountIcon } from './icons'

const LOG = '[gpdt:popup]'

// ─── DOM Elements ────────────────────────────────────────────────

const maxCountInput   = document.getElementById('max-count')      as HTMLInputElement
const dryRunInput     = document.getElementById('dry-run')        as HTMLInputElement
const emptyTrashInput = document.getElementById('empty-trash')    as HTMLInputElement
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

mountIcon('brand-icon',      'brandGooglePhotos')
mountIcon('lang-icon',       'language')
mountIcon('lang-chevron',    'chevronDown')
mountIcon('error-icon',      'alertTriangle')
mountIcon('settings-icon',   'settings')
mountIcon('field-icon-max',  'hash')
mountIcon('field-icon-dry',  'flask')
mountIcon('field-icon-empty','trashX')
mountIcon('start-icon',      'play')
mountIcon('pause-icon',      'pause')
mountIcon('resume-icon',     'play')
mountIcon('stop-icon',       'stop')

// ─── State ──────────────────────────────────────────────────────

type UIState = 'idle' | 'running' | 'paused'
let uiState: UIState = 'idle'
let startedAt = 0
let elapsedTimer: ReturnType<typeof setInterval> | null = null

// ─── Locale init ────────────────────────────────────────────────

function pickInitialLocale(stored: unknown): LocaleCode {
  if (typeof stored === 'string') {
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
    ...LOCALES.map((locale, idx) => {
      const li = document.createElement('li')
      li.className = 'lang-option'
      li.setAttribute('role', 'option')
      li.tabIndex = -1 // focus is moved programmatically
      li.dataset.code = locale.code
      li.dataset.idx = String(idx)
      if (locale.code === getLocale()) li.setAttribute('aria-selected', 'true')

      const label = document.createElement('span')
      label.className = 'lang-option-label'
      label.textContent = locale.label

      const code = document.createElement('span')
      code.className = 'lang-option-code'
      code.textContent = locale.code.toUpperCase()

      li.append(label, code)
      li.addEventListener('click', () => commitLocale(locale.code))
      return li
    }),
  )
}

function commitLocale(code: LocaleCode): void {
  applyLocale(code)
  closeLangMenu()
  langTrigger.focus()
}

function applyLocale(code: LocaleCode): void {
  setLocale(code)
  document.documentElement.lang = code
  applyTranslations(document, paramsFor)
  updateLangTriggerLabel()
  renderLangMenu()
  refreshStatusLabel()
  renderNote()
  chrome.storage.local.set({ locale: code }).catch(err =>
    console.warn(`${LOG} could not persist locale:`, err),
  )
}

// ─── Language menu (with keyboard a11y) ─────────────────────────

function getOptions(): HTMLElement[] {
  return [...langMenu.querySelectorAll<HTMLElement>('.lang-option')]
}

function focusOptionByIndex(idx: number): void {
  const opts = getOptions()
  if (opts.length === 0) return
  const wrapped = ((idx % opts.length) + opts.length) % opts.length
  opts[wrapped].focus()
}

function openLangMenu(): void {
  langMenu.classList.remove('hidden')
  langTrigger.setAttribute('aria-expanded', 'true')
  // Move focus to the currently-selected option (or first) so arrow
  // keys take over from here.
  const opts = getOptions()
  const selectedIdx = opts.findIndex(o => o.getAttribute('aria-selected') === 'true')
  focusOptionByIndex(selectedIdx >= 0 ? selectedIdx : 0)
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

// Close on outside click.
document.addEventListener('click', (e) => {
  if (langMenu.classList.contains('hidden')) return
  const target = e.target as Node
  if (!langMenu.contains(target) && !langTrigger.contains(target)) {
    closeLangMenu()
  }
})

// Keyboard navigation while the menu is open. Listening on the menu
// itself means focus must be inside (`openLangMenu` moves it in);
// Escape is handled globally so any focus location can dismiss.
langMenu.addEventListener('keydown', (e) => {
  const opts = getOptions()
  const focused = document.activeElement as HTMLElement | null
  const idx = focused ? opts.indexOf(focused) : -1

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault()
      focusOptionByIndex(idx + 1)
      break
    case 'ArrowUp':
      e.preventDefault()
      focusOptionByIndex(idx - 1)
      break
    case 'Home':
      e.preventDefault()
      focusOptionByIndex(0)
      break
    case 'End':
      e.preventDefault()
      focusOptionByIndex(opts.length - 1)
      break
    case 'Enter':
    case ' ': {
      e.preventDefault()
      const code = focused?.dataset.code as LocaleCode | undefined
      if (code) commitLocale(code)
      break
    }
    case 'Tab':
      // Let Tab move focus naturally, but close the menu so it's not
      // left visible behind the user.
      closeLangMenu()
      break
  }
})

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !langMenu.classList.contains('hidden')) {
    e.preventDefault()
    closeLangMenu()
    langTrigger.focus()
  }
})

// ─── Settings persistence ───────────────────────────────────────

/**
 * Read the maxCount input. Any non-finite / zero / negative input is
 * replaced by the project default (500) — the engine needs a positive
 * batch size to do anything.
 */
const readMaxCount = (): number => {
  const parsed = parseInt(maxCountInput.value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 500
}

const saveSettings = (): void => {
  chrome.storage.local.set({
    maxCount: readMaxCount(),
    dryRun: dryRunInput.checked,
    emptyTrash: emptyTrashInput.checked,
  }).catch(err => console.warn(`${LOG} settings persist failed:`, err))
}

// Persist on every change so the user's preferences survive a close
// even if they never click Start.
maxCountInput.addEventListener('change', saveSettings)
dryRunInput.addEventListener('change', () => {
  saveSettings()
  // Dry-run controls whether maxCount + emptyTrash are meaningful;
  // toggle their disabled state immediately so the user sees the
  // fields grey out / come back to life.
  refreshDryRunDependentFields()
})
emptyTrashInput.addEventListener('change', saveSettings)

chrome.storage.local.get(['maxCount', 'dryRun', 'emptyTrash', 'locale'], (data) => {
  // chrome.runtime.lastError must be observed inside the callback or
  // Chrome flags an "unchecked runtime.lastError" warning.
  const err = chrome.runtime.lastError
  if (err) {
    console.warn(`${LOG} storage.get failed, applying defaults:`, err)
    applyLocale(detectBrowserLocale())
  } else {
    applyLocale(pickInitialLocale(data?.locale))
    if (typeof data?.maxCount === 'number' && data.maxCount > 0) {
      maxCountInput.value = String(data.maxCount)
    }
    if (data?.dryRun) dryRunInput.checked = true
    if (data?.emptyTrash) emptyTrashInput.checked = true
  }
  // Apply the dry-run/maxCount linkage to the just-restored values.
  refreshDryRunDependentFields()

  // Once the locale is settled, query the content script for any
  // ongoing run so we can paint the right UI state from the start.
  void queryInitialStatus()
})

// ─── Content-script communication ───────────────────────────────

/**
 * Send a message to the photos.google.com content script for the
 * currently active tab. Returns `null` when the tab isn't on Google
 * Photos OR the content script isn't reachable yet (e.g. the page is
 * still loading). In both cases we show the "navigate first" note.
 */
const sendToContent = async (message: Record<string, unknown>): Promise<unknown> => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id || !tab.url?.includes('photos.google.com')) {
    showNote('notes.navigateFirst')
    return null
  }
  try {
    const res = await chrome.tabs.sendMessage(tab.id, message)
    hideNote()
    return res
  } catch (err) {
    // Most common cause: content script not injected yet (page
    // mid-navigation). Treat it like "navigate first" — the user
    // should reload or wait.
    console.warn(`${LOG} sendMessage rejected:`, err)
    showNote('notes.navigateFirst')
    return null
  }
}

// ─── UI state ───────────────────────────────────────────────────

const setUIState = (state: UIState): void => {
  uiState = state

  startBtn.classList.toggle('hidden',  state !== 'idle')
  pauseBtn.classList.toggle('hidden',  state !== 'running')
  resumeBtn.classList.toggle('hidden', state !== 'paused')
  stopBtn.classList.toggle('hidden',   state === 'idle')

  dryRunInput.disabled     = state !== 'idle'
  settingsPanel.classList.toggle('disabled', state !== 'idle')
  refreshDryRunDependentFields()

  if (state === 'running') startElapsedTimer()
  else if (state === 'idle') stopElapsedTimer()
}

/**
 * Two settings only make sense for real-delete runs:
 *
 *   - `maxCount` controls per-batch size; the dry-run scan ignores it.
 *   - `emptyTrash` runs after a real deletion to permanently clear
 *     the trash; in dry-run nothing is moved to trash, so the toggle
 *     is a no-op.
 *
 * Grey them both out whenever dry-run is checked so the user sees
 * which settings still apply. They're also disabled outright while
 * the engine is running, alongside the dry-run toggle itself.
 */
const refreshDryRunDependentFields = (): void => {
  const lockedByEngine = uiState !== 'idle'
  const lockedByDryRun = dryRunInput.checked
  maxCountInput.disabled   = lockedByEngine || lockedByDryRun
  emptyTrashInput.disabled = lockedByEngine || lockedByDryRun
}

/**
 * Trusted HTML fragments spliced into translated strings via the
 * `{name}` placeholder syntax. tHtml inserts these verbatim, so the
 * values MUST stay constant in this file (never user input).
 */
const I18N_HTML_PARAMS: Readonly<Record<string, I18nParams>> = {
  'notes.navigateFirst': {
    url: '<a href="https://photos.google.com/" target="_blank" rel="noopener">photos.google.com</a>',
  },
}

const paramsFor = (key: string): I18nParams | undefined => I18N_HTML_PARAMS[key]

/**
 * Re-render the currently-shown note for the active locale. The note
 * carries `data-note-key` (not `data-i18n`) so applyTranslations()
 * does not overwrite our innerHTML with plain textContent.
 */
const renderNote = (): void => {
  const key = noteEl.dataset.noteKey
  if (!key) return
  noteEl.innerHTML = tHtml(key, paramsFor(key))
}

const showNote = (key: string): void => {
  noteEl.dataset.noteKey = key
  renderNote()
  noteEl.classList.remove('hidden')
}
const hideNote = (): void => { noteEl.classList.add('hidden') }
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

// ─── Button handlers ────────────────────────────────────────────

startBtn.addEventListener('click', async () => {
  if (uiState !== 'idle') return // defensive — UI already hides the button, but guard against fast double-clicks too
  startBtn.disabled = true
  try {
    const maxCount        = readMaxCount()
    const dryRun          = dryRunInput.checked
    const emptyTrashAfter = emptyTrashInput.checked
    saveSettings()
    hideError()

    const res = await sendToContent({ action: 'start', maxCount, dryRun, emptyTrashAfter })
    if (res === null) return // not on photos.google.com; note already shown

    setUIState('running')
  } finally {
    startBtn.disabled = false
  }
})

pauseBtn .addEventListener('click', async () => { await sendToContent({ action: 'pause' });  setUIState('paused')  })
resumeBtn.addEventListener('click', async () => { await sendToContent({ action: 'resume' }); setUIState('running') })
stopBtn  .addEventListener('click', async () => { await sendToContent({ action: 'stop' });   setUIState('idle')    })

// ─── Resume state from content script ───────────────────────────

/**
 * Ask the content script whether the engine is already running in
 * this tab. Triggered from the storage callback so the locale is
 * already loaded — avoids painting status text in fallback English.
 *
 * Also hydrates the stats panel from the content script's cached
 * `lastProgress`: Chrome closes the popup whenever it loses focus
 * (e.g. the user clicks the gallery to watch the deletion happen),
 * and a freshly re-opened popup would otherwise display zeros even
 * for a completed 100-photo run.
 *
 * Guards against staleness: if the user already clicked Start (so
 * `uiState` is no longer `'idle'`) by the time the response arrives,
 * we ignore the answer rather than overwriting a fresh user action.
 */
async function queryInitialStatus(): Promise<void> {
  const res = await sendToContent({ action: 'status' })
  if (!res) return
  const status = res as {
    running: boolean
    paused: boolean
    progress?: ProgressMessageData | null
    progressAsOf?: number
  }

  if (status.progress) {
    if (typeof status.progressAsOf === 'number' && status.progressAsOf > 0) {
      progressAsOf = status.progressAsOf
    }
    applyProgressUpdate(status.progress)
  }

  if (uiState !== 'idle') return
  if (status.paused) setUIState('paused')
  else if (status.running) setUIState('running')
}

// ─── Progress updates ───────────────────────────────────────────

let lastStatus: string = 'idle'

/**
 * Map an engine status to the CSS modifier on the status-dot
 * element. Every status that means "actively working" (any spinner-
 * eligible phase) maps to `running` so the pulsing ring renders.
 */
const STATUS_DOT: Record<string, string> = {
  selecting:       'running',
  deleting:        'running',
  scrolling:       'running',
  navigatingTrash: 'running',
  emptyingTrash:   'running',
  paused:          'paused',
  done:            'done',
  error:           'error',
  idle:            '',
}

function refreshStatusLabel(): void {
  const key = `status.${lastStatus}` as const
  statusText.textContent = t(key)
}

/**
 * Statuses where the engine is actively making progress and the
 * progress bar should run its indeterminate animation.
 */
const ACTIVE_STATUSES = new Set<string>([
  'selecting', 'deleting', 'scrolling',
  'navigatingTrash', 'emptyingTrash',
])

/**
 * Terminal statuses — the engine has stopped emitting and elapsed
 * should snap to the run duration rather than keep ticking.
 */
const TERMINAL_STATUSES = new Set<string>(['done', 'error', 'idle'])

interface ProgressMessageData {
  deleted: number
  status: string
  startedAt?: number
  error?: string
}

/**
 * Wall-clock timestamp captured by the content script the moment it
 * last reported progress. Set by the initial-status query so we can
 * compute the actual run duration when the popup reopens after a
 * terminal state — `Date.now() - startedAt` would otherwise count up
 * forever past the moment the run ended.
 */
let progressAsOf = 0

function applyProgressUpdate(data: ProgressMessageData): void {
  const { deleted, status, startedAt: msgStartedAt, error } = data

  // Trust the engine's authoritative startedAt whenever it sends one.
  // The Start handler sets a local fallback value ~microseconds before
  // the content script's, but the engine's is the one that all rate /
  // ETA math should be anchored to.
  if (typeof msgStartedAt === 'number' && msgStartedAt > 0) {
    startedAt = msgStartedAt
  }

  lastStatus = String(status)
  refreshStatusLabel()
  statusDot.className = `status-dot ${STATUS_DOT[status] ?? ''}`.trim()

  if (error) showError(String(error))
  else hideError()

  // Progress bar — `maxCount` is a *batch* size, not a deletion target,
  // so we can't compute a meaningful percentage (the total is only
  // known once the gallery is exhausted). Show an indeterminate
  // animation while the engine is actively working, snap to full on
  // done, and reset to empty in idle/error states. The deleted count
  // is the meaningful number; it lives in the label.
  if (status === 'done') {
    progressFill.classList.remove('indeterminate')
    progressFill.style.width = '100%'
  } else if (ACTIVE_STATUSES.has(status) || status === 'paused') {
    progressFill.classList.add('indeterminate')
    progressFill.style.width = ''
  } else {
    progressFill.classList.remove('indeterminate')
    progressFill.style.width = '0%'
  }
  progressLabel.textContent = Number(deleted).toLocaleString()

  statDeleted.textContent = Number(deleted).toLocaleString()

  if (deleted > 0 && startedAt > 0) {
    // For terminal states, freeze elapsed at the duration the engine
    // actually ran (captured server-side as `progressAsOf`). Otherwise
    // Date.now() - startedAt would keep ticking forever after the run
    // ended, showing a wildly wrong elapsed when the popup is opened
    // long after the fact.
    const useAsOf = TERMINAL_STATUSES.has(status) && progressAsOf > 0
    const elapsed = useAsOf ? progressAsOf - startedAt : Date.now() - startedAt
    const rate = Math.round(deleted / (elapsed / 60_000))
    statRate.textContent = rate.toLocaleString()
    statElapsed.textContent = formatElapsed(elapsed)
    // ETA needs a fixed total to compute against, which we don't have:
    // `maxCount` is a per-batch number, and the gallery's true size is
    // only known once the run reaches end-of-list. Silence beats a
    // wrong number — leave the field at "—" while the engine works.
    statEta.textContent = '—'
  }

  // State transitions
  if (status === 'done' || status === 'error') setUIState('idle')
  else if (status === 'paused') setUIState('paused')
  else if (uiState !== 'running' && status !== 'idle') setUIState('running')
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== 'progress') return
  // Live progress updates from the content script — `asOf` doesn't
  // apply here (the moment we receive the message IS asOf). Reset it
  // so we don't accidentally freeze elapsed on a real-time `done`.
  progressAsOf = 0
  applyProgressUpdate(message.data)
})
