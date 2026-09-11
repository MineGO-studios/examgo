import { supabase } from './supabase'
import type { Tables, TablesInsert } from '../types/database'

export type QuestionBank = Tables<'question_banks'>

export type QuestionBankDataErrorCode =
  | 'validation'
  | 'duplicate'
  | 'access-denied'
  | 'create-failed'
  | 'read-failed'

export class QuestionBankDataError extends Error {
  readonly code: QuestionBankDataErrorCode

  constructor(
    code: QuestionBankDataErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'QuestionBankDataError'
    this.code = code
  }
}

function normalizeBankName(name: string): string {
  return name.trim()
}

function validateBankName(name: string): string {
  const normalized = normalizeBankName(name)

  if (normalized.length < 1 || normalized.length > 100) {
    throw new QuestionBankDataError(
      'validation',
      'Question bank name must contain between 1 and 100 characters.',
    )
  }

  return normalized
}

export async function getQuestionBanks(): Promise<
  QuestionBank[]
> {
  const { data, error } = await supabase
    .from('question_banks')
    .select('*')
    .eq('is_archived', false)
    .order('name', { ascending: true })

  if (error) {
    console.error('[ExamGO question banks] read failed', {
      code: error.code,
    })

    if (error.code === '42501') {
      throw new QuestionBankDataError(
        'access-denied',
        'You do not have access to these question banks.',
      )
    }

    throw new QuestionBankDataError(
      'read-failed',
      'Unable to load question banks. Please try again.',
    )
  }

  return data ?? []
}

export async function createQuestionBank(
  name: string,
): Promise<QuestionBank> {
  const row: TablesInsert<'question_banks'> = {
    name: validateBankName(name),
    grade: 6,
    subject: 'English',
    curriculum: 'Iraqi mainstream',
  }

  const { data, error } = await supabase
    .from('question_banks')
    .insert(row)
    .select('*')
    .single()

  if (error) {
    console.error('[ExamGO question banks] create failed', {
      code: error.code,
    })

    if (error.code === '23505') {
      throw new QuestionBankDataError(
        'duplicate',
        'An active question bank with this name already exists.',
      )
    }

    if (error.code === '42501') {
      throw new QuestionBankDataError(
        'access-denied',
        'You do not have permission to create this question bank.',
      )
    }

    throw new QuestionBankDataError(
      'create-failed',
      'Unable to create the question bank. Please try again.',
    )
  }

  if (!data) {
    throw new QuestionBankDataError(
      'create-failed',
      'The question bank was created but could not be returned.',
    )
  }

  return data
}
