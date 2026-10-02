/**
 * Drift evaluation for the selector-drift canary. Pure: it takes match counts
 * observed on a live Google Photos page and decides ok / fallback / drift. No
 * browser, no network, so it is unit-tested against fixture DOM.
 */
import { PACK, type SelectorDef, type SelectorPack } from '../../src/core/selector-pack'

export type Stage = 'grid' | 'after-select'
export type Verdict = 'ok' | 'fallback' | 'drift' | 'skipped'

/** How many elements each candidate selector matched; `null` = the selector is not valid CSS. */
export interface CandidateCounts {
  primary: number | null
  fallbacks: Array<number | null>
}

export interface CheckSpec {
  id: string
  name: string
  stage: Stage
  primary: string
  fallbacks: string[]
  /** Why a check cannot run read-only; skipped checks never count as drift. */
  skipReason?: string
}

export interface CheckResult {
  id: string
  name: string
  stage: Stage
  verdict: Verdict
  matched: 'primary' | 'fallback' | 'none' | 'n/a'
  count: number
  detail?: string
}

export interface CanarySummary {
  packVersion: number
  verdict: 'ok' | 'drift'
  drifted: string[]
  checks: CheckResult[]
}

const def = (d: SelectorDef) => ({ name: d.name, primary: d.primary, fallbacks: d.fallbacks })

/** The checks the canary runs, derived from the active pack so a pack patch needs no canary change. */
export function buildChecks(pack: SelectorPack = PACK): CheckSpec[] {
  const s = pack.selectors
  const [toolbarPrimary, ...toolbarRest] = pack.actionButtons.toolbarDelete
  return [
    { id: 'mediaLink', stage: 'grid', ...def(s.mediaLink) },
    { id: 'thumbnail', stage: 'grid', ...def(s.thumbnail) },
    { id: 'photoContainer', stage: 'grid', ...def(s.photoContainer) },
    { id: 'scrollContainer', stage: 'grid', ...def(s.scrollContainer) },
    { id: 'checkbox', stage: 'grid', ...def(s.checkbox) },
    { id: 'checkboxChecked', stage: 'after-select', ...def(s.checkboxChecked) },
    { id: 'counter', stage: 'after-select', ...def(s.counter) },
    {
      id: 'toolbarDelete',
      name: 'Toolbar trash button (presence only, never clicked)',
      stage: 'after-select',
      primary: toolbarPrimary,
      fallbacks: toolbarRest,
    },
    {
      id: 'dialog',
      name: s.dialog.name,
      stage: 'after-select',
      primary: s.dialog.primary,
      fallbacks: s.dialog.fallbacks,
      skipReason: 'the confirm dialog only opens after the trash button is clicked, which the canary never does',
    },
  ]
}

export function evaluateCheck(spec: CheckSpec, counts: CandidateCounts | undefined): CheckResult {
  const base = { id: spec.id, name: spec.name, stage: spec.stage }
  if (spec.skipReason) return { ...base, verdict: 'skipped', matched: 'n/a', count: 0, detail: spec.skipReason }
  if (!counts) return { ...base, verdict: 'drift', matched: 'none', count: 0, detail: 'no observation (stage did not run)' }
  if ((counts.primary ?? 0) > 0) return { ...base, verdict: 'ok', matched: 'primary', count: counts.primary as number }
  const fb = counts.fallbacks.find((n) => (n ?? 0) > 0)
  if (fb) return { ...base, verdict: 'fallback', matched: 'fallback', count: fb, detail: 'primary selector matched nothing; a fallback still does' }
  const invalid = counts.primary === null || counts.fallbacks.includes(null)
  return {
    ...base,
    verdict: 'drift',
    matched: 'none',
    count: 0,
    detail: invalid ? 'no selector matched (one or more selectors are invalid CSS)' : 'no selector matched',
  }
}

/**
 * Drift = a non-skipped check where neither the primary nor any fallback
 * matched. A primary-only miss is reported as `fallback` (the tool still
 * works, the pack wants a refresh) and does not fail the run.
 */
export function evaluateDrift(
  observations: Partial<Record<string, CandidateCounts>>,
  pack: SelectorPack = PACK,
): CanarySummary {
  const checks = buildChecks(pack).map((spec) => evaluateCheck(spec, observations[spec.id]))
  const drifted = checks.filter((c) => c.verdict === 'drift').map((c) => c.id)
  return { packVersion: pack.version, verdict: drifted.length ? 'drift' : 'ok', drifted, checks }
}
