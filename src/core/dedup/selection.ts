/**
 * Which items of each duplicate group to keep and which to move to Trash.
 *
 * Default: keep the group's best item, trash the rest. The person can flip
 * any item. Every group always keeps at least one item — a flip that would
 * leave a group with nothing kept is refused — so the review can never hand
 * a whole group to the delete flow.
 */
import type { DupGroup } from './group'

export type Choice = 'keep' | 'delete'

/** Choices the person made explicitly, by item id. Survives regrouping. */
export type Overrides = Map<string, Choice>

export function choiceFor(group: DupGroup, id: string, overrides: Overrides): Choice {
  const explicit = overrides.get(id)
  if (explicit) return explicit
  return id === group.bestItemId ? 'keep' : 'delete'
}

/**
 * Resolved choices for one group. If the overrides would keep nothing
 * (for example after the threshold changed the group), the best item is kept.
 */
export function groupChoices(group: DupGroup, overrides: Overrides): Choice[] {
  const choices = group.itemIds.map((id) => choiceFor(group, id, overrides))
  if (!choices.includes('keep')) choices[group.itemIds.indexOf(group.bestItemId)] = 'keep'
  return choices
}

export type ToggleResult = { ok: true } | { ok: false; reason: 'last-kept' | 'not-in-group' }

/** Flip one item between keep and delete, refusing to empty a group. */
export function toggleChoice(group: DupGroup, id: string, overrides: Overrides): ToggleResult {
  const index = group.itemIds.indexOf(id)
  if (index < 0) return { ok: false, reason: 'not-in-group' }
  const choices = groupChoices(group, overrides)
  if (choices[index] === 'keep') {
    const kept = choices.filter((c) => c === 'keep').length
    if (kept <= 1) return { ok: false, reason: 'last-kept' }
    overrides.set(id, 'delete')
  } else {
    overrides.set(id, 'keep')
  }
  return { ok: true }
}

/** Make `id` the only kept item in its group. */
export function keepOnly(group: DupGroup, id: string, overrides: Overrides): ToggleResult {
  if (!group.itemIds.includes(id)) return { ok: false, reason: 'not-in-group' }
  for (const other of group.itemIds) overrides.set(other, other === id ? 'keep' : 'delete')
  return { ok: true }
}

export interface DeletionPlan {
  /** Item ids to move to Trash, in group order. */
  ids: string[]
  kept: number
  groups: number
}

export function planDeletion(groups: readonly DupGroup[], overrides: Overrides): DeletionPlan {
  const ids: string[] = []
  let kept = 0
  for (const group of groups) {
    const choices = groupChoices(group, overrides)
    group.itemIds.forEach((id, i) => {
      if (choices[i] === 'delete') ids.push(id)
      else kept++
    })
  }
  return { ids, kept, groups: groups.length }
}
