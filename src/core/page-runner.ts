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
import { runEmptyTrashFlow, type EmptyTrashDeps, type EmptyTrashStatus } from './empty-trash'
import { findConfirmButton, findConfirmDialog, findEmptyTrashButton, isTrashEmpty } from './selectors'
import { sleep } from './utils'
import { buildDiagnosticIssueUrl, diagnostics } from './diagnostics'
import { verifyLicense } from './license'
import { classifyLabel, type PhotoFilter, type PhotoType } from './photo-filter'
import type { RunStatus } from './status'
import {
  CONSENT_KEY,
  EMPTY_TRASH_ACK_KEY,
  admitConcurrentStart,
  admitDestructiveRun,
  readLocalAcknowledgement,
  shouldNavigateToEmptyTrash,
  throwForDestructiveRefusal,
  writeLocalAcknowledgement,
} from './consent'
import { RunInProgressError, StopRequested, waitUntilAbortable } from './run-occupancy'

export { ConsentRequiredError, PermanentActionRequiredError } from './consent'
export { RunInProgressError }

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

const LICENSE_KEY = 'gpdt_pro_token_v3'

type EmptyTrashHost = (deps: Pick<EmptyTrashDeps, 'waitFor' | 'sleep' | 'log' | 'onStatus'>) => Promise<void>

export class PageRunner {
  private engine: DeleteEngine | null = null
  private running = false
  private emptyTrashStopped = false
  private progress: Progress | null = null
  private statusListeners = new Set<(s: RunnerStatus) => void>()
  private summary: DryRunSummary | null = null
  private readonly dom: EngineDom
  private readonly baton: EmptyTrashBaton
  private readonly runEmptyTrash: EmptyTrashHost

  constructor(opts: {
    dom?: EngineDom
    baton?: EmptyTrashBaton
    runEmptyTrash?: EmptyTrashHost
  } = {}) {
    this.dom = opts.dom ?? browserDom
    this.baton = opts.baton ?? createLocalStorageBaton()
    this.runEmptyTrash = opts.runEmptyTrash ?? ((deps) => runEmptyTrashFlow({
      findEmptyTrashButton,
      findConfirmDialog,
      findConfirmButton,
      isTrashEmpty,
      ...deps,
    }))
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
    const ack = readLocalAcknowledgement(CONSENT_KEY)
    return ack.readable && ack.acknowledged
  }

  acknowledgeConsent(): void {
    writeLocalAcknowledgement(CONSENT_KEY)
  }

  /**
   * Permanent empty-trash acknowledgement — the second, explicit
   * acknowledgement recorded when the user confirms the permanent-action
   * warning while the "Empty trash afterwards" option is selected.
   * Required (alongside the general consent) for any non-dry run that
   * chains into the permanent empty-trash flow.
   */
  emptyTrashAcknowledged(): boolean {
    const ack = readLocalAcknowledgement(EMPTY_TRASH_ACK_KEY)
    return ack.readable && ack.acknowledged
  }

  acknowledgeEmptyTrash(): void {
    writeLocalAcknowledgement(EMPTY_TRASH_ACK_KEY)
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
    if (!admitConcurrentStart(this.running).ok) throw new RunInProgressError()
    const admission = admitDestructiveRun({
      dryRun: opts.dryRun,
      emptyTrashAfter: opts.emptyTrashAfter,
      consent: readLocalAcknowledgement(CONSENT_KEY),
      emptyTrashAck: readLocalAcknowledgement(EMPTY_TRASH_ACK_KEY),
    })
    if (!admission.ok) throwForDestructiveRefusal(admission.reason)
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
      if (shouldNavigateToEmptyTrash({
        dryRun: opts.dryRun,
        emptyTrashAfter: opts.emptyTrashAfter,
        stopped: engine.isStopped,
        status: result.status,
        deleted: result.deleted,
      })) {
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
    this.emptyTrashStopped = true
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
    if (this.running) return

    const pending = await this.baton.readPending()
    await this.baton.clearPending()
    const evalResult = evaluatePendingEmptyTrash(pending, Date.now(), this.dom.pathname)
    if (!evalResult.shouldRun) return

    if (this.emptyTrashStopped) {
      this.emptyTrashStopped = false
      return
    }

    this.running = true
    this.setProgress({ deleted: 0, selected: 0, status: 'emptyingTrash', startedAt: Date.now() })
    try {
      await this.runEmptyTrash({
        waitFor: (cond, timeoutMs) =>
          waitUntilAbortable(cond, timeoutMs, 400, () => this.emptyTrashStopped),
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
      })
    } catch (err) {
      if (err instanceof StopRequested) {
        this.setProgress({
          deleted: 0,
          selected: 0,
          status: 'idle',
          startedAt: Date.now(),
        })
        return
      }
      /* already reported via onStatus */
    } finally {
      this.running = false
      this.emptyTrashStopped = false
      this.emit()
    }
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
