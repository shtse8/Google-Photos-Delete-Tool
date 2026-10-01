/**
 * Pro conversion moments for free users: the dry-run teaser and the post-run
 * "Get Pro" button. Both are plain, dismissable text and a link; no network
 * call, no telemetry. Measurement is the UTM parameters on the link only.
 * Pro users never see either. Deleting, dry run, duplicates and empty trash
 * stay free (docs/vision.md).
 */
import { PHOTO_TYPES, classifyLabel, type PhotoType } from './photo-filter'

/** chrome.storage key (extension) where the popup saves the Pro token. */
export const PRO_TOKEN_KEY = 'proToken'

export const PRO_URL = 'https://github.com/SylphxAI/Google-Photos-Delete-Tool#pro'

export type ProMedium = 'dryrun_teaser' | 'post_run' | 'date_filter' | 'presets'

/** The README #pro URL with UTM parameters (before the anchor). */
export function proUrl(medium: ProMedium): string {
  const [base, hash] = PRO_URL.split('#')
  return `${base}?utm_source=extension&utm_medium=${medium}&utm_campaign=pro#${hash}`
}

const PLURAL: Record<Exclude<PhotoType, 'unknown'>, [string, string]> = {
  photo: ['photo', 'photos'],
  video: ['video', 'videos'],
  screenshot: ['screenshot', 'screenshots'],
  animation: ['animation', 'animations'],
  collage: ['collage', 'collages'],
}

export interface DryRunTeaser {
  /** "This view has 12 screenshots, 40 videos." */
  countsLine: string
  ctaLine: string
  linkLabel: string
  url: string
}

export type TypeCounts = Record<PhotoType, number>

/** Per-type counts of the labels a dry run observed (same rule as the Pro filter). */
export function countLabelTypes(labels: readonly string[]): TypeCounts {
  const counts: TypeCounts = { photo: 0, video: 0, screenshot: 0, animation: 0, collage: 0, unknown: 0 }
  for (const l of labels) counts[classifyLabel(l)] += 1
  return counts
}

/**
 * Teaser for a finished dry run. Counts come only from what the free scan
 * already observed; unclassifiable labels are left out of the per-type list.
 * Null for Pro users or when the scan saw nothing.
 */
export function buildDryRunTeaser(counts: TypeCounts, total: number, isPro: boolean): DryRunTeaser | null {
  if (isPro || total <= 0) return null
  const parts = PHOTO_TYPES
    .filter(t => counts[t] > 0)
    .map(t => `${counts[t].toLocaleString('en-US')} ${PLURAL[t][counts[t] === 1 ? 0 : 1]}`)
  const countsLine = parts.length > 0
    ? `This view has ${parts.join(', ')}.`
    : `This view has ${total.toLocaleString('en-US')} items.`
  return {
    countsLine,
    ctaLine: 'Delete only the types you choose with Pro — US$9.99 once',
    linkLabel: 'Get Pro',
    url: proUrl('dryrun_teaser'),
  }
}

/** The date-filter wording shared by the popup and the userscript panel. */
export function dateReportLine(report: { matched: number; skippedUnreadable: number; total: number }): string {
  const n = (v: number): string => v.toLocaleString('en-US')
  const base = `${n(report.matched)} of ${n(report.total)} items match the date filter.`
  return report.skippedUnreadable > 0
    ? `${base} ${n(report.skippedUnreadable)} items skipped: date not readable.`
    : base
}
