import { expect, it } from 'vitest'
import { makeExam002Candidate } from './fixtures/phaseTenExam002Candidate'
import { selectExam002Candidate } from './phaseTenCandidateSelection'

const source = makeExam002Candidate('tissue')
const pool = source.branches.flatMap((branch) => branch.items.map((item) => item.question))
const group = source.branches[0].passageGroup!

it('selects one complete source-backed candidate deterministically from an owned bank and saved passage', () => {
  const first = selectExam002Candidate(pool, [group], source.ownerId, source.bankId, source.selectionSeed)
  const reordered = selectExam002Candidate([...pool].reverse(), [group], source.ownerId, source.bankId, source.selectionSeed)
  expect(first).toEqual(reordered)
  expect(first.branches.map((branch) => branch.id)).toEqual(source.branches.map((branch) => branch.id))
  expect(first.branches[0].passageGroup?.id).toBe(group.id)
  expect(new Set(first.branches.flatMap((branch) => branch.items.map((item) => item.question.id))).size).toBe(30)
  expect(first.totalMarks).toBe(60)
})

it('does not revive withdrawn revisions or borrow another owner’s questions', () => {
  const withdrawn = pool.map((question) => question.id === source.branches[1].items[0].question.id
    ? { ...question, isActive: false, revision: question.revision + 1 } : question)
  expect(() => selectExam002Candidate(withdrawn, [group], source.ownerId, source.bankId, 1)).toThrow('No eligible')
  expect(() => selectExam002Candidate(pool, [group], 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', source.bankId, 1)).toThrow('No current owned passage')
})

it('does not select the superseded source wording into a corrected candidate', () => {
  const old = makeExam002Candidate('tissue', true)
  const oldMatching = old.branches[4].items[0].question
  const outdatedPool = pool.map((question) => question.id === oldMatching.id ? oldMatching : question)
  expect(() => selectExam002Candidate(outdatedPool, [group], source.ownerId, source.bankId, 1)).toThrow('No eligible')
})
