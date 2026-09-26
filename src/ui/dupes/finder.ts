/**
 * Find duplicates — in-page review for the extension and the userscript.
 *
 * Flow: scan this view (no clicks) → group look-alikes → the person
 * reviews which to keep → the chosen items go to the existing delete
 * flow, which keeps its consent gate, dry run, batches, and Stop.
 * Runs inside a shadow root so Google Photos styles cannot leak in.
 */
import type { Progress } from '../../core/delete-engine'
import { ACTIVE_STATUSES } from '../../core/status'
import { DEFAULT_THRESHOLD, GroupingAborted, groupDuplicates, type DupGroup } from '../../core/dedup/group'
import { scanView, type ScanDeps, type ScannedItem } from '../../core/dedup/scan'
import { groupChoices, planDeletion, toggleChoice, type Overrides } from '../../core/dedup/selection'
import { harvestGridTiles, hashThumbnail, sizedThumbUrl } from '../../core/dedup/browser-grid'
import { browserDom } from '../../core/browser-dom'
import { sleep } from '../../core/utils'

export interface FinderHost {
  /** Hand ids to the delete flow. The host enforces consent again. */
  runDelete(ids: string[], dryRun: boolean): Promise<{ ok: boolean; error?: string }>
  stopRun(): void
  consentAcknowledged(): Promise<boolean>
  acknowledgeConsent(): Promise<void>
  /** Subscribe to delete-run progress; returns an unsubscribe function. */
  onRunProgress(cb: (p: Progress) => void): () => void
  scanDeps?: ScanDeps
}

const HOST_ID = 'gpdt-dupes-host'
const PAGE = 40

export const browserScanDeps: ScanDeps = {
  harvest: () => harvestGridTiles(),
  findScrollTarget: () => browserDom.findScrollTarget(),
  hashThumb: hashThumbnail,
  sleep,
}

const CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.panel { position: fixed; top: 0; right: 0; bottom: 0; width: min(560px, 100vw); z-index: 2147483647;
  display: flex; flex-direction: column; background: #16181d; color: #e8e8e8;
  font: 13px/1.45 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  box-shadow: -8px 0 32px rgba(0,0,0,.5); border-left: 1px solid rgba(255,255,255,.08); }
header { display: flex; align-items: center; gap: 8px; padding: 14px 16px; border-bottom: 1px solid rgba(255,255,255,.08); }
header h1 { flex: 1; margin: 0; font-size: 15px; }
main { flex: 1; overflow-y: auto; padding: 14px 16px; }
footer { padding: 12px 16px; border-top: 1px solid rgba(255,255,255,.08); display: grid; gap: 8px; }
button { cursor: pointer; border: 0; border-radius: 8px; padding: 8px 12px; font: 600 13px inherit; font-family: inherit; }
button:disabled { opacity: .45; cursor: not-allowed; }
.primary { background: linear-gradient(135deg,#10b981,#3b82f6); color: #fff; }
.danger { background: #ef4444; color: #fff; }
.ghost { background: rgba(255,255,255,.08); color: #c9c9d1; }
.row { display: flex; gap: 8px; align-items: center; }
.row > button { flex: 1; }
.muted { color: #9a9aa5; font-size: 12px; }
.err { color: #f87171; font-size: 12px; }
.bar { height: 6px; background: rgba(255,255,255,.08); border-radius: 3px; overflow: hidden; margin: 10px 0; }
.bar > div { height: 100%; width: 30%; background: linear-gradient(90deg,#10b981,#3b82f6); animation: slide 1.4s ease-in-out infinite; }
@keyframes slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(333%); } }
.stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin: 10px 0; }
.stat { background: rgba(255,255,255,.05); border-radius: 8px; padding: 8px; text-align: center; }
.stat b { display: block; font-size: 16px; font-variant-numeric: tabular-nums; }
.stat span { font-size: 10px; color: #8b8b95; text-transform: uppercase; letter-spacing: .4px; }
input[type=range] { flex: 1; accent-color: #3b82f6; }
.group { background: rgba(255,255,255,.04); border-radius: 10px; padding: 10px; margin: 10px 0; }
.group h2 { margin: 0 0 8px; font-size: 12px; font-weight: 600; color: #c9c9d1; }
.thumbs { display: grid; grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)); gap: 8px; }
.item { position: relative; border-radius: 8px; overflow: hidden; border: 2px solid transparent; background: #0d0e11; }
.item.keep { border-color: #10b981; }
.item.delete { border-color: #ef4444; }
.item.delete img { opacity: .55; }
.item img { display: block; width: 100%; aspect-ratio: 1; object-fit: cover; cursor: pointer; }
.item .badge { position: absolute; top: 4px; left: 4px; padding: 2px 6px; border-radius: 6px; font-size: 11px; font-weight: 700; }
.item.keep .badge { background: #10b981; color: #fff; }
.item.delete .badge { background: #ef4444; color: #fff; }
.item .meta { display: flex; justify-content: space-between; gap: 4px; padding: 4px 6px; font-size: 11px; color: #9a9aa5; }
.item .meta a { color: #93c5fd; text-decoration: none; }
.consent { display: flex; gap: 6px; align-items: flex-start; font-size: 12px; }
.hidden { display: none !important; }
`

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v
    else el.setAttribute(k, v)
  }
  for (const c of children) el.append(c)
  return el
}

const pct = (x: number): string => `${Math.round(x * 100)}%`

export function openDuplicateFinder(host: FinderHost): void {
  document.getElementById(HOST_ID)?.remove()
  const mount = h('div', { id: HOST_ID })
  const shadow = mount.attachShadow({ mode: 'open' })
  shadow.append(h('style', {}, CSS))
  ;(document.body ?? document.documentElement).append(mount)

  const deps = host.scanDeps ?? browserScanDeps
  let scanAbort: AbortController | null = null
  let groupAbort: AbortController | null = null
  let items: ScannedItem[] = []
  let byId = new Map<string, ScannedItem>()
  let groups: DupGroup[] = []
  let shown = PAGE
  let threshold = DEFAULT_THRESHOLD
  let consented = false
  let runActive = false
  let runIsDryRun = false
  const overrides: Overrides = new Map()

  const main = h('main')
  const footer = h('footer')
  const closeBtn = h('button', { class: 'ghost', title: 'Close' }, 'Close')
  shadow.append(h('div', { class: 'panel', role: 'dialog', 'aria-label': 'Find duplicates' },
    h('header', {}, h('h1', {}, 'Find duplicates'), closeBtn), main, footer))

  const unsubscribe = host.onRunProgress((p) => renderRun(p))
  closeBtn.addEventListener('click', () => {
    scanAbort?.abort()
    groupAbort?.abort()
    unsubscribe()
    mount.remove()
  })

  // ─── 1. Intro ───────────────────────────────────────────────
  function renderIntro(): void {
    main.replaceChildren(
      h('p', {}, 'Finds photos that look the same or almost the same in the view you are on (your library, an album, or a search).'),
      h('p', { class: 'muted' }, 'It scrolls the page and compares small thumbnails on your computer. Nothing is uploaded and nothing is deleted until you review the groups and confirm.'),
      h('p', { class: 'muted' }, 'Big libraries take a while: Google Photos loads the grid as you scroll. You can cancel at any time.'),
    )
    const start = h('button', { class: 'primary' }, 'Scan this view')
    start.addEventListener('click', () => void runScan())
    footer.replaceChildren(start)
  }

  // ─── 2. Scan ────────────────────────────────────────────────
  async function runScan(): Promise<void> {
    scanAbort = new AbortController()
    const found = h('b', {}, '0')
    const hashed = h('b', {}, '0')
    const failed = h('b', {}, '0')
    const note = h('p', { class: 'muted' }, 'Scrolling through this view…')
    main.replaceChildren(
      note,
      h('div', { class: 'bar' }, h('div')),
      h('div', { class: 'stats' },
        h('div', { class: 'stat' }, found, h('span', {}, 'Found')),
        h('div', { class: 'stat' }, hashed, h('span', {}, 'Compared')),
        h('div', { class: 'stat' }, failed, h('span', {}, 'Unreadable'))),
    )
    const cancel = h('button', { class: 'ghost' }, 'Cancel')
    cancel.addEventListener('click', () => scanAbort?.abort())
    footer.replaceChildren(cancel)

    const result = await scanView(deps, {
      signal: scanAbort.signal,
      onProgress: (p) => {
        found.textContent = p.found.toLocaleString()
        hashed.textContent = p.hashed.toLocaleString()
        failed.textContent = p.failed.toLocaleString()
        if (p.phase === 'hashing') note.textContent = 'Reached the end of the view. Finishing the comparison…'
      },
    })
    if (result.cancelled) { renderIntro(); return }
    items = result.items
    byId = new Map(items.map((i) => [i.id, i]))
    if (result.found === 0) {
      main.replaceChildren(h('p', { class: 'err' }, 'No photos were found in this view. Open your library, an album, or a search result and try again. If photos are visible, use "Report issue" so the page layout can be updated.'))
      renderRestart()
      return
    }
    await regroup()
  }

  // ─── 3. Group + review ──────────────────────────────────────
  async function regroup(): Promise<void> {
    groupAbort?.abort()
    const ctrl = new AbortController()
    groupAbort = ctrl
    main.replaceChildren(h('p', { class: 'muted' }, 'Grouping look-alikes…'), h('div', { class: 'bar' }, h('div')))
    try {
      groups = await groupDuplicates(items, { threshold, signal: ctrl.signal })
    } catch (err) {
      if (err instanceof GroupingAborted) return
      throw err
    }
    shown = PAGE
    consented = await host.consentAcknowledged()
    renderReview()
  }

  function renderReview(): void {
    const slider = h('input', { type: 'range', min: '80', max: '100', step: '1', value: String(Math.round(threshold * 100)), 'aria-label': 'How similar photos must be' })
    const sliderValue = h('b', {}, pct(threshold))
    let debounce: ReturnType<typeof setTimeout> | undefined
    slider.addEventListener('input', () => {
      threshold = Number(slider.value) / 100
      sliderValue.textContent = pct(threshold)
      clearTimeout(debounce)
      debounce = setTimeout(() => void regroup(), 300)
    })

    const plan = planDeletion(groups, overrides)
    const list = h('div')
    for (const group of groups.slice(0, shown)) list.append(renderGroup(group))
    const more = h('button', { class: 'ghost' }, `Show more groups (${Math.max(0, groups.length - shown)} left)`)
    more.classList.toggle('hidden', shown >= groups.length)
    more.addEventListener('click', () => { shown += PAGE; renderReview() })

    main.replaceChildren(
      h('div', { class: 'row' }, h('span', {}, 'Similarity'), slider, sliderValue),
      h('p', { class: 'muted' }, 'Higher finds only near-identical copies. Lower also groups edits, bursts and similar shots, so check them.'),
      h('div', { class: 'stats' },
        h('div', { class: 'stat' }, h('b', {}, plan.groups.toLocaleString()), h('span', {}, 'Groups')),
        h('div', { class: 'stat' }, h('b', {}, plan.kept.toLocaleString()), h('span', {}, 'Keep')),
        h('div', { class: 'stat' }, h('b', {}, plan.ids.length.toLocaleString()), h('span', {}, 'To Trash'))),
      groups.length === 0
        ? h('p', {}, `No look-alikes at ${pct(threshold)} among ${items.length.toLocaleString()} photos. Try a lower similarity.`)
        : h('p', { class: 'muted' }, 'Green is kept, red goes to Trash. Click a photo to switch. The best copy is chosen for you: largest size when known, then the oldest. Each group always keeps at least one.'),
      list,
      more,
    )
    renderReviewFooter(plan.ids)
  }

  function renderGroup(group: DupGroup): HTMLElement {
    const choices = groupChoices(group, overrides)
    const thumbs = h('div', { class: 'thumbs' })
    group.itemIds.forEach((id, i) => {
      const item = byId.get(id)
      if (!item) return
      const choice = choices[i]
      const img = h('img', { src: sizedThumbUrl(item.thumbUrl, 224), alt: item.label ?? 'Photo', loading: 'lazy', title: item.label ?? '' })
      img.addEventListener('click', () => {
        const res = toggleChoice(group, id, overrides)
        if (!res.ok) {
          flash(card, 'Each group keeps at least one photo. Mark another one to keep first.')
          return
        }
        renderReview()
      })
      const date = item.takenAt ? new Date(item.takenAt).toLocaleDateString() : ''
      thumbs.append(h('div', { class: `item ${choice}` },
        img,
        h('span', { class: 'badge' }, choice === 'keep' ? (id === group.bestItemId ? 'Keep · best' : 'Keep') : 'Trash'),
        h('div', { class: 'meta' },
          h('span', {}, date),
          h('a', { href: `https://photos.google.com/photo/${encodeURIComponent(id)}`, target: '_blank', rel: 'noopener' }, 'Open'))))
    })
    const card = h('section', { class: 'group' },
      h('h2', {}, `${group.itemIds.length} photos · ${pct(group.averageSimilarity)} similar`),
      thumbs)
    return card
  }

  function flash(card: HTMLElement, text: string): void {
    const p = h('p', { class: 'err' }, text)
    card.append(p)
    setTimeout(() => p.remove(), 3000)
  }

  function renderReviewFooter(ids: string[]): void {
    const error = h('p', { class: 'err hidden' })
    const check = h('input', { type: 'checkbox' })
    const consent = h('label', { class: 'consent' }, check,
      h('span', {}, 'I understand the red photos move to Google Photos Trash, where they stay for 60 days before Google deletes them.'))
    consent.classList.toggle('hidden', consented || ids.length === 0)

    const preview = h('button', { class: 'ghost' }, 'Preview (dry run)')
    const trash = h('button', { class: 'danger' }, `Move ${ids.length.toLocaleString()} to Trash`)
    preview.disabled = ids.length === 0
    trash.disabled = ids.length === 0

    const handoff = async (dryRun: boolean): Promise<void> => {
      error.classList.add('hidden')
      if (!dryRun && !consented) {
        if (!check.checked) {
          error.textContent = 'Tick the box above to confirm first.'
          error.classList.remove('hidden')
          return
        }
        await host.acknowledgeConsent()
        consented = true
      }
      runActive = true
      runIsDryRun = dryRun
      const res = await host.runDelete(ids, dryRun)
      if (!res.ok) {
        runActive = false
        error.textContent = res.error ?? 'Could not start.'
        error.classList.remove('hidden')
      }
    }
    preview.addEventListener('click', () => void handoff(true))
    trash.addEventListener('click', () => void handoff(false))
    footer.replaceChildren(consent, error, h('div', { class: 'row' }, preview, trash))
  }

  // ─── 4. Delete run (existing engine) ────────────────────────
  function renderRun(p: Progress): void {
    if (!runActive) return
    const active = ACTIVE_STATUSES.has(p.status) || p.status === 'paused'
    if (active) {
      main.replaceChildren(
        h('p', {}, p.total !== undefined && p.deleted === 0
          ? `Preview: found ${p.total.toLocaleString()} of the chosen photos so far…`
          : `Moving to Trash: ${p.deleted.toLocaleString()} done, ${p.selected.toLocaleString()} selected…`),
        h('div', { class: 'bar' }, h('div')),
        h('p', { class: 'muted' }, 'Keep this tab open. You can stop at any time; photos already moved stay in Trash.'),
      )
      const stop = h('button', { class: 'danger' }, 'Stop')
      stop.addEventListener('click', () => host.stopRun())
      footer.replaceChildren(stop)
      return
    }
    runActive = false
    const lines: HTMLElement[] = []
    if (p.status === 'error') lines.push(h('p', { class: 'err' }, p.error ?? 'The run stopped with an error.'))
    else if (p.status === 'idle') lines.push(h('p', {}, `Stopped. ${p.deleted.toLocaleString()} photos were moved to Trash before the stop.`))
    else if (p.total !== undefined && p.deleted === 0) lines.push(h('p', {}, `Preview done: ${p.total.toLocaleString()} of the chosen photos are in this view. Nothing was changed.`))
    else lines.push(h('p', {}, `Done. ${p.deleted.toLocaleString()} photos moved to Trash. You can restore them from Trash for 60 days.`))
    // Moved items are gone from the view; the old groups are stale.
    if (!runIsDryRun && p.deleted > 0) groups = []
    main.replaceChildren(...lines)
    renderRestart()
  }

  function renderRestart(): void {
    const again = h('button', { class: 'primary' }, 'Scan again')
    again.addEventListener('click', () => { overrides.clear(); void runScan() })
    const back = h('button', { class: 'ghost' }, 'Back to review')
    back.classList.toggle('hidden', groups.length === 0)
    back.addEventListener('click', () => renderReview())
    footer.replaceChildren(h('div', { class: 'row' }, back, again))
  }

  renderIntro()
}
