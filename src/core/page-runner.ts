/**
 * In-page runner for the floating panel (userscript / standalone).
 *
 * Owns the engine lifecycle, the localStorage storage baton (empty-trash
 * after a run survives the /trash navigation), consent, the Pro license
 * state, and the dry-run summary used by the report/export features.
 * The extension does NOT use this — it uses message passing (content.ts).
 */
import { DeleteEngine, type Progress } from './delete-engine'
import { browserDom } from './browser-dom'
import type { EngineDom } from './dom-adapter'
import { createLocalStorageBaton, evaluatePendingEmptyTrash, TRASH_URL, type EmptyTrashBaton } from './empty-trash-baton'
import { runEmptyTrashFlow, type EmptyTrashStatus } from './empty-trash'
import { findConfirmButton, findConfirmDialog, findEmptyTrashButton, isTrashEmpty } from './selectors'
import { sleep, waitUntil } from './utils'
import { buildDiagnosticIssueUrl, diagnostics } from './diagnostics'
import { verifyLicense } from './license'
import { classifyLabel, type PhotoFilter, type PhotoType } from './photo-filter'
import type { RunStatus } from './status'

export interface PanelRunOptions {
  maxCount: number
  dryRun: boolean
  emptyTrashAfter: boolean
  filter: PhotoFilter
}

export interface RunnerStatus {
  running: boolean
  paused: boolean
  progress: Progress | null
  rate: number
}

export interface DryRunSummary {
  total: number
  counts: Record<PhotoType, number>
}

const CONSENT_KEY = 'gpdt_consent_v3'
const LICENSE_KEY = 'gpdt_pro_token_v3'

export class ConsentRequiredError extends Error {
  constructor() {
    super('consent required before a destructive run')
    this.name = 'ConsentRequiredError'
  }
}

export class PageRunner {
  private engine: DeleteEngine | null = null
  private running = false
  private progress: Progress | null = null
  private statusListeners = new Set<(s: RunnerStatus) => void>()
  private summary: DryRunSummary | null = null
  private readonly dom: EngineDom
  private readonly baton: EmptyTrashBaton

  constructor(opts: { dom?: EngineDom; baton?: EmptyTrashBaton } = {}) {
    this.dom = opts.dom ?? browserDom
    this.baton = opts.baton ?? createLocalStorageBaton()
  }

  // ─── Status broadcast ─────────────────────────────────────────

  getStatus(): RunnerStatus {
    return {
      running: this.running,
      paused: this.engine?.isPaused ?? false,
      progress: this.progress ? { ...this.progress } : null,
      rate: this.engine ? this.engine.log.ratePerMinute() : 0,
    }
  }

  onUpdate(cb: (s: RunnerStatus) => void): () => void {
    this.statusListeners.add(cb)
    cb(this.getStatus())
    return () => this.statusListeners.delete(cb)
  }

  private emit(): void {
    const snapshot = this.getStatus()
    for (const cb of this.statusListeners) cb(snapshot)
  }

  private setProgress(p: Progress): void {
    this.progress = { ...p }
    this.emit()
  }

  // ─── Consent ──────────────────────────────────────────────────

  consentAcknowledged(): boolean {
    try {
      return window.localStorage.getItem(CONSENT_KEY) === '1'
    } catch {
      return false
    }
  }

  acknowledgeConsent(): void {
    try {
      window.localStorage.setItem(CONSENT_KEY, '1')
    } catch {
      /* storage unavailable — consent re-asked next time */
    }
  }

  // ─── Pro license ──────────────────────────────────────────────

  getLicenseToken(): string | null {
    try {
      return window.localStorage.getItem(LICENSE_KEY)
    } catch {
      return null
    }
  }

  async isPro(): Promise<boolean> {
    const token = this.getLicenseToken()
    if (!token) return false
    return (await verifyLicense(token)).ok
  }

  /** Returns true when the token was accepted (locally verified). */
  async setLicenseToken(token: string): Promise<boolean> {
    const result = await verifyLicense(token)
    if (!result.ok) return false
    try {
      window.localStorage.setItem(LICENSE_KEY, token.trim())
    } catch {
      return false
    }
    return true
  }

  clearLicenseToken(): void {
    try {
      window.localStorage.removeItem(LICENSE_KEY)
    } catch {
      /* ignore */
    }
  }

  // ─── Run lifecycle ────────────────────────────────────────────

  async start(opts: PanelRunOptions): Promise<void> {
    if (this.running) return
    if (!opts.dryRun && !this.consentAcknowledged()) throw new ConsentRequiredError()
    this.running = true
    this.summary = null
    this.progress = null
    this.emit()

    const engine = new DeleteEngine({
      dom: this.dom,
      config: { maxCount: opts.maxCount, dryRun: opts.dryRun },
      filter: opts.filter,
      onProgress: (p) => {
        this.progress = { ...p }
        this.emit()
      },
    })
    this.engine = engine

    try {
      const result = await engine.run()
      if (opts.dryRun && !engine.isStopped && result.status === 'done') {
        this.summary = this.buildDryRunSummary(engine.getDryRunLabels())
      }

      // Empty-trash chain: only after a clean, real run that deleted ≥1.
      if (
        !opts.dryRun &&
        opts.emptyTrashAfter &&
        !engine.isStopped &&
        result.status === 'done' &&
        result.deleted > 0
      ) {
        const ok = await this.baton.writePending()
        if (ok) {
          this.setProgress({
            deleted: result.deleted,
            selected: 0,
            status: 'navigatingTrash',
            startedAt: result.startedAt,
          })
          await sleep(100)
          window.location.href = TRASH_URL
        }
      }
    } finally {
      this.engine = null
      this.running = false
      this.emit()
    }
  }

  pause(): void {
    this.engine?.pause()
  }

  resume(): void {
    this.engine?.resume()
  }

  stop(): void {
    this.engine?.stop()
  }

  getSummary(): DryRunSummary | null {
    return this.summary
  }

  private buildDryRunSummary(labels: readonly string[]): DryRunSummary {
    const counts: Record<PhotoType, number> = {
      photo: 0,
      video: 0,
      screenshot: 0,
      animation: 0,
      collage: 0,
      unknown: 0,
    }
    for (const label of labels) {
      counts[classifyLabel(label)] += 1
    }
    return { total: labels.length, counts }
  }

  /**
   * Boot-time empty-trash consumption. Called on every page load; the
   * pending flag is always cleared on first sight and only acted on when
   * fresh AND on /trash (see evaluatePendingEmptyTrash).
   */
  async maybeRunPendingEmptyTrash(): Promise<void> {
    const pending = await this.baton.readPending()
    await this.baton.clearPending()
    const evalResult = evaluatePendingEmptyTrash(pending, Date.now(), this.dom.pathname)
    if (!evalResult.shouldRun) return

    this.setProgress({ deleted: 0, selected: 0, status: 'emptyingTrash', startedAt: Date.now() })
    await runEmptyTrashFlow({
      findEmptyTrashButton,
      findConfirmDialog,
      findConfirmButton,
      isTrashEmpty,
      waitFor: (cond, timeoutMs) => waitUntil(cond, timeoutMs, 400),
      sleep,
      log: (msg) => console.log(`[gpdt:runner] ${msg}`),
      onStatus: (status: EmptyTrashStatus, extra?: { error?: string }) => {
        this.setProgress({
          deleted: 0,
          selected: 0,
          status: status as RunStatus,
          startedAt: Date.now(),
          error: extra?.error,
        })
      },
    }).catch(() => { /* already reported via onStatus */ })
    this.emit()
  }

  // ─── Diagnostics / issue reports ──────────────────────────────

  /**
   * Build a GitHub issue URL carrying the diagnostic blob. The blob is
   * truncated defensively so the URL stays far below browser limits.
   */
  buildIssueUrl(): string {
    return buildDiagnosticIssueUrl(diagnostics.blob())
  }

  /** Copy a short human-readable summary of the last dry-run. */
  copySummaryText(): string {
    const s = this.summary
    if (!s) return 'No dry-run report yet.'
    const parts = [`Google Photos Delete Tool — dry-run: ${s.total} item(s) found`]
    for (const type of ['screenshot', 'video', 'animation', 'collage', 'photo', 'unknown'] as const) {
      if (s.counts[type] > 0) parts.push(`${type}: ${s.counts[type]}`)
    }
    return parts.join('\n')
  }

  /** Pro: full CSV of the last dry-run labels. */
  exportCsv(): void {
    const engine = this.engine
    if (!engine) return
    const labels = engine.getDryRunLabels()
    if (labels.length === 0) return
    const rows = ['label', ...labels.map(l => `"${l.replace(/"/g, '""')}"`)].join('\n')
    const blob = new Blob([rows], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `gpdt-dry-run-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }
}
