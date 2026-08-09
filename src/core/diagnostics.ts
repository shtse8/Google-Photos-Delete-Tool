/**
 * Bounded diagnostics collector.
 *
 * Every layer that touches the fragile Google Photos DOM records what it
 * observed (which selector matched, whether the counter fell back, whether
 * a checkbox flap was recovered). The "Report issue" control in the UI
 * serializes this into a structured GitHub issue body, converting
 * "it's broken" reports into actionable selector-drift data.
 */

import { PACK_VERSION } from './selector-pack'

export type SelectorMatchKind = 'primary' | 'fallback' | 'none'

export interface SelectorMatch {
  name: string
  matched: SelectorMatchKind
  /** Fallback selector that matched, when applicable. */
  fallback?: string
  count: number
}

export interface EngineSnapshot {
  status: string
  error?: string
  deleted: number
  selected: number
  counterFallbackUsed: boolean
  flapRecoveries: number
}

export interface DiagnosticBlob {
  packVersion: number
  url: string
  userAgent: string
  collectedAt: number
  selectorMatches: SelectorMatch[]
  engine?: EngineSnapshot
  /** Small sample of observed tile labels (first unique N). */
  labelsSample: string[]
}

const LABELS_SAMPLE_CAP = 20
const SELECTOR_MATCH_CAP = 64

class Diagnostics {
  private selectorMatches = new Map<string, SelectorMatch>()
  private engineSnapshot?: EngineSnapshot
  private labelsSample: string[] = []
  private labelsSeen = new Set<string>()

  reset(): void {
    this.selectorMatches.clear()
    this.engineSnapshot = undefined
    this.labelsSample = []
    this.labelsSeen.clear()
  }

  recordSelector(name: string, matched: SelectorMatchKind, fallback?: string): void {
    const existing = this.selectorMatches.get(name)
    if (existing) {
      existing.count += 1
      return
    }
    if (this.selectorMatches.size >= SELECTOR_MATCH_CAP) return
    this.selectorMatches.set(name, { name, matched, fallback, count: 1 })
  }

  setEngine(snapshot: EngineSnapshot): void {
    this.engineSnapshot = snapshot
  }

  addLabelSample(label: string): void {
    if (this.labelsSeen.has(label)) return
    if (this.labelsSample.length >= LABELS_SAMPLE_CAP) return
    this.labelsSeen.add(label)
    this.labelsSample.push(label)
  }

  blob(): DiagnosticBlob {
    return {
      packVersion: PACK_VERSION,
      url: typeof location !== 'undefined' ? location.href : '(no location)',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '(no navigator)',
      collectedAt: Date.now(),
      selectorMatches: [...this.selectorMatches.values()],
      engine: this.engineSnapshot,
      labelsSample: [...this.labelsSample],
    }
  }
}

export const diagnostics = new Diagnostics()

/**
 * Build a GitHub issue URL carrying the diagnostic blob. The blob is
 * truncated defensively so the URL stays far below browser limits.
 */
export function buildDiagnosticIssueUrl(blob: DiagnosticBlob, title = '[drift] Tool stopped working correctly'): string {
  const json = JSON.stringify(blob)
  const body = [
    '## What happened',
    '',
    '<!-- describe the problem in one or two lines -->',
    '',
    '## Diagnostic data',
    '',
    '```json',
    json.length > 8000 ? `${json.slice(0, 8000)}\n…(truncated)` : json,
    '```',
    '',
    '## Steps',
    '',
    '1. Open photos.google.com',
    '2. Run the tool',
    '3. …',
  ].join('\n')
  const params = new URLSearchParams({ title, body })
  return `https://github.com/shtse8/Google-Photos-Delete-Tool/issues/new?${params.toString()}`
}
