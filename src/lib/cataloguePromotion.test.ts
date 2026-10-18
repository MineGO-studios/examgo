import { describe, expect, it } from 'vitest'
import { materializeCatalogueComponent, prepareCataloguePromotion } from './cataloguePromotion'
import type { StagedInterchangeQuestion } from './questionInterchange'

const BANK = '123e4567-e89b-42d3-a456-426614174000'
const group = { group_id: 'G', parent_group_id: '', group_type: 'printed_section',
  instructions: 'Choose.', display_count: 2, attempt_count: 2,
  group_completeness: 'complete', group_marks: 5 }
function row(id: string, contexts: object[] = [group]): StagedInterchangeQuestion {
  return { catalogueId: id, type: 'binary', prompt: 'True?', unitTags: [1, 2],
    displayUnit: 2, lesson: '1', difficulty: 'medium', difficultyProvisional: true,
    selectionMarks: null, content: null, answer: 'True', groupCompleteness: 'complete',
    groupIds: contexts.map((value) => (value as { group_id: string }).group_id),
    sourceFields: { group_context_json: JSON.stringify(contexts) }, issues: [] }
}

describe('catalogue promotion planning', () => {
  it('keeps connected groups atomic when one member cannot convert', () => {
    const other = { ...group, group_id: 'OTHER', display_count: 1, attempt_count: 1 }
    const invalid = { ...row('Q-2', [group, other]), lesson: null }
    const third = row('Q-3', [other])
    const independent = row('Q-4', [])
    const plan = prepareCataloguePromotion([row('Q-1'), invalid, third, independent], BANK)
    expect(plan).toMatchObject({ sourceRows: 4, readyRows: 1, reviewRows: 3 })
    expect(plan.components[0]).toEqual({ status: 'review', catalogueIds: ['Q-1', 'Q-2', 'Q-3'],
      issues: [{ sourceId: 'Q-2', message: 'Lesson is missing.' }] })
    expect(plan.components[0]).not.toHaveProperty('questions')
    expect(plan.components[1]).toMatchObject({ status: 'ready', catalogueIds: ['Q-4'] })
  })

  it('retains marks as source evidence and uses only the highest Unit for canonical placement', () => {
    const first = row('Q-1'), second = row('Q-2')
    first.sourceFields.item_order = '1'; second.sourceFields.item_order = '2'
    const plan = prepareCataloguePromotion([second, first], BANK)
    expect(plan.readyRows).toBe(2)
    const component = plan.components[0]
    if (component.status !== 'ready') throw new Error('Expected a ready component')
    expect(component.questions[0].input).toMatchObject({ bankId: BANK, marks: null, unit: 2 })
    expect(component.questions[0].source.unitTags).toEqual([1, 2])
    expect(component.groups[0]).toMatchObject({ questionIds: ['Q-1', 'Q-2'],
      expectedMarks: null, content: { source: { group_marks: 5 } } })
  })

  it('reports semantic group problems instead of supplying commit questions', () => {
    const source = { ...group, display_count: 6, attempt_count: 5 }
    const plan = prepareCataloguePromotion([row('Q-1', [source]), row('Q-2', [source])], BANK)
    expect(plan).toMatchObject({ readyRows: 0, reviewRows: 2 })
    expect(plan.components[0]).toEqual({ status: 'review', catalogueIds: ['Q-1', 'Q-2'],
      issues: [
        { sourceId: 'G', message: 'Printed display count 6 differs from 2 answerable points.' },
        { sourceId: 'G', message: 'Printed attempt count exceeds answerable points.' },
      ] })
  })

  it('reports invalid positions and rejects duplicate identities, Unit 9 and mismatched placement', () => {
    const first = row('Q-1'), second = row('Q-2')
    first.sourceFields.item_order = second.sourceFields.item_order = '1'
    expect(prepareCataloguePromotion([first, second], BANK).components[0]).toMatchObject({ status: 'review' })
    expect(() => prepareCataloguePromotion([first, { ...first, catalogueId: 'q-1' }], BANK)).toThrow(/unique/)
    expect(() => prepareCataloguePromotion([{ ...first, unitTags: [9], displayUnit: 9 }], BANK)).toThrow(/placement/)
    expect(() => prepareCataloguePromotion([{ ...first, displayUnit: 1 }], BANK)).toThrow(/placement/)
    expect(() => prepareCataloguePromotion([first], 'bad-bank')).toThrow(/valid source bank/)
  })

  it('materializes a markless passage with production-compatible content and ordered canonical children', () => {
    const passage = { ...group, group_type: 'passage', passage_text: 'A source passage.' }
    const first = row('Q-1', [passage]), second = row('Q-2', [passage])
    first.sourceFields.item_order = '1'; second.sourceFields.item_order = '2'
    const component = prepareCataloguePromotion([second, first], BANK).components[0]
    if (component.status !== 'ready') throw new Error('Expected ready passage')
    const owner = '123e4567-e89b-42d3-a456-426614174001'
    const q1 = '123e4567-e89b-42d3-a456-426614174002'
    const q2 = '123e4567-e89b-42d3-a456-426614174003'
    const g1 = '123e4567-e89b-42d3-a456-426614174004'
    const identities = { questions: new Map([['Q-1', q1], ['Q-2', q2]]), groups: new Map([['G', g1]]) }
    const batch = materializeCatalogueComponent(component, owner, BANK, identities)
    expect(batch.questions).toHaveLength(2)
    expect(batch.questions.every((question) => question.marks === null && question.unit === 2)).toBe(true)
    expect(batch.questions[0].answer).toEqual({ type: 'binary', schemaVersion: 1, isTrue: true })
    expect(batch.groups[0]).toMatchObject({ id: g1, owner_id: owner, expected_marks: null,
      attempt_count: 2, parent_group_id: null, content: { bankId: BANK,
        text: 'A source passage.', arabicInstruction: null, childIds: [q1, q2],
        sourceGroupType: 'passage', source: { group_marks: 5 } } })
    expect(batch.members).toEqual([
      { group_id: g1, question_id: q1, owner_id: owner, position: 1 },
      { group_id: g1, question_id: q2, owner_id: owner, position: 2 },
    ])
    expect(() => materializeCatalogueComponent(component, owner, BANK, {
      ...identities, questions: new Map([['Q-1', q1], ['Q-2', q1]]),
    })).toThrow(/reused/)
    component.groups[0].attemptCount = 3
    expect(() => materializeCatalogueComponent(component, owner, BANK, identities)).toThrow(/Attempt count/)
    component.groups[0].attemptCount = 2
    component.questions[0].input.marks = 1
    expect(() => materializeCatalogueComponent(component, owner, BANK, identities)).toThrow(/mark ownership/)
  })

  it('persists distinct sibling positions and the original parent relation', () => {
    const parent = { ...group, group_type: 'alternatives', attempt_count: 1 }
    const a = { ...group, group_id: 'A', parent_group_id: 'G', group_type: 'branch',
      display_count: 1, attempt_count: 1 }
    const b = { ...a, group_id: 'B' }
    const component = prepareCataloguePromotion([row('Q-1', [parent, a]), row('Q-2', [parent, b])], BANK).components[0]
    if (component.status !== 'ready') throw new Error('Expected ready hierarchy')
    const ids = ['1', '2', '3', '4', '5'].map((suffix) => `123e4567-e89b-42d3-a456-42661417400${suffix}`)
    const batch = materializeCatalogueComponent(component, BANK, BANK, {
      questions: new Map([['Q-1', ids[0]], ['Q-2', ids[1]]]),
      groups: new Map([['G', ids[2]], ['A', ids[3]], ['B', ids[4]]]),
    })
    expect(batch.groups.map(({ parent_group_id, position }) => ({ parent_group_id, position }))).toEqual([
      { parent_group_id: null, position: null },
      { parent_group_id: ids[2], position: 1 },
      { parent_group_id: ids[2], position: 2 },
    ])
  })
})
