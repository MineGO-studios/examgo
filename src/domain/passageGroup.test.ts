import { describe, expect, it } from 'vitest'
import { validatePassageGroup, type PassageGroup } from './passageGroup'
import type { DomainQuestion } from './questionDomain'
import { makeExam002Candidate } from '../lib/fixtures/phaseTenExam002Candidate'

// Exam_002.docx Q1/A and its paired Answers_001.docx supply the six prompts and answers.
const ownerId = '223e4567-e89b-42d3-a456-426614174000'
const bankId = '123e4567-e89b-42d3-a456-426614174000'
const sourceItems = [
  ['Where does Wisam’s father work?', 'An office'],
  ['Who is a nurse?', 'Wisam’s mother'],
  ['What time does Dania leave home?', 'She leaves home at 7:30'],
  ['How many days a week does Wisam’s mother work?', 'Three days'],
  ['How many days a week does Wisam’s father work?', 'Five days'],
  ['Where does Wisam’s mother work?', 'She works in the hospital'],
] as const

const children = sourceItems.map(([prompt, canonicalAnswer], index) => ({
  position: index + 1,
  question: {
    id: `323e4567-e89b-42d3-a456-42661417400${index}`,
    ownerId,
    bankId,
    externalId: `Q1A-${index + 1}`,
    unit: 1,
    lesson: 'representative',
    difficulty: 'medium',
    prompt,
    marks: 1,
    isActive: true,
    revision: 1,
    type: 'short-answer',
    schemaVersion: 1,
    content: { type: 'short-answer', schemaVersion: 1, answerLines: 1 },
    answer: { type: 'short-answer', schemaVersion: 1, canonicalAnswer, approvedVariants: [] },
  } satisfies DomainQuestion,
}))

const sourceGroup: PassageGroup = {
  id: '423e4567-e89b-42d3-a456-426614174000',
  ownerId,
  bankId,
  revision: 1,
  schemaVersion: 1,
  title: null,
  // The owner approved clarifying the source's mismatched True/False instruction.
  instruction: 'Read the passage and answer the questions. (5 only)',
  arabicInstruction: 'اقرأ القطعة الآتية بعناية ثم أجب عن الأسئلة. (خمسة فقط)',
  passage: 'Hello, my name is Wisam. My mum is a nurse and my dad work in an office. He’s an IT programmer. He makes programs about buildings. My sister, Dania and I go to school by bus. We leave home at 7:30. My dad works five days a week, but my mum only works three days a week. When she is not working in the hospital. She is a housewife at home. She has two jobs.',
  attemptCount: 5,
  expectedMarks: 5,
  children,
}

describe('passage group contract', () => {
  it('accepts source-backed ordered children and five-of-six scoring', () => {
    expect(validatePassageGroup(sourceGroup)).toEqual({ success: true })
    expect(validatePassageGroup(JSON.parse(JSON.stringify(sourceGroup)))).toEqual({ success: true })
  })

  it('accepts a passage whose child and group marks are assigned only in an exam', () => {
    const markless: PassageGroup = { ...sourceGroup, expectedMarks: null,
      children: children.map((child) => ({ ...child, question: { ...child.question, marks: null } })) }
    expect(validatePassageGroup(markless)).toEqual({ success: true })
    expect(validatePassageGroup({ ...markless, expectedMarks: 5 }).success).toBe(false)
    const historicalMetadata = { ...markless, expectedMarks: 5 }
    expect(validatePassageGroup(historicalMetadata, { examOwnedMarks: true })).toEqual({ success: true })
    expect(historicalMetadata.expectedMarks).toBe(5)
    expect(validatePassageGroup({ ...historicalMetadata, expectedMarks: 1001 },
      { examOwnedMarks: true }).success).toBe(false)
  })

  it('accepts a scorable binary, choice and short-answer mix with the source question identities', () => {
    // Q1/B supplies approved types; this synthetic mix tests the group contract,
    // not approval to move the source's Q1/B branch under the Q1/A passage.
    const q1b = makeExam002Candidate('tissue').branches[1]
    const mixed: PassageGroup = { ...sourceGroup,
      ownerId: q1b.items[0].question.ownerId, bankId: q1b.items[0].question.bankId,
      children: q1b.items.map((item, index) => ({ position: index + 1, question: item.question })),
      attemptCount: 5, expectedMarks: 5,
    }
    expect(new Set(mixed.children.map((child) => child.question.type))).toEqual(new Set(['binary', 'short-answer', 'multiple-choice']))
    expect(validatePassageGroup(mixed)).toEqual({ success: true })
  })

  it('rejects detached, duplicate, or reordered children', () => {
    const detached = { ...sourceGroup, children: children.map((child, index) => index === 2
      ? { ...child, question: { ...child.question, bankId: '523e4567-e89b-42d3-a456-426614174000' } }
      : child) }
    const duplicate = { ...sourceGroup, children: children.map((child, index) => index === 3
      ? { ...child, question: { ...child.question, id: children[0].question.id } }
      : child) }
    const reordered = { ...sourceGroup, children: [...children].reverse() }
    for (const value of [detached, duplicate, reordered]) expect(validatePassageGroup(value).success).toBe(false)
  })

  it('rejects wrong attempt-aware marks, uneven optional marks, and invalid answers', () => {
    expect(validatePassageGroup({ ...sourceGroup, expectedMarks: 6 }).success).toBe(false)
    expect(validatePassageGroup({ ...sourceGroup, children: children.map((child, index) => index === 0
      ? { ...child, question: { ...child.question, marks: 2 } }
      : child) }).success).toBe(false)
    expect(validatePassageGroup({ ...sourceGroup, children: children.map((child, index) => index === 0
      ? { ...child, question: { ...child.question, answer: { ...child.question.answer, canonicalAnswer: '' } } }
      : child) }).success).toBe(false)
  })
})
