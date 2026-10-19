import { describe, expect, it } from 'vitest'
import { MANUAL_MARKING_NOTE } from '../domain/questionDomain'
import {
  normalizeQuestionInput,
  questionInputPayload,
  questionToExamQuestion,
  questionToInput,
  questionToPhaseNineQuestion,
  validateQuestionInput,
  type Question,
  type QuestionInput,
} from './questions'

const BANK_ID = '123e4567-e89b-42d3-a456-426614174000'
const OWNER_ID = '223e4567-e89b-42d3-a456-426614174000'

function input(overrides: Partial<QuestionInput>): QuestionInput {
  return {
    bankId: BANK_ID,
    externalId: 'REP-MIN-R1-Q4A',
    unit: 1,
    lesson: 'representative',
    questionType: 'rewrite',
    difficulty: 'medium',
    prompt: 'are basim and hiba twins',
    marks: 10,
    options: [],
    correctOptionLabel: '',
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
    current_revision: 1,
    created_at: '2026-09-17T00:00:00.000Z',
    updated_at: '2026-09-17T00:00:00.000Z',
    ...questionInputPayload(normalized),
  } as Question
}

const rewrite = input({
  rewriteInstruction:
    'Rewrite the sentence using capital letters and punctuation marks.',
  rewriteAcceptedAnswers: ['Are Basim and Hiba twins ?'],
})

const writingA = input({
  externalId: 'REP-MIN-R1-Q5-A',
  questionType: 'extended-writing',
  prompt: 'Write two notes to your brother and sister.',
  marks: 20,
  writingMinimumWords: null,
  writingMaximumWords: null,
  writingGuidance: {
    modelAnswer: '',
    rubricCriteria: [],
    manualOnly: true,
  },
})

const writingB = input({
  externalId: 'REP-MIN-R1-Q5-B',
  questionType: 'extended-writing',
  prompt: 'Write an email to your friend.',
  marks: 20,
  writingMinimumWords: null,
  writingMaximumWords: null,
  writingGuidance: {
    modelAnswer: '',
    rubricCriteria: [],
    manualOnly: true,
  },
})

describe('Phase 9B source-faithful rewrite and writing authoring', () => {
  it.each([
    ['rewrite', rewrite],
    ['writing A', writingA],
    ['writing B', writingB],
  ] as const)('round-trips the ministerial %s content without rewriting it', (_name, draft) => {
    expect(validateQuestionInput(draft)).toEqual({})
    const id = `${_name === 'rewrite' ? '7' : _name === 'writing A' ? '8' : '9'}23e4567-e89b-42d3-a456-426614174000`
    expect(questionToInput(persisted(id, draft))).toEqual(
      normalizeQuestionInput(draft),
    )
    expect(questionToPhaseNineQuestion(persisted(id, draft))).toMatchObject({
      id,
      type: draft.questionType,
      prompt: draft.prompt,
      marks: draft.marks,
    })
  })

  it('stores the exact approved manual-marking note and no invented model', () => {
    const payload = questionInputPayload(normalizeQuestionInput(writingA))
    expect(payload.answer).toEqual({
      type: 'extended-writing',
      schemaVersion: 1,
      manualMarkingNote: MANUAL_MARKING_NOTE,
    })
    expect(payload.content).not.toHaveProperty('alternatives')
  })

  it('requires either approved guidance or the manual-only declaration', () => {
    expect(
      validateQuestionInput({
        ...writingA,
        writingGuidance: {
          modelAnswer: '',
          rubricCriteria: [],
          manualOnly: false,
        },
      }),
    ).toHaveProperty('writingGuidance')
  })

  it('rejects invented guidance combined with the manual-only declaration', () => {
    expect(
      validateQuestionInput({
        ...writingA,
        writingGuidance: {
          modelAnswer: 'Invented model text.',
          rubricCriteria: [],
          manualOnly: true,
        },
      }),
    ).toHaveProperty('writingGuidance')
  })

  it('keeps the A-or-B choice out of the atomic writing payload and renderer', () => {
    expect(() =>
      questionToExamQuestion(
        persisted('a23e4567-e89b-42d3-a456-426614174000', writingA),
      ),
    ).toThrow('not supported by simple-question selection')
  })
})
