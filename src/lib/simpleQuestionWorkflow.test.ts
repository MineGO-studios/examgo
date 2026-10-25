import { describe, expect, it } from 'vitest'
import type { QuestionInput, Question } from './questions'
import {
  normalizeQuestionInput,
  questionInputPayload,
  questionToExamQuestion,
  questionToInput,
  validateQuestionInput,
} from './questions'
import { prepareExamQuestions } from './generateExam'
import {
  createQuestionReview,
  replaceQuestionInReview,
  toggleQuestionLock,
} from './reviewQuestions'
import { DEFAULT_EXAM_QUESTION_FILTERS, DEFAULT_EXAM_SETTINGS } from '../types/exam'

const BANK_ID = '123e4567-e89b-42d3-a456-426614174000'
const OWNER_ID = '223e4567-e89b-42d3-a456-426614174000'

function input(overrides: Partial<QuestionInput>): QuestionInput {
  return {
    bankId: BANK_ID,
    externalId: 'Q-1',
    unit: 1,
    lesson: '1',
    questionType: 'multiple-choice',
    difficulty: 'medium',
    prompt: 'Choose the correct answer.',
    marks: 2,
    options: [{ label: 'A', text: 'Wrong' }, { label: 'B', text: 'Correct' }],
    correctOptionLabel: 'B',
    binaryLabelMode: 'true-false',
    binaryAnswer: true,
    canonicalAnswer: '',
    approvedVariants: [],
    caseSensitive: false,
    answerLines: 2,
    isActive: true,
    ...overrides,
  }
}

function persisted(id: string, draft: QuestionInput): Question {
  const normalized = normalizeQuestionInput(draft)
  return {
    id,
    owner_id: OWNER_ID,
    bank_id: normalized.bankId,
    external_id: normalized.externalId,
    unit: normalized.unit,
    lesson: normalized.lesson,
    question_type: normalized.questionType,
    difficulty: normalized.difficulty,
    prompt: normalized.prompt,
    marks: normalized.marks,
    is_active: normalized.isActive,
    current_revision: 2,
    created_at: '2026-09-16T00:00:00.000Z',
    updated_at: '2026-09-16T00:00:00.000Z',
    ...questionInputPayload(normalized),
  } as Question
}

describe('simple question workflow', () => {
  it('round-trips MCQ, binary labels, and short-answer reference variants', () => {
    const drafts = [
      input({ externalId: 'MCQ-1' }),
      input({ externalId: 'BIN-1', questionType: 'binary', prompt: 'Iraq is in Asia.', marks: 1, binaryLabelMode: 'yes-no', binaryAnswer: true }),
      input({ externalId: 'SHORT-1', questionType: 'short-answer', prompt: 'Name the capital of Iraq.', marks: 3, canonicalAnswer: 'Baghdad', approvedVariants: ['Baghdad city'], answerLines: 3 }),
    ]

    drafts.forEach((draft, index) => {
      expect(validateQuestionInput(draft)).toEqual({})
      const row = persisted(`${index + 3}23e4567-e89b-42d3-a456-426614174000`, draft)
      const reopened = questionToInput(row)
      expect(reopened).toMatchObject({
        bankId: BANK_ID,
        externalId: draft.externalId,
        questionType: draft.questionType,
        prompt: draft.prompt,
        marks: draft.marks,
      })
      if (draft.questionType === 'multiple-choice') expect(reopened).toMatchObject({ options: draft.options, correctOptionLabel: draft.correctOptionLabel })
      if (draft.questionType === 'binary') expect(reopened).toMatchObject({ binaryLabelMode: draft.binaryLabelMode, binaryAnswer: draft.binaryAnswer })
      if (draft.questionType === 'short-answer') expect(reopened).toMatchObject({ canonicalAnswer: draft.canonicalAnswer, approvedVariants: draft.approvedVariants, answerLines: draft.answerLines })
      expect(questionToExamQuestion(row)).toMatchObject({ type: draft.questionType, marks: draft.marks, prompt: draft.prompt })
    })
  })

  it('selects, reviews, locks, and replaces a mixed exam without duplicates', () => {
    const rows = [
      persisted('323e4567-e89b-42d3-a456-426614174000', input({ externalId: 'MCQ-1' })),
      persisted('423e4567-e89b-42d3-a456-426614174000', input({ externalId: 'BIN-1', questionType: 'binary', marks: 1 })),
      persisted('523e4567-e89b-42d3-a456-426614174000', input({ externalId: 'BIN-2', questionType: 'binary', marks: 2, binaryAnswer: false })),
      persisted('623e4567-e89b-42d3-a456-426614174000', input({ externalId: 'SHORT-1', questionType: 'short-answer', marks: 3, canonicalAnswer: 'Baghdad' })),
    ]
    const pool = rows.map((row) => questionToExamQuestion(row))
    const settings = {
      ...DEFAULT_EXAM_SETTINGS,
      questionCount: 3,
      selectionSeed: 8162026,
      questionQuantities: { 'multiple-choice': 1, binary: 1, 'short-answer': 1 },
    }
    const selected = prepareExamQuestions(settings, pool)
    expect(selected.map((question) => question.type)).toEqual(['multiple-choice', 'binary', 'short-answer'])
    expect(new Set(selected.map((question) => question.id)).size).toBe(3)

    let review = createQuestionReview(selected)
    const binaryId = review.find((item) => item.question.type === 'binary')?.question.id
    expect(binaryId).toBeDefined()
    review = toggleQuestionLock(review, binaryId!)
    expect(() => replaceQuestionInReview(review, binaryId!, pool, settings, DEFAULT_EXAM_QUESTION_FILTERS)).toThrow('Unlock')
    review = toggleQuestionLock(review, binaryId!)
    review = replaceQuestionInReview(review, binaryId!, pool, settings, DEFAULT_EXAM_QUESTION_FILTERS)
    expect(review.find((item) => item.question.type === 'binary')?.question.id).not.toBe(binaryId)
    expect(new Set(review.map((item) => item.question.id)).size).toBe(3)
  })
})
