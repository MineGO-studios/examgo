import { describe, expect, it } from 'vitest'
import type { DomainQuestion } from '../domain/questionDomain'
import { questionPointIds } from '../domain/markAllocation'
import { conflictsWithSelection } from './selectQuestions'
import { parsePresetPointIdeas, presetPointSelectionKeys } from './presetPointIdeas'

const id = (n: number) => `123e4567-e89b-42d3-a456-${String(n).padStart(12, '0')}`
const base = { id: id(1), ownerId: id(2), bankId: id(3), externalId: 'Source-shaped fixture', unit: 1, lesson: '3',
  schemaVersion: 1 as const, difficulty: 'medium' as const, prompt: 'Match jobs with places of work.', marks: null,
  isActive: true, revision: 1 }
const matching: DomainQuestion = { ...base, type: 'matching',
  content: { type: 'matching', schemaVersion: 1,
    left: [{ id: 'left:1', text: 'doctor' }, { id: 'left:2', text: 'waiter' }],
    right: [{ id: 'right:a', text: 'hospital' }, { id: 'right:b', text: 'restaurant' }] },
  answer: { type: 'matching', schemaVersion: 1,
    pairs: [{ leftId: 'left:1', rightId: 'right:a' }, { leftId: 'left:2', rightId: 'right:b' }] } }
const mapping = { schemaVersion: 1, revisionId: id(4), points: [
  { pointId: questionPointIds(matching)[0], ideaKeys: ['doctor-workplace'] },
  { pointId: questionPointIds(matching)[1], ideaKeys: ['waiter-workplace'] },
] }
const context = ['wording:' + 'a'.repeat(32), 'family:' + 'b'.repeat(32)]

describe('governed preset point meanings', () => {
  it('keeps every matching fact and conflicts across types without using common answers', () => {
    const keys = presetPointSelectionKeys(matching, id(4), mapping, context)
    expect(keys).toContain('idea:doctor-workplace')
    expect(conflictsWithSelection({ ...matching, selectionKeys: keys }, [
      { id: id(5), unit: 1, lesson: '3', type: 'multiple-choice', difficulty: 'medium', selectionKeys: ['idea:doctor-workplace'] },
    ])).toBe(true)
    expect(conflictsWithSelection({ ...matching, selectionKeys: keys }, [
      { id: id(5), unit: 1, lesson: '3', type: 'multiple-choice', difficulty: 'medium', selectionKeys: ['idea:doctor-patient-treatment'] },
    ])).toBe(false)
    expect(matching.content.left).toHaveLength(2)
  })
  it('rejects unknown, missing, extra, reordered or wrong-revision point metadata', () => {
    for (const value of [null, { ...mapping, points: [] }, { ...mapping, points: mapping.points.slice(0, 1) },
      { ...mapping, points: [...mapping.points, mapping.points[0]] }, { ...mapping, points: [...mapping.points].reverse() },
      { ...mapping, revisionId: id(5) }, { ...mapping, schemaVersion: 2 }, { ...mapping, privateNote: 'Do not expose' },
      { ...mapping, points: [{ ...mapping.points[0], ideaKeys: [] }, mapping.points[1]] },
      { ...mapping, points: [{ ...mapping.points[0], ideaKeys: ['answer:hospital'] }, mapping.points[1]] }]) {
      expect(() => parsePresetPointIdeas(matching, id(4), value)).toThrow()
    }
  })
  it('allows truthful repeat metadata but excludes the complete question rather than removing a point', () => {
    const repeated = { ...mapping, points: mapping.points.map(point => ({ ...point, ideaKeys: ['clothing-material-wool'] })) }
    expect(parsePresetPointIdeas(matching, id(4), repeated).points).toHaveLength(2)
    expect(() => presetPointSelectionKeys(matching, id(4), repeated, context)).toThrow('repeats')
  })
  it('uses existing blank identities and requires all meanings even for optional attempts', () => {
    const completion: DomainQuestion = { ...base, type: 'completion',
      content: { type: 'completion', schemaVersion: 1, text: 'Works in a ___.\nServes food in a ___.',
        blankIds: ['hospital', 'restaurant'], wordBank: ['hospital', 'restaurant'], wordBankOrder: 'ordered',
        allowWordReuse: false, requireAllWordsUsed: true },
      answer: { type: 'completion', schemaVersion: 1, answers: { hospital: 'hospital', restaurant: 'restaurant' } } }
    const value = { ...mapping, points: mapping.points.map((point, i) => ({ ...point, pointId: questionPointIds(completion)[i] })) }
    expect(presetPointSelectionKeys(completion, id(4), value, context)).toContain('idea:doctor-workplace')
    expect(() => parsePresetPointIdeas(completion, id(4), { ...value, points: value.points.slice(0, 1) })).toThrow()
  })
  it('does not broaden historical single-point rules, deferred units or source identity bounds', () => {
    const simple: DomainQuestion = { ...base, type: 'binary', content: { type: 'binary', schemaVersion: 1, labelMode: 'true-false' },
      answer: { type: 'binary', schemaVersion: 1, isTrue: true } }
    expect(() => parsePresetPointIdeas(simple, id(4), mapping)).toThrow('Point-level')
    expect(() => parsePresetPointIdeas({ ...matching, unit: 5 }, id(4), mapping)).toThrow('Units 1-4')
    for (const keys of [[], ['answer:hospital'], [...context, context[0]], ['family:' + 'b'.repeat(32)]]) {
      expect(() => presetPointSelectionKeys(matching, id(4), mapping, keys)).toThrow('source')
    }
    const tooMany = { ...mapping, points: mapping.points.map((point, index) => ({ ...point,
      ideaKeys: Array.from({ length: 10 }, (_, i) => `fact-${index}-${i}`) })) }
    expect(() => presetPointSelectionKeys(matching, id(4), tooMany, context)).toThrow('selection identity')
  })
  it('clones reviewed metadata and rejects duplicate keys on one point', () => {
    const parsed = parsePresetPointIdeas(matching, id(4), mapping)
    parsed.points[0].ideaKeys.push('different')
    expect(mapping.points[0].ideaKeys).toEqual(['doctor-workplace'])
    expect(() => parsePresetPointIdeas(matching, id(4), { ...mapping, points: [
      { ...mapping.points[0], ideaKeys: ['doctor-workplace', 'doctor-workplace'] }, mapping.points[1],
    ] })).toThrow()
  })
})
