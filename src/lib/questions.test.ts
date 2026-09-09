import { describe, expect, it } from 'vitest'
import {
  normalizeQuestionInput,
  validateQuestionInput,
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
  options: [
    { label: ' a ', text: ' First answer ' },
    { label: ' b ', text: ' Second answer ' },
  ],
  correctOptionLabel: ' b ',
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
        unit: 'Unit must be a whole number between 1 and 20.',
        lesson:
        'Lesson must contain between 1 and 40 characters.',
        questionType:
        'Only multiple-choice questions are currently supported.',
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
})