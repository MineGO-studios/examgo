import { describe, expect, it } from 'vitest'
import {
  normalizeQuestionInput,
  questionInputPayload,
  questionToExamQuestion,
  validateQuestionInput,
  type Question,
  type QuestionInput,
} from './questions'

const VALID_INPUT: QuestionInput = {
  bankId: ' 123e4567-e89b-42d3-a456-426614174000 ',
  externalId: ' U1-Q001 ',
  unit: 1,
  lesson: ' Lesson 1 ',
  questionType: 'multiple-choice',
  difficulty: 'medium',
  prompt: ' Choose the correct answer. ',
  marks: 1,
  options: [
    { label: ' a ', text: ' First answer ' },
    { label: ' b ', text: ' Second answer ' },
  ],
  correctOptionLabel: ' b ',
  binaryLabelMode: 'true-false',
  binaryAnswer: true,
  canonicalAnswer: '',
  approvedVariants: [],
  caseSensitive: false,
  answerLines: 2,
  isActive: true,
}

const NORMALIZED_INPUT = normalizeQuestionInput(VALID_INPUT)

describe('question input', () => {
  it('normalizes text and option labels', () => {
    const normalized = normalizeQuestionInput(VALID_INPUT)

    expect(normalized).toEqual({
      ...VALID_INPUT,
      bankId: '123e4567-e89b-42d3-a456-426614174000',
      externalId: 'U1-Q001',
      lesson: 'Lesson 1',
      prompt: 'Choose the correct answer.',
      options: [
        { label: 'A', text: 'First answer' },
        { label: 'B', text: 'Second answer' },
      ],
      correctOptionLabel: 'B',
    })

    expect(validateQuestionInput(normalized)).toEqual({})
  })

  it('does not modify the original input', () => {
    const original = structuredClone(VALID_INPUT)

    normalizeQuestionInput(VALID_INPUT)

    expect(VALID_INPUT).toEqual(original)
  })

  it('reports invalid scalar fields', () => {
    const errors = validateQuestionInput({
        ...NORMALIZED_INPUT,
        bankId: 'invalid',
        externalId: ' ',
        unit: 1.5,
        lesson: ' ',
        questionType:
        'true-false' as QuestionInput['questionType'],
        difficulty:
        'impossible' as QuestionInput['difficulty'],
        prompt: ' ',
        isActive: 'yes' as unknown as boolean,
    })

    expect(errors).toEqual({
        bankId: 'A valid question bank is required.',
        externalId:
        'Question ID must contain between 1 and 80 characters.',
        unit: 'Unit must be a whole number between 1 and 8.',
        lesson:
        'Lesson must contain between 1 and 40 characters.',
        questionType:
        'Select a supported question type.',
        difficulty: 'Select a valid difficulty.',
        prompt:
        'Question text must contain between 1 and 2000 characters.',
        isActive: 'Question status must be valid.',
    })
    })

    it('rejects values above schema length limits', () => {
    expect(
        validateQuestionInput({
        ...NORMALIZED_INPUT,
        externalId: 'Q'.repeat(81),
        lesson: 'L'.repeat(41),
        prompt: 'P'.repeat(2001),
        }),
    ).toMatchObject({
        externalId:
        'Question ID must contain between 1 and 80 characters.',
        lesson:
        'Lesson must contain between 1 and 40 characters.',
        prompt:
        'Question text must contain between 1 and 2000 characters.',
    })
    })

    it('requires between two and six options', () => {
    const errors = validateQuestionInput({
        ...NORMALIZED_INPUT,
        options: [{ label: 'A', text: 'Only answer' }],
    })

    expect(errors.options).toBe(
        'Provide between 2 and 6 answer options.',
    )
    })

    it('rejects incomplete options', () => {
    const errors = validateQuestionInput({
        ...NORMALIZED_INPUT,
        options: [
        { label: 'A', text: '' },
        { label: 'B', text: 'Answer' },
        ],
    })

    expect(errors.options).toBe(
        'Every option requires a label of 1–10 characters and answer text.',
    )
    })

    it('rejects duplicate option labels case-insensitively', () => {
    const errors = validateQuestionInput({
        ...NORMALIZED_INPUT,
        options: [
        { label: 'A', text: 'First' },
        { label: ' a ', text: 'Second' },
        ],
    })

    expect(errors.options).toBe(
        'Answer option labels must be unique.',
    )
    })

    it('requires the correct label to match an option', () => {
    const errors = validateQuestionInput({
        ...NORMALIZED_INPUT,
        correctOptionLabel: 'C',
    })

    expect(errors.correctOptionLabel).toBe(
        'The correct answer must match one of the option labels.',
    )
    })

    it('validates binary labels and short-answer reference variants', () => {
      expect(validateQuestionInput({
        ...NORMALIZED_INPUT,
        questionType: 'binary',
        binaryLabelMode: 'yes-no',
        binaryAnswer: false,
      })).toEqual({})

      expect(validateQuestionInput({
        ...NORMALIZED_INPUT,
        questionType: 'short-answer',
        canonicalAnswer: 'Baghdad',
        approvedVariants: ['baghdad'],
      })).toMatchObject({
        approvedVariants: 'List each other accepted answer once, without repeating the correct answer.',
      })
    })

    it('persists typed binary and short-answer payloads without legacy MCQ columns', () => {
      expect(questionInputPayload({
        ...NORMALIZED_INPUT,
        questionType: 'binary',
        binaryLabelMode: 'yes-no',
        binaryAnswer: false,
      })).toMatchObject({
        options: null,
        correct_option_label: null,
        content: { type: 'binary', labelMode: 'yes-no' },
        answer: { type: 'binary', isTrue: false },
      })

      expect(questionInputPayload({
        ...NORMALIZED_INPUT,
        questionType: 'short-answer',
        canonicalAnswer: 'Baghdad',
        approvedVariants: ['Baghdad city'],
        answerLines: 3,
      })).toMatchObject({
        options: null,
        correct_option_label: null,
        content: { type: 'short-answer', answerLines: 3 },
        answer: { type: 'short-answer', canonicalAnswer: 'Baghdad', approvedVariants: ['Baghdad city'] },
      })
    })
})

describe('database question conversion', () => {
  const question: Question = {
    id: '223e4567-e89b-42d3-a456-426614174000',
    owner_id: '323e4567-e89b-42d3-a456-426614174000',
    bank_id: '123e4567-e89b-42d3-a456-426614174000',
    external_id: 'U1-Q001',
    unit: 1,
    lesson: '1',
    question_type: 'multiple-choice',
    difficulty: 'medium',
    prompt: 'Choose the correct answer.',
    options: [
      { label: 'A', text: 'First answer' },
      { label: 'B', text: 'Second answer' },
    ],
    correct_option_label: 'B',
    schema_version: 1,
    marks: 1,
    content: {
      type: 'multiple-choice',
      schemaVersion: 1,
      options: [
        { label: 'A', text: 'First answer' },
        { label: 'B', text: 'Second answer' },
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

  it('maps a validated database row into an exam question', () => {
    expect(questionToExamQuestion(question)).toEqual({
      id: question.id,
      unit: 1,
      lesson: '1',
      type: 'multiple-choice',
      difficulty: 'medium',
      prompt: 'Choose the correct answer.',
      marks: 1,
      options: [
        { label: 'A', text: 'First answer' },
        { label: 'B', text: 'Second answer' },
      ],
      correctAnswer: { label: 'B', text: 'Second answer' },
    })
  })

  it('rejects invalid database rows before generation', () => {
    expect(() =>
      questionToExamQuestion({
        ...question,
        correct_option_label: 'C',
        answer: {
          type: 'multiple-choice',
          schemaVersion: 1,
          correctOptionLabel: 'C',
        },
      }),
    ).toThrow(
      'This question contains invalid saved data and cannot be used safely.',
    )
  })

  it('maps binary and short-answer rows without legacy MCQ fields', () => {
    expect(questionToExamQuestion({
      ...question,
      id: '423e4567-e89b-42d3-a456-426614174000',
      question_type: 'binary',
      options: null,
      correct_option_label: null,
      marks: 2,
      content: { type: 'binary', schemaVersion: 1, labelMode: 'yes-no' },
      answer: { type: 'binary', schemaVersion: 1, isTrue: false },
    })).toMatchObject({ type: 'binary', labelMode: 'yes-no', isTrue: false, marks: 2 })

    expect(questionToExamQuestion({
      ...question,
      id: '523e4567-e89b-42d3-a456-426614174000',
      question_type: 'short-answer',
      options: null,
      correct_option_label: null,
      marks: 3,
      content: { type: 'short-answer', schemaVersion: 1, answerLines: 3 },
      answer: { type: 'short-answer', schemaVersion: 1, canonicalAnswer: 'Baghdad', approvedVariants: ['Baghdad city'], caseSensitive: false },
    })).toMatchObject({ type: 'short-answer', canonicalAnswer: 'Baghdad', approvedVariants: ['Baghdad city'], answerLines: 3, marks: 3 })
  })
})
