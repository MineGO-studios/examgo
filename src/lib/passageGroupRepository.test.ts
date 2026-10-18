import { expect, it, vi } from 'vitest'
import { makeExam002Candidate } from './fixtures/phaseTenExam002Candidate'
import { domainQuestionToPersistenceInsert } from '../domain/questionDomain'

const mocks = vi.hoisted(() => ({ questions: vi.fn(), from: vi.fn() }))
vi.mock('./questionMembershipRepository', () => ({ getQuestionsForBanks: mocks.questions }))
vi.mock('./supabase', () => ({ supabase: { from: mocks.from } }))
import { getStructuredQuestionPoolForBanks } from './passageGroupRepository'

it('keeps remaining children of an unavailable completion exercise out of standalone selection', async () => {
  const source = structuredClone(makeExam002Candidate('tissue'))
  const completion = source.branches.find(branch => branch.kind === 'completion')!.items[0].question
  const standalone = source.branches[1].items[0].question
  const groupId = '11111111-1111-4111-8111-111111111113'
  mocks.questions.mockResolvedValue([completion, standalone].map(q => ({ ...domainQuestionToPersistenceInsert(q), current_revision: q.revision })))
  const group = { id: groupId, owner_id: source.ownerId, group_type: 'branch', revision: 1, schema_version: 1,
    title: null, instructions: 'Complete this whole exercise.', attempt_count: null, expected_marks: null,
    content: { type: 'branch', bankId: source.bankId, sourceGroupType: 'completion_set', source: { group_completeness: 'incomplete' } } }
  mocks.from.mockImplementation(table => {
    const builder = { select: () => builder, order: () => builder, in: () => builder,
      range: async () => ({ error: null, data: table === 'question_groups' ? [group] : table === 'question_group_questions'
        ? [{ group_id: groupId, question_id: completion.id, position: 1 }] : (() => { throw new Error(`Unexpected table ${table}`) })() }) }
    return builder
  })
  const pool = await getStructuredQuestionPoolForBanks([source.bankId])
  expect(pool.questions.map(q => q.id)).toContain(completion.id)
  expect(pool.completionGroups).toEqual([])
  expect(pool.standaloneQuestionIds).toEqual([standalone.id])
})
