import { expect, it } from 'vitest'
import { makeExam002Candidate } from './fixtures/phaseTenExam002Candidate'
import { selectExam002MarkedCandidate } from './phaseElevenCandidateSelection'
import { assignCandidateExamMarks, carryCandidateExamMarks } from './phaseTenCandidateProfile'
import { compoundBranchPointIds } from '../domain/compoundStructure'
import { withAtomicCompletion } from './fixtures/atomicCompletionCandidate'
import { projectCompoundPaper } from './compoundWorkflow'

function source() {
  const value = makeExam002Candidate('tissue')
  const questions = value.branches.flatMap((branch) => branch.items.map((item) => item.question))
  questions.forEach((question, index) => { question.marks = null; question.unit = index % 4 + 1 })
  const group = value.branches[0].passageGroup!
  group.children = value.branches[0].items.map(({ question }, index) => ({ position: index + 1, question: structuredClone(question) }))
  const standaloneIds = value.branches.slice(1).flatMap((branch) => branch.items.map((item) => item.question.id))
  return { value, questions, group, standaloneIds }
}

it('selects markless revisions across collections deterministically, with exact passage context and source instructions', () => {
  const { value, questions, group, standaloneIds } = source()
  const before = structuredClone(questions)
  const banks = ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', value.bankId]
  const selected = selectExam002MarkedCandidate([...questions, ...questions], [group], standaloneIds,
    value.ownerId, banks, 15, [1, 2, 3, 4])
  const reversed = selectExam002MarkedCandidate([...questions].reverse(), [group], standaloneIds,
    value.ownerId, banks, 15, [1, 2, 3, 4])
  expect(selected).toEqual(reversed)
  expect(selected.schemaVersion).toBe(2)
  expect(selected.bankIds).toEqual(banks)
  expect(selected.branches[0].passageGroup).toEqual(group)
  expect(selected.branches[3].instruction).toBe(selected.branches[3].items[0].question.prompt)
  const ids = selected.branches.flatMap((branch) => branch.items.map((item) => item.question.id))
  expect(new Set(ids).size).toBe(30)
  expect(questions).toEqual(before)
  expect(selected.branches.every((branch) => branch.items.every(({ question }) => question.marks === null))).toBe(true)
})

it('enforces include-as-lock, exclusions and passage locking through whole-paper reselection', () => {
  const { value, questions, group, standaloneIds } = source()
  const slot = value.branches[2].items[0].question
  const selected = selectExam002MarkedCandidate(questions, [group], standaloneIds, value.ownerId,
    [value.bankId], 4, [1, 2, 3, 4], { lockedQuestionIds: { 'q2a:1': slot.id }, lockedPassageGroupId: group.id })
  expect(selected.branches[2].items[0].question.id).toBe(slot.id)
  expect(() => selectExam002MarkedCandidate(questions, [group], standaloneIds, value.ownerId,
    [value.bankId], 4, [1, 2, 3, 4], { lockedQuestionIds: { 'q2a:1': slot.id }, excludedQuestionIds: [slot.id] })).toThrow('No eligible')
  expect(() => selectExam002MarkedCandidate(questions, [group], standaloneIds, value.ownerId,
    [value.bankId], 4, [1, 2, 3, 4], { excludedPassageGroupIds: [group.id] })).toThrow('No complete')
})

it('rejects withdrawn, foreign and incomplete context without borrowing passage children', () => {
  const { value, questions, group, standaloneIds } = source()
  const onlyStandaloneShort = value.branches[1].items[1].question.id
  const incomplete = questions.filter((question) => question.id !== onlyStandaloneShort)
  expect(() => selectExam002MarkedCandidate(incomplete, [group], [...standaloneIds, ...group.children.map((child) => child.question.id)],
    value.ownerId, [value.bankId], 1, [1, 2, 3, 4])).toThrow('No eligible')
  const withdrawn = questions.map((question) => question.id === onlyStandaloneShort ? { ...question, isActive: false } : question)
  expect(() => selectExam002MarkedCandidate(withdrawn, [group], standaloneIds,
    value.ownerId, [value.bankId], 1, [1, 2, 3, 4])).toThrow('No eligible')
  expect(() => selectExam002MarkedCandidate(questions, [group], standaloneIds,
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', [value.bankId], 1, [1, 2, 3, 4])).toThrow('No complete')
  expect(() => selectExam002MarkedCandidate(questions.slice(1), [group], standaloneIds,
    value.ownerId, [value.bankId], 1, [1, 2, 3, 4])).toThrow('No complete')
})

it('keeps custom teacher marks on the new point identities after replacing a question', () => {
  const { value, questions, group, standaloneIds } = source()
  const selected = selectExam002MarkedCandidate(questions, [group], standaloneIds,
    value.ownerId, [value.bankId], 5, [1, 2, 3, 4])
  const allocations = Object.fromEntries(selected.branches.map((branch) => [branch.id,
    { totalMarks: branch.marks, distribution: { mode: 'custom' as const, marksByPoint: branch.pointMarks! } }]))
  const branch = selected.branches[4]
  allocations.q3a = { totalMarks: 7, distribution: { mode: 'custom', marksByPoint:
    Object.fromEntries(compoundBranchPointIds(branch).map((id, index) => [id, [1, 2, 1, 2, 1][index]])) } }
  const scored = assignCandidateExamMarks(selected, [value.bankId], allocations)
  const replacement = structuredClone(selected)
  replacement.branches[4].items[0].question.id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const before = structuredClone(scored)
  const carried = carryCandidateExamMarks(scored, replacement)
  expect(carried.totalMarks).toBe(62)
  expect(carried.branches[4].marks).toBe(7)
  expect(compoundBranchPointIds(carried.branches[4]).map((id) => carried.branches[4].pointMarks![id])).toEqual([1, 2, 1, 2, 1])
  expect(Object.keys(carried.branches[4].pointMarks!)).not.toEqual(Object.keys(scored.branches[4].pointMarks!))
  expect(scored).toEqual(before)
})

it('composes the complete original six-row completion exercise without copying its canonical questions', () => {
  const base = source()
  const value = withAtomicCompletion(base.value)
  const questions = value.branches.flatMap((branch) => branch.items.map((item) => item.question))
  const ids = value.branches.slice(1).flatMap((branch) => branch.items.map((item) => item.question.id))
  const completion = value.branches[5].completionGroup!
  const selected = selectExam002MarkedCandidate(questions, [base.group], ids, value.ownerId,
    [value.bankId], 1, [1, 2, 3, 4], {}, [completion])
  expect(selected.branches[5].completionGroup).toEqual(completion)
  expect(selected.branches[5].items.map((item) => item.question.id)).toEqual(completion.childIds)
  expect(selected.branches.flatMap((branch) => branch.items)).toHaveLength(35)
  const paper = projectCompoundPaper(selected, { schoolName: 'Test', examTitle: 'Test', teacherName: '', grade: 6,
    unit: 1, marksPerQuestion: 1, questionCount: 35, selectionSeed: 1 }, 'Answer all questions.', [1, 2, 3, 4])
  const rows = paper.answerKey.Answers.filter((row) => row.Q === '3' && row.Part === 'B')
  expect(rows.map((row) => row.Point)).toEqual(['1', '2', '3', '4', '5', '6'])
  expect(rows.every((row) => row.Rule === 'Answer 5 of 6' && row.Mark === 1 && row.Total === 5)).toBe(true)
  expect(rows.map((row) => row.Answer)).toEqual(value.branches[5].items.map(({ question }) =>
    question.type === 'completion' ? question.answer.answers['1'] : ''))
  const incomplete = { ...completion, childIds: completion.childIds.slice(0, 5) }
  expect(() => selectExam002MarkedCandidate(questions, [base.group], ids, value.ownerId,
    [value.bankId], 1, [1, 2, 3, 4], {}, [incomplete])).toThrow('No eligible')
  expect(() => selectExam002MarkedCandidate(questions, [base.group], ids, value.ownerId,
    [value.bankId], 1, [1, 2, 3, 4], { excludedQuestionIds: [completion.childIds[3]] }, [completion])).toThrow('No eligible')
})

it('counts every original completion child when checking whether unit coverage remains feasible', () => {
  const base = source()
  base.questions.forEach(question => { question.unit = 1 })
  base.value.branches[0].items[0].question.unit = 2
  base.value.branches[0].items[1].question.unit = 3
  base.group.children = base.value.branches[0].items.map(({ question }, index) =>
    ({ position: index + 1, question: structuredClone(question) }))
  const value = withAtomicCompletion(base.value)
  value.branches[5].items[4].question.unit = 4
  const questions = value.branches.flatMap(branch => branch.items.map(item => item.question))
  const standalone = value.branches.slice(1).flatMap(branch => branch.items.map(item => item.question.id))
  const selected = selectExam002MarkedCandidate(questions, [base.group], standalone, value.ownerId,
    [value.bankId], 1, [1, 2, 3, 4], {}, [value.branches[5].completionGroup!])
  expect(selected.branches[5].items[4].question.unit).toBe(4)
  expect(new Set(selected.branches.flatMap(branch => branch.items.map(item => item.question.unit)))).toEqual(new Set([1, 2, 3, 4]))
})
