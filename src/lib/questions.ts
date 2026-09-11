import type { Tables } from '../types/database'
import type { ExamQuestion } from '../types/question'

export type Question = Tables<'questions'>

export type QuestionOptionInput = {
  label: string
  text: string
}

export type QuestionInput = {
  bankId: string
  externalId: string
  unit: number
  lesson: string
  questionType: 'multiple-choice'
  difficulty: 'easy' | 'medium' | 'hard'
  prompt: string
  options: QuestionOptionInput[]
  correctOptionLabel: string
  isActive: boolean
}

export type QuestionValidationErrors = Partial<
  Record<keyof QuestionInput, string>
>

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isValidUuid(value: string): boolean {
  return UUID_PATTERN.test(value.trim())
}

export function normalizeQuestionInput(
  input: QuestionInput,
): QuestionInput {
  return {
    ...input,
    bankId: input.bankId.trim().toLowerCase(),
    externalId: input.externalId.trim(),
    lesson: input.lesson.trim(),
    prompt: input.prompt.trim(),
    options: input.options.map((option) => ({
      label: option.label.trim().toUpperCase(),
      text: option.text.trim(),
    })),
    correctOptionLabel: input.correctOptionLabel.trim().toUpperCase(),
  }
}

export function validateQuestionInput(
  input: QuestionInput,
): QuestionValidationErrors {
  const errors: QuestionValidationErrors = {}

  if (!isValidUuid(input.bankId)) {
    errors.bankId = 'A valid question bank is required.'
  }

  const externalId = input.externalId.trim()

  if (externalId.length < 1 || externalId.length > 80) {
    errors.externalId =
      'Question ID must contain between 1 and 80 characters.'
  }

  if (!Number.isSafeInteger(input.unit) || input.unit < 1 || input.unit > 20) {
    errors.unit = 'Unit must be a whole number between 1 and 20.'
  }

  const lesson = input.lesson.trim()

  if (lesson.length < 1 || lesson.length > 40) {
    errors.lesson =
      'Lesson must contain between 1 and 40 characters.'
  }

  if (input.questionType !== 'multiple-choice') {
    errors.questionType =
      'Only multiple-choice questions are currently supported.'
  }

  if (!['easy', 'medium', 'hard'].includes(input.difficulty)) {
    errors.difficulty = 'Select a valid difficulty.'
  }

  const prompt = input.prompt.trim()

  if (prompt.length < 1 || prompt.length > 2000) {
    errors.prompt =
      'Question text must contain between 1 and 2000 characters.'
  }

  if (
    !Array.isArray(input.options) ||
    input.options.length < 2 ||
    input.options.length > 6
  ) {
    errors.options = 'Provide between 2 and 6 answer options.'
  } else {
    const labels = input.options.map((option) =>
      option.label.trim().toUpperCase(),
    )

    const hasInvalidOption = input.options.some(
      (option) =>
        option.label.trim().length < 1 ||
        option.label.trim().length > 10 ||
        option.text.trim().length < 1,
    )

    if (hasInvalidOption) {
      errors.options =
        'Every option requires a label of 1–10 characters and answer text.'
    } else if (new Set(labels).size !== labels.length) {
      errors.options = 'Answer option labels must be unique.'
    }

    const correctLabel =
      input.correctOptionLabel.trim().toUpperCase()

    if (!labels.includes(correctLabel)) {
      errors.correctOptionLabel =
        'The correct answer must match one of the option labels.'
    }
  }

  if (typeof input.isActive !== 'boolean') {
    errors.isActive = 'Question status must be valid.'
  }

  return errors
}

export function getFirstQuestionValidationError(
  errors: QuestionValidationErrors,
): string | null {
  return Object.values(errors)[0] ?? null
}

function isQuestionOption(
  value: unknown,
): value is QuestionOptionInput {
  if (!value || typeof value !== 'object') {
    return false
  }

  const option = value as Record<string, unknown>

  return (
    typeof option.label === 'string' &&
    typeof option.text === 'string'
  )
}

export function questionToInput(
  question: Question,
): QuestionInput {
  const options = Array.isArray(question.options)
    ? question.options.filter(isQuestionOption)
    : []

  const input: QuestionInput = {
    bankId: question.bank_id,
    externalId: question.external_id,
    unit: question.unit,
    lesson: question.lesson,
    questionType: 'multiple-choice',
    difficulty: question.difficulty as QuestionInput['difficulty'],
    prompt: question.prompt,
    options,
    correctOptionLabel: question.correct_option_label,
    isActive: question.is_active,
  }

  if (Object.keys(validateQuestionInput(input)).length > 0) {
    throw new Error(
      'This question contains invalid saved data and cannot be used safely.',
    )
  }

  return normalizeQuestionInput(input)
}

export function questionToExamQuestion(
  question: Question,
): ExamQuestion {
  const input = questionToInput(question)
  const correctAnswer = input.options.find(
    (option) => option.label === input.correctOptionLabel,
  )

  if (!correctAnswer) {
    throw new Error(
      'This question does not have a valid correct answer.',
    )
  }

  return {
    id: question.id,
    unit: input.unit,
    lesson: input.lesson,
    type: input.questionType,
    difficulty: input.difficulty,
    prompt: input.prompt,
    options: input.options,
    correctAnswer,
  }
}
