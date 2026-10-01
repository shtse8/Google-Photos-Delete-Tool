/**
 * One-time "rate / share" prompt after a successful real run.
 *
 * Shown only when the engine's observed postcondition says at least one item
 * was deleted (`deleted` is only incremented after the page shows the
 * selection and the batch), never for a dry run, a failed run, a stopped
 * run, or zero deleted. Shown once per install: the flag is written when the
 * prompt is claimed, so ignoring it also counts as shown.
 *
 * No network call and no telemetry (docs/vision.md). Measurement is the UTM
 * parameters on the links: the Chrome Web Store developer dashboard reports
 * installs by UTM source.
 */
import { proUrl } from './pro-moments'
import type { RunStatus } from './status'

export const POST_RUN_PROMPT_KEY = 'gpdt_postRunPrompt_v1'

export const CWS_ID = 'jiahfbbfpacpolomdjlpdpiljllcdenb'
const CWS_LISTING = `https://chromewebstore.google.com/detail/${CWS_ID}`

export type PostRunKind = 'photos' | 'duplicates'
export type PromptBrowser = 'chrome' | 'edge' | 'firefox' | 'other'

export interface PostRunResult {
  dryRun: boolean
  stopped: boolean
  status: RunStatus
  deleted: number
  /** Engine filter kind: 'ids' is a duplicate cleanup. */
  filterKind: 'all' | 'type' | 'date' | 'ids'
  /** The run is about to navigate to /trash, which reloads the page. */
  navigatingToTrash?: boolean
}

export interface PromptStorage {
  /** True when the flag is set. Throws when storage is unreadable. */
  isShown(): Promise<boolean>
  markShown(): Promise<void>
}

export interface PostRunPrompt {
  kind: PostRunKind
  count: number
  /** Null when no review link exists for this browser: hide the button. */
  ratingUrl: string | null
  shareUrl: string
  shareText: string
  /** Pro page link for free users; null for Pro users (button hidden). */
  proUrl: string | null
}

export function shouldShowPostRunPrompt(r: PostRunResult, alreadyShown: boolean): boolean {
  return (
    !alreadyShown &&
    !r.dryRun &&
    !r.stopped &&
    r.status === 'done' &&
    r.deleted >= 1 &&
    !r.navigatingToTrash
  )
}

export function withUtm(url: string, medium: 'share' | 'rating'): string {
  const u = new URL(url)
  u.searchParams.set('utm_source', 'extension')
  u.searchParams.set('utm_medium', medium)
  u.searchParams.set('utm_campaign', 'post_run')
  return u.toString()
}

/**
 * Review pages we own a link for. Only the Chrome Web Store listing exists
 * in this repo; Firefox and Edge get no rating button. The userscript passes
 * 'chrome' because its rating link goes to the CWS listing.
 */
export function ratingUrlFor(browser: PromptBrowser): string | null {
  return browser === 'chrome' || browser === 'other'
    ? withUtm(`${CWS_LISTING}/reviews`, 'rating')
    : null
}

export function detectBrowser(userAgent: string): PromptBrowser {
  if (/Edg\//.test(userAgent)) return 'edge'
  if (/Firefox\//.test(userAgent)) return 'firefox'
  if (/Chrome\//.test(userAgent)) return 'chrome'
  return 'other'
}

export function buildShareText(kind: PostRunKind, count: number, link: string): string {
  const n = count.toLocaleString('en-US')
  const what = kind === 'duplicates'
    ? `${n} duplicate${count === 1 ? '' : 's'}`
    : `${n} photo${count === 1 ? '' : 's'}`
  return `I just cleared ${what} from Google Photos with this free extension: ${link}`
}

/**
 * Decide, claim and describe the prompt. Returns null when it must not be
 * shown (conditions, already shown, or storage unreadable/unwritable, so a
 * broken store can never turn "once" into "every run").
 */
export async function claimPostRunPrompt(
  result: PostRunResult,
  storage: PromptStorage,
  browser: PromptBrowser,
  isPro: boolean,
): Promise<PostRunPrompt | null> {
  if (!shouldShowPostRunPrompt(result, false)) return null
  try {
    if (await storage.isShown()) return null
    await storage.markShown()
  } catch {
    return null
  }
  const kind: PostRunKind = result.filterKind === 'ids' ? 'duplicates' : 'photos'
  const shareUrl = withUtm(CWS_LISTING, 'share')
  return {
    kind,
    count: result.deleted,
    ratingUrl: ratingUrlFor(browser),
    shareUrl,
    shareText: buildShareText(kind, result.deleted, shareUrl),
    proUrl: isPro ? null : proUrl('post_run'),
  }
}
