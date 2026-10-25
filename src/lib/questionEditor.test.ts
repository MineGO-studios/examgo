import { describe, expect, it } from 'vitest'
import type { Question } from './questions'
import { questionInputPayload, questionToInput, validateQuestionInput } from './questions'
import {
  addQuestionOption,
  createEmptyQuestionInput,
  removeQuestionOption,
  sortQuestions,
} from './questionEditor'

const QUESTION: Question = {
  id: '223e4567-e89b-42d3-a456-426614174000',
  owner_id: '323e4567-e89b-42d3-a456-426614174000',
  bank_id: '123e4567-e89b-42d3-a456-426614174000',
  external_id: 'U1-Q010',
  unit: 1,
  lesson: '2',
  question_type: 'multiple-choice',
  difficulty: 'medium',
  prompt: 'Choose the correct answer.',
  options: [
    { label: 'A', text: 'First' },
    { label: 'B', text: 'Second' },
  ],
  correct_option_label: 'B',
  schema_version: 1,
  marks: 1,
  content: {
    type: 'multiple-choice',
    schemaVersion: 1,
    options: [
      { label: 'A', text: 'First' },
      { label: 'B', text: 'Second' },
    ],
  },
  answer: {
    type: 'multiple-choice',
    schemaVersion: 1,
    correctOptionLabel: 'B',
  },
  current_revision: 1,
  is_active: true,
  created_at: '2026-09-10T12:00:00.000Z',
  updated_at: '2026-09-10T12:00:00.000Z',
}

describe('question editor state', () => {
  it('reopens matching item identities and one-to-one answers for editing', () => {
    const matching: Question = { ...QUESTION, question_type: 'matching', prompt: 'Match List A and List B.',
      options: null, correct_option_label: null,
      content: { type: 'matching', schemaVersion: 1,
        left: [{ id: 'l1', text: 'Can I help you?' }, { id: 'l2', text: "What's the matter?" }],
        right: [{ id: 'r1', text: 'I have a headache' }, { id: 'r2', text: 'Yes, please' }] },
      answer: { type: 'matching', schemaVersion: 1,
        pairs: [{ leftId: 'l1', rightId: 'r2' }, { leftId: 'l2', rightId: 'r1' }] } }
    const reopened = questionToInput(matching)
    expect(reopened.matchingLeft?.map((item) => item.id)).toEqual(['l1', 'l2'])
    expect(questionInputPayload(reopened).answer).toEqual(matching.answer)
    expect(validateQuestionInput(reopened)).toEqual({})
    const reused = { ...reopened, matchingPairs: [{ leftId: 'l1', rightId: 'r2' }, { leftId: 'l2', rightId: 'r2' }] }
    expect(validateQuestionInput(reused).matchingPairs).toContain('one unique pair')
  })
  it('creates a valid-shape blank draft for the selected bank', () => {
    const draft = createEmptyQuestionInput(QUESTION.bank_id)

    expect(draft).toMatchObject({
      bankId: QUESTION.bank_id,
      unit: 1,
      lesson: '1',
      questionType: 'multiple-choice',
      difficulty: 'medium',
      correctOptionLabel: 'A',
      isActive: true,
    })
    expect(draft.externalId).toMatch(
      /^Q-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
    expect(draft.options).toHaveLength(3)
  })

  it('adds no more than six answer options', () => {
    let options = createEmptyQuestionInput(
      QUESTION.bank_id,
    ).options

    options = addQuestionOption(options)
    options = addQuestionOption(options)
    options = addQuestionOption(options)
    const capped = addQuestionOption(options)

    expect(capped).toHaveLength(6)
    expect(capped).toBe(options)
  })

  it('never removes options below the schema minimum', () => {
    const twoOptions = QUESTION.options as Array<{
      label: string
      text: string
    }>

    expect(removeQuestionOption(twoOptions, 0)).toBe(twoOptions)
  })

  it('maps a stored question into normalized editable input', () => {
    expect(questionToInput(QUESTION)).toEqual({
      bankId: QUESTION.bank_id,
      externalId: 'U1-Q010',
      unit: 1,
      lesson: '2',
      questionType: 'multiple-choice',
      difficulty: 'medium',
      prompt: 'Choose the correct answer.',
      marks: 1,
      options: [
        { label: 'A', text: 'First' },
        { label: 'B', text: 'Second' },
      ],
      correctOptionLabel: 'B',
      binaryLabelMode: 'true-false',
      binaryAnswer: true,
      canonicalAnswer: '',
      approvedVariants: [],
      caseSensitive: false,
      answerLines: 2,
      isActive: true,
    })
  })

  it('rejects malformed stored options instead of editing unsafe data', () => {
    expect(() =>
      questionToInput({
        ...QUESTION,
        options: [{ label: 'A' }],
        content: {
          type: 'multiple-choice',
          schemaVersion: 1,
          options: [{ label: 'A' }],
        },
      }),
    ).toThrow(
      'This question contains invalid saved data and cannot be used safely.',
    )
  })

  it('sorts by unit, lesson, then external ID without mutation', () => {
    const questions = [
      QUESTION,
      { ...QUESTION, id: '2', external_id: 'U1-Q002' },
      {
        ...QUESTION,
        id: '3',
        external_id: 'U2-Q001',
        unit: 2,
        lesson: '1',
      },
    ]

    const sorted = sortQuestions(questions)

    expect(sorted.map((question) => question.external_id)).toEqual([
      'U1-Q002',
      'U1-Q010',
      'U2-Q001',
    ])
    expect(questions[0]).toBe(QUESTION)
  })
})
