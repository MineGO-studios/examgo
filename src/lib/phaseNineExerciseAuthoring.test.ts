import { describe, expect, it } from 'vitest'
import type { QuestionInput } from './questions'
import {
  normalizeQuestionInput,
  questionInputPayload,
  questionToExamQuestion,
  questionToInput,
  questionToPhaseNineQuestion,
  validateQuestionInput,
  type Question,
} from './questions'

const BANK_ID = '123e4567-e89b-42d3-a456-426614174000'
const OWNER_ID = '223e4567-e89b-42d3-a456-426614174000'

function input(overrides: Partial<QuestionInput>): QuestionInput {
  return {
    bankId: BANK_ID,
    externalId: 'REP-MIN-R1-Q3A',
    unit: 1,
    lesson: 'representative',
    questionType: 'completion',
    difficulty: 'medium',
    prompt: 'Use the words in the box to complete the sentences.',
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

const completion = input({
  completionText: [
    'We are shopping in the ..........',
    'Eight .......... go round the sun.',
    'Jeans are made of ..........',
    'The supermarket ad says food .......... are going down this week.',
    'You grate with a ..........',
  ].join('\n'),
  completionBlankIds: [
    'blank-1',
    'blank-2',
    'blank-3',
    'blank-4',
    'blank-5',
  ],
  completionWordBank: ['planets', 'grater', 'prices', 'mall', 'denim'],
  completionWordBankOrder: 'unordered',
  completionAllowWordReuse: false,
  completionRequireAllWordsUsed: true,
  completionAnswers: {
    'blank-1': 'mall',
    'blank-2': 'planets',
    'blank-3': 'denim',
    'blank-4': 'prices',
    'blank-5': 'grater',
  },
})

const oddWord = input({
  externalId: 'REP-MIN-R1-Q3B-1',
  questionType: 'odd-word',
  prompt: 'saucepan / knife / fork / spoon',
  marks: 2,
  oddWords: ['saucepan', 'knife', 'fork', 'spoon'],
  oddWordAnswer: 'saucepan',
})

const relationship = input({
  externalId: 'REP-MIN-R1-Q4B-1',
  questionType: 'word-relationship',
  prompt: 'doct, doctor ; wait, ..........',
  marks: 2,
  relationshipWords: ['doct', 'doctor'],
  relationshipAcceptedAnswers: ['waiter'],
})

describe('Phase 9A ministerial exercise authoring', () => {
  it.each([
    ['completion', completion],
    ['odd-word', oddWord],
    ['word-relationship', relationship],
  ] as const)('round-trips the source-backed %s payload without rewriting it', (_type, draft) => {
    expect(validateQuestionInput(draft)).toEqual({})
    const row = persisted(
      `${_type === 'completion' ? '3' : _type === 'odd-word' ? '4' : '5'}23e4567-e89b-42d3-a456-426614174000`,
      draft,
    )
    expect(questionToInput(row)).toEqual(normalizeQuestionInput(draft))
    expect(questionToPhaseNineQuestion(row)).toMatchObject({
      id: row.id,
      type: draft.questionType,
      prompt: draft.prompt,
      marks: draft.marks,
    })
  })

  it('rejects completion answers outside the supplied bank and forbidden reuse', () => {
    expect(
      validateQuestionInput({
        ...completion,
        completionAnswers: {
          ...(completion.completionAnswers ?? {}),
          'blank-2': 'mall',
          'blank-3': 'outside-bank',
        },
      }),
    ).toHaveProperty('completionAnswers')
  })

  it('rejects an odd-word answer that is not in the displayed set', () => {
    expect(
      validateQuestionInput({ ...oddWord, oddWordAnswer: 'plate' }),
    ).toHaveProperty('oddWordAnswer')
  })

  it('requires both demonstrated forms and one canonical missing form', () => {
    expect(
      validateQuestionInput({
        ...relationship,
        relationshipWords: ['doct', ''],
        relationshipAcceptedAnswers: [],
      }),
    ).toMatchObject({
      relationshipWords: expect.any(String),
      relationshipAcceptedAnswers: expect.any(String),
    })
  })

  it('does not flatten Phase 9A exercises into the Phase 8 renderer', () => {
    expect(() =>
      questionToExamQuestion(
        persisted('623e4567-e89b-42d3-a456-426614174000', completion),
      ),
    ).toThrow('not supported by simple-question selection')
  })
})
