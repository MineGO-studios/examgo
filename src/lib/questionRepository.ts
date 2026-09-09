import { supabase } from './supabase'
import {
  getFirstQuestionValidationError,
  normalizeQuestionInput,
  validateQuestionInput,
  type Question,
  type QuestionInput,
  isValidUuid,
} from './questions'
import type {
  TablesInsert,
  TablesUpdate,
} from '../types/database'

export type QuestionDataErrorCode =
  | 'validation'
  | 'duplicate'
  | 'access-denied'
  | 'create-failed'
  | 'read-failed'
  | 'not-found'
  | 'update-failed'

export class QuestionDataError extends Error {
  readonly code: QuestionDataErrorCode

  constructor(code: QuestionDataErrorCode, message: string) {
    super(message)
    this.name = 'QuestionDataError'
    this.code = code
  }
}

function validateAndNormalizeQuestionInput(
  input: QuestionInput,
): QuestionInput {
  const validationErrors = validateQuestionInput(input)
  const firstValidationError =
    getFirstQuestionValidationError(validationErrors)

  if (firstValidationError) {
    throw new QuestionDataError(
      'validation',
      firstValidationError,
    )
  }

  return normalizeQuestionInput(input)
}

export async function createQuestion(
  input: QuestionInput,
): Promise<Question> {
  const normalized = validateAndNormalizeQuestionInput(input)


  const row: TablesInsert<'questions'> = {
    bank_id: normalized.bankId,
    external_id: normalized.externalId,
    unit: normalized.unit,
    lesson: normalized.lesson,
    question_type: normalized.questionType,
    difficulty: normalized.difficulty,
    prompt: normalized.prompt,
    options: normalized.options,
    correct_option_label: normalized.correctOptionLabel,
    is_active: normalized.isActive,
  }

  const { data, error } = await supabase
    .from('questions')
    .insert(row)
    .select()
    .single()

  if (error) {
    console.error('[ExamGO questions] create failed', {
      code: error.code,
    })

    if (error.code === '23505') {
      throw new QuestionDataError(
        'duplicate',
        'A question with this ID already exists in this bank.',
      )
    }

    if (error.code === '42501') {
      throw new QuestionDataError(
        'access-denied',
        'You do not have access to this question bank.',
      )
    }

    throw new QuestionDataError(
      'create-failed',
      'Unable to save the question. Please try again.',
    )
  }

  if (!data) {
    throw new QuestionDataError(
      'create-failed',
      'The question was saved but could not be returned.',
    )
  }

  return data
}

export async function getQuestions(
  bankId: string,
): Promise<Question[]> {
  const normalizedBankId = bankId.trim().toLowerCase()

  if (!isValidUuid(normalizedBankId)) {
    throw new QuestionDataError(
      'validation',
      'A valid question bank is required.',
    )
  }

  const { data, error } = await supabase
    .from('questions')
    .select('*')
    .eq('bank_id', normalizedBankId)
    .order('unit', { ascending: true })
    .order('lesson', { ascending: true })
    .order('external_id', { ascending: true })

  if (error) {
    console.error('[ExamGO questions] read failed', {
      code: error.code,
    })

    if (error.code === '42501') {
      throw new QuestionDataError(
        'access-denied',
        'You do not have access to this question bank.',
      )
    }

    throw new QuestionDataError(
      'read-failed',
      'Unable to load questions. Please try again.',
    )
  }

  return data ?? []
}

export async function updateQuestion(
  questionId: string,
  input: QuestionInput,
): Promise<Question> {
  const normalizedQuestionId =
    questionId.trim().toLowerCase()

  if (!isValidUuid(normalizedQuestionId)) {
    throw new QuestionDataError(
      'validation',
      'A valid question is required.',
    )
  }

  const normalized = validateAndNormalizeQuestionInput(input)

  const changes: TablesUpdate<'questions'> = {
    external_id: normalized.externalId,
    unit: normalized.unit,
    lesson: normalized.lesson,
    question_type: normalized.questionType,
    difficulty: normalized.difficulty,
    prompt: normalized.prompt,
    options: normalized.options,
    correct_option_label: normalized.correctOptionLabel,
    is_active: normalized.isActive,
  }

  const { data, error } = await supabase
    .from('questions')
    .update(changes)
    .eq('id', normalizedQuestionId)
    .eq('bank_id', normalized.bankId)
    .select('*')
    .maybeSingle()

  if (error) {
    console.error('[ExamGO questions] update failed', {
      code: error.code,
    })

    if (error.code === '23505') {
      throw new QuestionDataError(
        'duplicate',
        'A question with this ID already exists in this bank.',
      )
    }

    if (error.code === '42501') {
      throw new QuestionDataError(
        'access-denied',
        'You do not have access to update this question.',
      )
    }

    throw new QuestionDataError(
      'update-failed',
      'Unable to update the question. Please try again.',
    )
  }

  if (!data) {
    throw new QuestionDataError(
      'not-found',
      'The question was not found or is not accessible.',
    )
  }

  return data
}