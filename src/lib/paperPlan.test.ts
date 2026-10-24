import { describe, expect, it } from 'vitest'
import { paperPlanGroups, planShare } from './paperPlan'

describe('paperPlanGroups', () => {
  it('groups parts by type in first-appearance order and sums marks and items', () => {
    const groups = paperPlanGroups([
      { label: 'Q1 A', question: 0, type: 'choice', items: 4, marks: 4 },
      { label: 'Q1 B', question: 0, type: 'short', items: 2, marks: 4 },
      { label: 'Q2', question: 1, type: 'choice', items: 3, marks: 3 },
    ])
    expect(groups.map((group) => [group.type, group.marks, group.items])).toEqual([['choice', 7, 7], ['short', 4, 2]])
    expect(groups[0].parts.map((part) => part.label)).toEqual(['Q1 A', 'Q2'])
  })

  it('keeps a type whose questions still need marks', () => {
    expect(paperPlanGroups([{ label: 'Q1', question: 0, type: 'binary', items: 1, marks: 0 }])[0].marks).toBe(0)
  })
})

describe('planShare', () => {
  it('rounds to a whole percent and is zero without marks', () => {
    expect(planShare(1, 3)).toBe(33)
    expect(planShare(2, 0)).toBe(0)
  })
})
