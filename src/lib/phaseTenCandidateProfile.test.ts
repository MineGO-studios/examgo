import { expect, it } from 'vitest'
import { makeExam002Candidate } from './fixtures/phaseTenExam002Candidate'
import { assignCandidateExamMarks, parseExam002CandidateSnapshot } from './phaseTenCandidateProfile'
import { compoundBranchPointIds } from '../domain/compoundStructure'

function marklessCandidate() {
  const candidate = makeExam002Candidate('tissue')
  candidate.branches.forEach((branch) => {
    branch.items.forEach((item) => { item.question.marks = null })
    if (branch.passageGroup) {
      branch.passageGroup.expectedMarks = null
      branch.passageGroup.children.forEach((child) => { child.question.marks = null })
    }
  })
  return candidate
}

function allocations(candidate: ReturnType<typeof makeExam002Candidate>) {
  return Object.fromEntries(candidate.branches.map((branch) => [branch.id,
    { totalMarks: branch.marks, distribution: { mode: 'equal' as const } }]))
}

it('keeps the candidate source topology, slots and attempted marks through a JSON round trip', () => {
  const candidate = makeExam002Candidate('tissue')
  expect(parseExam002CandidateSnapshot(JSON.parse(JSON.stringify(candidate)))).toEqual(candidate)
})

it('reopens the finalized provisional wording without changing its captured paper', () => {
  const historical = makeExam002Candidate('tissue', true)
  expect(parseExam002CandidateSnapshot(JSON.parse(JSON.stringify(historical)))).toEqual(historical)
  expect(historical.branches[4].instruction).toBe('Match Similar words')
  expect(historical.branches[6].items[0].question.prompt).toContain('ang hiba')
})

it('rejects source topology, slot and attempt-rule changes', () => {
  const changedInstruction = makeExam002Candidate('tissue')
  changedInstruction.branches[4].instruction = 'Match anything'
  expect(() => parseExam002CandidateSnapshot(changedInstruction)).toThrow('candidate profile')

  const changedSlot = makeExam002Candidate('tissue')
  const [first, second] = changedSlot.branches[1].items
  changedSlot.branches[1].items = [{ ...first, question: second.question }, { ...second, question: first.question }, ...changedSlot.branches[1].items.slice(2)]
  expect(() => parseExam002CandidateSnapshot(changedSlot)).toThrow('question slot')

  const changedAttempt = makeExam002Candidate('tissue')
  changedAttempt.branches[5].attemptCount = 6
  expect(() => parseExam002CandidateSnapshot(changedAttempt)).toThrow('attempt rule')

  const changedTotal = makeExam002Candidate('tissue')
  changedTotal.branches[8].marks = 20
  changedTotal.totalMarks = 70
  expect(() => parseExam002CandidateSnapshot(changedTotal)).toThrow()
})

it('captures teacher totals and custom required points without changing markless source revisions', () => {
  const source = marklessCandidate()
  const before = structuredClone(source)
  const teacherMarks = allocations(source)
  const matching = source.branches[4]
  const points = compoundBranchPointIds(matching)
  const scored = assignCandidateExamMarks(source, [source.bankId], {
    ...teacherMarks,
    q3a: { totalMarks: 7, distribution: { mode: 'custom',
      marksByPoint: Object.fromEntries(points.map((id, index) => [id, [1, 2, 1, 2, 1][index]])) } },
    q3b: { totalMarks: 10, distribution: { mode: 'equal' } },
    q5: { totalMarks: 20, distribution: { mode: 'equal' } },
  })
  expect(scored.schemaVersion).toBe(2)
  expect(scored.totalMarks).toBe(77)
  expect(scored.branches[4].pointMarks).toEqual(Object.fromEntries(points.map((id, index) =>
    [id, [1, 2, 1, 2, 1][index]])))
  expect(Object.values(scored.branches[5].pointMarks!)).toEqual([2, 2, 2, 2, 2, 2])
  expect(Object.values(scored.branches[8].pointMarks!)).toEqual([20, 20])
  expect(source).toEqual(before)
  expect(scored.branches.flatMap((branch) => branch.items).every((item) => item.question.marks === null)).toBe(true)
  expect(parseExam002CandidateSnapshot(JSON.parse(JSON.stringify(scored)))).toEqual(scored)
})

it('rejects missing branch marks, fractional equal splits and unequal optional points', () => {
  const source = marklessCandidate()
  const teacherMarks = allocations(source)
  const { q5: _missing, ...incomplete } = teacherMarks
  expect(() => assignCandidateExamMarks(source, [source.bankId], incomplete)).toThrow('every branch')
  expect(() => assignCandidateExamMarks(source, [source.bankId], {
    ...teacherMarks, q2b: { totalMarks: 7, distribution: { mode: 'equal' } },
  })).toThrow('whole')
  const points = compoundBranchPointIds(source.branches[5])
  expect(() => assignCandidateExamMarks(source, [source.bankId], {
    ...teacherMarks, q3b: { totalMarks: 5, distribution: { mode: 'custom',
      marksByPoint: Object.fromEntries(points.map((id, index) => [id, index ? 1 : 2])) } },
  })).toThrow('Optional points')
})

it('keeps version 2 topology and selected-collection boundaries explicit', () => {
  const source = marklessCandidate()
  const scored = assignCandidateExamMarks(source, [source.bankId], allocations(source))
  const changedAttempt = structuredClone(scored)
  changedAttempt.branches[5].attemptCount = 6
  changedAttempt.branches[5].marks = 6
  changedAttempt.totalMarks++
  expect(() => parseExam002CandidateSnapshot(changedAttempt)).toThrow('candidate profile')
  expect(() => assignCandidateExamMarks(source, [], allocations(source))).toThrow('bank identities')
  expect(() => assignCandidateExamMarks(source, [source.bankId, source.bankId], allocations(source))).toThrow('bank identities')
})
