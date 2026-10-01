/**
 * Pro review tools for the duplicate finder. Pure functions: no DOM, no
 * network, no storage. The finder UI decides who may call them (Pro only);
 * free users keep the default best-copy rule and one review list.
 *
 * Guarantees kept from selection.ts: every group keeps at least one item
 * (a keep rule sets exactly one keeper per group), and nothing is moved
 * without the person's final confirmation in the finder.
 */
import type { DupGroup, DupItem } from './group'
import { groupChoices, planDeletion, type DeletionPlan, type Overrides } from './selection'

export type KeepRule = 'default' | 'resolution' | 'newest' | 'oldest'

export const KEEP_RULES: readonly KeepRule[] = ['default', 'resolution', 'newest', 'oldest']

/** Groups whose members are all at least this similar are pre-approved. */
export const CONFIDENT_SIMILARITY = 0.98

type Lookup = (id: string) => DupItem | undefined

const pixels = (item: DupItem | undefined): number => (item?.width ?? 0) * (item?.height ?? 0)
const time = (item: DupItem | undefined): number | null =>
  item?.takenAt != null && Number.isFinite(item.takenAt) ? item.takenAt : null

/**
 * The item a rule keeps in one group. Missing data never guesses: when no
 * member has the data the rule needs, or members tie, the group's current
 * rule (its `bestItemId`: most pixels, then oldest) decides among the tied.
 */
export function keeperFor(group: DupGroup, lookup: Lookup, rule: KeepRule): string {
  if (rule === 'default') return group.bestItemId
  const known = group.itemIds.filter((id) => (rule === 'resolution' ? pixels(lookup(id)) > 0 : time(lookup(id)) !== null))
  if (known.length === 0) return group.bestItemId
  const score = (id: string): number =>
    rule === 'resolution' ? pixels(lookup(id)) : rule === 'newest' ? time(lookup(id))! : -time(lookup(id))!
  const top = Math.max(...known.map(score))
  const tied = known.filter((id) => score(id) === top)
  return tied.includes(group.bestItemId) ? group.bestItemId : tied[0]
}

export interface KeepRuleResult {
  /** Groups where the rule had data and chose a keeper. */
  applied: number
  /** Groups that fell back to the default pick (no data for the rule). */
  fellBack: number
}

/** Apply one keep rule to every group at once, replacing earlier manual flips. */
export function applyKeepRule(groups: readonly DupGroup[], lookup: Lookup, rule: KeepRule, overrides: Overrides): KeepRuleResult {
  let applied = 0
  let fellBack = 0
  for (const group of groups) {
    if (rule === 'default') {
      for (const id of group.itemIds) overrides.delete(id)
      applied++
      continue
    }
    const keeper = keeperFor(group, lookup, rule)
    for (const id of group.itemIds) overrides.set(id, id === keeper ? 'keep' : 'delete')
    if (!hasData(group, lookup, rule)) fellBack++
    else applied++
  }
  return { applied, fellBack }
}

function hasData(group: DupGroup, lookup: Lookup, rule: KeepRule): boolean {
  return group.itemIds.some((id) => (rule === 'resolution' ? pixels(lookup(id)) > 0 : time(lookup(id)) !== null))
}

/** Stable key of a group across regrouping: its member ids. */
export function groupKey(group: DupGroup): string {
  return [...group.itemIds].sort().join('|')
}

/** A group is confident when every member is at least `min` similar. */
export function isConfident(group: DupGroup, min = CONFIDENT_SIMILARITY): boolean {
  return group.similarities.slice(1).every((s) => s >= min - 1e-9) && group.itemIds.length > 1
}

export interface ReviewSplit {
  confident: DupGroup[]
  /** Everything else, in one combined list. */
  review: DupGroup[]
}

export function splitByConfidence(groups: readonly DupGroup[], min = CONFIDENT_SIMILARITY): ReviewSplit {
  const confident: DupGroup[] = []
  const review: DupGroup[] = []
  for (const g of groups) (isConfident(g, min) ? confident : review).push(g)
  return { confident, review }
}

/**
 * Plan with auto-accept: confident groups count as approved; the rest count
 * only once the person approved them. An unapproved group contributes
 * nothing to Trash. The caller still shows the plan and asks to confirm.
 */
export function planWithAutoAccept(groups: readonly DupGroup[], overrides: Overrides, approved: ReadonlySet<string>): DeletionPlan & { pending: number } {
  const { confident, review } = splitByConfidence(groups)
  const counted = [...confident, ...review.filter((g) => approved.has(groupKey(g)))]
  const plan = planDeletion(counted, overrides)
  return { ...plan, pending: review.length - (counted.length - confident.length) }
}

export const CSV_HEADER = 'group_id,item_id,decision,similarity'

const csvCell = (v: string): string => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

/**
 * One row per item: group id (g1, g2, ...), item id, kept or trashed, and the
 * item's similarity to the group's first photo in percent (the first is 100).
 * `trashed` is the ids the current plan would move; everything else is kept.
 */
export function groupsToCsv(groups: readonly DupGroup[], trashed: ReadonlySet<string>): string {
  const rows = [CSV_HEADER]
  groups.forEach((group, g) => {
    group.itemIds.forEach((id, i) => {
      rows.push([`g${g + 1}`, csvCell(id), trashed.has(id) ? 'trashed' : 'kept', (group.similarities[i] * 100).toFixed(1)].join(','))
    })
  })
  return rows.join('\n') + '\n'
}

/** Ids the choices (without auto-accept) would trash; for the CSV when auto-accept is off. */
export function trashedIds(groups: readonly DupGroup[], overrides: Overrides): Set<string> {
  const out = new Set<string>()
  for (const g of groups) groupChoices(g, overrides).forEach((c, i) => { if (c === 'delete') out.add(g.itemIds[i]) })
  return out
}
