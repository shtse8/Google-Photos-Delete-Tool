import { describe, it, expect } from 'vitest'
import { pack } from '../src/core/dedup/phash'
import type { DupGroup, DupItem } from '../src/core/dedup/group'
import { planDeletion, type Overrides } from '../src/core/dedup/selection'
import {
  CONFIDENT_SIMILARITY, CSV_HEADER, applyKeepRule, groupKey, groupsToCsv, isConfident, keeperFor,
  planWithAutoAccept, splitByConfidence, trashedIds,
} from '../src/core/dedup/pro'

const hash = pack(new Uint8Array(8))
const item = (id: string, extra: Partial<DupItem> = {}): DupItem => ({ id, hash, ...extra })
const lookupOf = (items: DupItem[]) => (id: string) => items.find((i) => i.id === id)
const group = (ids: string[], best: string, sims?: number[]): DupGroup => ({
  itemIds: ids,
  similarities: sims ?? ids.map((_, i) => (i === 0 ? 1 : 0.99)),
  bestItemId: best,
  averageSimilarity: 0.99,
})
const day = (d: number): number => Date.UTC(2024, 2, d)

describe('keep rules', () => {
  const items = [
    item('a', { width: 1000, height: 1000, takenAt: day(5) }),
    item('b', { width: 4000, height: 3000, takenAt: day(1) }),
    item('c', { width: 2000, height: 2000, takenAt: day(9) }),
  ]
  const g = group(['a', 'b', 'c'], 'b')
  const look = lookupOf(items)

  it('default keeps the group best pick', () => {
    expect(keeperFor(g, look, 'default')).toBe('b')
  })
  it('resolution keeps the most pixels', () => {
    expect(keeperFor(group(['a', 'c', 'b'], 'a'), look, 'resolution')).toBe('b')
  })
  it('newest and oldest use capture time', () => {
    expect(keeperFor(g, look, 'newest')).toBe('c')
    expect(keeperFor(g, look, 'oldest')).toBe('b')
  })
  it('ties fall back to the current rule, then group order', () => {
    const tied = [item('x', { width: 10, height: 10, takenAt: day(2) }), item('y', { width: 10, height: 10, takenAt: day(2) }), item('z', { width: 5, height: 5, takenAt: day(2) })]
    const look2 = lookupOf(tied)
    expect(keeperFor(group(['x', 'y', 'z'], 'y'), look2, 'resolution')).toBe('y')
    expect(keeperFor(group(['x', 'y', 'z'], 'z'), look2, 'resolution')).toBe('x')
    expect(keeperFor(group(['x', 'y', 'z'], 'z'), look2, 'newest')).toBe('z')
    expect(keeperFor(group(['x', 'y', 'z'], 'w'), look2, 'newest')).toBe('x')
    expect(keeperFor(group(['x', 'y', 'z'], 'y'), look2, 'oldest')).toBe('y')
  })
  it('missing data falls back to the current rule and never guesses', () => {
    const bare = [item('p'), item('q')]
    const gg = group(['p', 'q'], 'q')
    for (const r of ['resolution', 'newest', 'oldest'] as const) expect(keeperFor(gg, lookupOf(bare), r)).toBe('q')
    // Partial data: only the item with data can win.
    const partial = [item('p', { takenAt: day(3) }), item('q')]
    expect(keeperFor(gg, lookupOf(partial), 'oldest')).toBe('p')
    expect(keeperFor(gg, lookupOf([item('p', { width: 0, height: 5 }), item('q')]), 'resolution')).toBe('q')
  })
  it('applies to every group at once, keeps exactly one each, and reports fallbacks', () => {
    const more = [...items, item('m'), item('n')]
    const groups = [g, group(['m', 'n'], 'm')]
    const o: Overrides = new Map([['a', 'keep']])
    const res = applyKeepRule(groups, lookupOf(more), 'newest', o)
    expect(res).toEqual({ applied: 1, fellBack: 1 })
    const plan = planDeletion(groups, o)
    expect(plan.ids.sort()).toEqual(['a', 'b', 'n'])
    expect(plan.kept).toBe(2)
  })
  it('default resets earlier flips', () => {
    const o: Overrides = new Map([['a', 'keep'], ['b', 'delete']])
    applyKeepRule([g], look, 'default', o)
    expect(o.size).toBe(0)
    expect(planDeletion([g], o).ids.sort()).toEqual(['a', 'c'])
  })
})

describe('auto-accept confident groups', () => {
  const sure = group(['a', 'b'], 'a', [1, 0.99])
  const edge = group(['c', 'd'], 'c', [1, CONFIDENT_SIMILARITY])
  const unsure = group(['e', 'f', 'g'], 'e', [1, 0.99, 0.96])

  it('threshold is 98% on every member, inclusive', () => {
    expect(CONFIDENT_SIMILARITY).toBe(0.98)
    expect(isConfident(sure)).toBe(true)
    expect(isConfident(edge)).toBe(true)
    expect(isConfident(unsure)).toBe(false)
    expect(isConfident(group(['h', 'i'], 'h', [1, 0.9799]))).toBe(false)
  })
  it('splits into confident and one combined review list', () => {
    const s = splitByConfidence([unsure, sure, edge])
    expect(s.confident).toEqual([sure, edge])
    expect(s.review).toEqual([unsure])
  })
  it('only confident groups plan to Trash until the rest are approved', () => {
    const o: Overrides = new Map()
    const approved = new Set<string>()
    let plan = planWithAutoAccept([sure, edge, unsure], o, approved)
    expect(plan.ids).toEqual(['b', 'd'])
    expect(plan.pending).toBe(1)
    approved.add(groupKey(unsure))
    plan = planWithAutoAccept([sure, edge, unsure], o, approved)
    expect(plan.ids).toEqual(['b', 'd', 'f', 'g'])
    expect(plan.pending).toBe(0)
  })
  it('never empties a group', () => {
    const o: Overrides = new Map([['a', 'delete'], ['b', 'delete']])
    expect(planWithAutoAccept([sure], o, new Set()).ids).toEqual(['b'])
  })
  it('group keys do not depend on member order', () => {
    expect(groupKey(group(['b', 'a'], 'a'))).toBe(groupKey(group(['a', 'b'], 'a')))
  })
})

describe('CSV export', () => {
  it('has the header and one row per item', () => {
    const g1 = group(['AF1Qipa', 'AF1Qipb'], 'AF1Qipa', [1, 0.984])
    const g2 = group(['x,y', 'z"'], 'x,y', [1, 0.95])
    const csv = groupsToCsv([g1, g2], new Set(['AF1Qipb', 'z"']))
    expect(csv.split('\n')).toEqual([
      CSV_HEADER,
      'g1,AF1Qipa,kept,100.0',
      'g1,AF1Qipb,trashed,98.4',
      'g2,"x,y",kept,100.0',
      'g2,"z""",trashed,95.0',
      '',
    ])
    expect(CSV_HEADER).toBe('group_id,item_id,decision,similarity')
  })
  it('trashedIds follows the choices', () => {
    const g1 = group(['a', 'b'], 'a')
    expect([...trashedIds([g1], new Map([['a', 'delete'], ['b', 'keep']]))]).toEqual(['a'])
  })
})
