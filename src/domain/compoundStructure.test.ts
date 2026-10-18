import { expect, it } from 'vitest'
import type { DomainQuestion } from './questionDomain'
import { compoundBranchPointIds, parseCompoundSnapshot, type CompoundSnapshot } from './compoundStructure'

const ownerId = '22222222-2222-4222-8222-222222222222'
const bankId = '33333333-3333-4333-8333-333333333333'
function short(index: number): Extract<DomainQuestion, { type: 'short-answer' }> {
  return { id: `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`, ownerId, bankId,
    externalId: `Q1A-${index}`, unit: 1, lesson: 'representative', difficulty: 'medium',
    prompt: index === 1 ? 'Where does Wisam’s father work?' : 'Who is a nurse?',
    type: 'short-answer', schemaVersion: 1, marks: 1, isActive: true, revision: 1,
    content: { type: 'short-answer', schemaVersion: 1, answerLines: 1 },
    answer: { type: 'short-answer', schemaVersion: 1, canonicalAnswer: index === 1 ? 'An office' : 'Wisam’s mother', approvedVariants: [] } }
}
const one = short(1); const two = short(2)
const passage = {
  id: '44444444-4444-4444-8444-444444444444', ownerId, bankId, revision: 1, schemaVersion: 1 as const,
  title: 'Wisam', instruction: 'Read the passage and answer the questions. (1 only)', arabicInstruction: null,
  passage: 'Hello, my name is Wisam. My mum is a nurse and my dad work in an office.',
  attemptCount: 1, expectedMarks: 1,
  children: [{ position: 1, question: one }, { position: 2, question: two }],
}
function snapshot(): CompoundSnapshot {
  return { schemaVersion: 1, ownerId, bankId, selectionSeed: 8162026, totalMarks: 1,
    branches: [{ id: 'q1a', mainQuestionNumber: 1, branchLabel: 'A', kind: 'passage',
      instruction: passage.instruction, arabicInstruction: null, marks: 1, attemptCount: 1,
      passageGroup: passage,
      items: [{ label: '1', question: one }, { label: '2', question: two }] }] }
}

it('round-trips a source-backed passage branch with ordered child revisions and attempt-aware marks', () => {
  const value = snapshot()
  expect(parseCompoundSnapshot(JSON.parse(JSON.stringify(value)))).toEqual(value)
})

it('rejects lost group identity, changed child revision, duplicate child and invalid attempt marks', () => {
  const missing = snapshot(); delete missing.branches[0].passageGroup
  expect(() => parseCompoundSnapshot(missing)).toThrow('saved group')
  const stale = snapshot(); stale.branches[0].items[0].question = { ...one, revision: 2 }
  expect(() => parseCompoundSnapshot(stale)).toThrow('revisions changed')
  const answerChanged = snapshot(); answerChanged.branches[0].items[0].question = { ...one, answer: { ...one.answer, canonicalAnswer: 'A hospital' } }
  expect(() => parseCompoundSnapshot(answerChanged)).toThrow('content')
  const repeated = snapshot(); repeated.branches[0].items[1].question = one
  expect(() => parseCompoundSnapshot(repeated)).toThrow('twice')
  const marks = snapshot(); marks.branches[0].marks = 2; marks.totalMarks = 2
  expect(() => parseCompoundSnapshot(marks)).toThrow('group')
})

it('rejects branch label reversal and double-counted alternatives', () => {
  const reversed = snapshot()
  reversed.branches.push({ ...reversed.branches[0], id: 'q1b', branchLabel: 'B', passageGroup: undefined,
    kind: 'questions', items: [{ label: '1', question: short(3) }], marks: 1, attemptCount: 1 })
  reversed.totalMarks = 2
  expect(parseCompoundSnapshot(reversed).branches.map((branch) => branch.branchLabel)).toEqual(['A', 'B'])
  reversed.branches.reverse()
  expect(() => parseCompoundSnapshot(reversed)).toThrow('source order')
  const double = snapshot()
  double.branches[0] = { ...double.branches[0], kind: 'alternatives', passageGroup: undefined,
    items: [{ label: 'A', question: one }, { label: 'B', question: two }], marks: 2 }
  double.totalMarks = 2
  expect(() => parseCompoundSnapshot(double)).toThrow('Optional children')
})

it('captures custom exam-owned passage marks without changing canonical children or source metadata', () => {
  const value = structuredClone(snapshot())
  value.schemaVersion = 2
  value.bankIds = [bankId]
  value.totalMarks = 5
  const branch = value.branches[0]
  branch.marks = 5; branch.attemptCount = 2
  branch.passageGroup!.attemptCount = 2
  branch.passageGroup!.expectedMarks = null
  branch.items.forEach((item) => { item.question.marks = null })
  branch.passageGroup!.children.forEach((child) => { child.question.marks = null })
  const ids = compoundBranchPointIds(branch)
  branch.pointMarks = { [ids[0]]: 2, [ids[1]]: 3 }
  expect(parseCompoundSnapshot(value)).toEqual(value)
  expect(branch.items.every((item) => item.question.marks === null)).toBe(true)
  const missing = structuredClone(value); delete missing.branches[0].pointMarks![ids[1]]
  expect(() => parseCompoundSnapshot(missing)).toThrow(/every point/)
  const fractional = structuredClone(value); fractional.branches[0].pointMarks![ids[1]] = 2.5
  expect(() => parseCompoundSnapshot(fractional)).toThrow(/whole/)
  const sum = structuredClone(value); sum.branches[0].pointMarks![ids[1]] = 2
  expect(() => parseCompoundSnapshot(sum)).toThrow(/add up/)
  const extra = structuredClone(value); extra.branches[0].pointMarks!.unrelated = 1
  expect(() => parseCompoundSnapshot(extra)).toThrow(/every point/)
  const legacy = snapshot(); legacy.branches[0].pointMarks = { [ids[0]]: 1, [ids[1]]: 1 }
  expect(() => parseCompoundSnapshot(legacy)).toThrow(/version 2/)
  const derived = structuredClone(value)
  derived.bankId = '55555555-5555-4555-8555-555555555555'
  derived.bankIds = [derived.bankId, bankId]
  expect(parseCompoundSnapshot(derived).branches[0].items[0].question.bankId).toBe(bankId)
  const duplicateBanks = structuredClone(derived); duplicateBanks.bankIds = [derived.bankId, derived.bankId]
  expect(() => parseCompoundSnapshot(duplicateBanks)).toThrow(/distinct bank/)
  const foreign = structuredClone(derived); foreign.branches[0].items[0].question.ownerId = derived.bankId
  expect(() => parseCompoundSnapshot(foreign)).toThrow(/owned bank/)
})
