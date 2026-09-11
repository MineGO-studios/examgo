import type {
  Tables,
  TablesInsert,
} from '../types/database'
import type { ExamSettings } from '../types/exam'
import type { ReviewedQuestion } from './reviewQuestions'
import { supabase } from './supabase'
import {
  getFirstValidationError,
  validateExamSettings,
} from './validateExamSettings'

export type ExamDraft = Tables<'exam_drafts'>

export class ExamDraftDataError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ExamDraftDataError'
  }
}

export async function saveExamDraft(
  bankId: string,
  settings: ExamSettings,
  review: readonly ReviewedQuestion[],
): Promise<ExamDraft> {
  if (!bankId || review.length < 1) {
    throw new ExamDraftDataError(
      'Preview at least one question before saving a draft.',
    )
  }

  const validationMessage = getFirstValidationError(
    validateExamSettings(settings, review.length),
  )

  if (validationMessage) {
    throw new ExamDraftDataError(validationMessage)
  }

  const questionIds = review.map((item) => item.question.id)

  if (new Set(questionIds).size !== questionIds.length) {
    throw new ExamDraftDataError(
      'The draft cannot contain duplicate question IDs.',
    )
  }

  const draftRow: TablesInsert<'exam_drafts'> = {
    bank_id: bankId,
    exam_title: settings.examTitle.trim(),
    school_name: settings.schoolName.trim(),
    grade: settings.grade,
    unit: settings.unit,
    marks_per_question: settings.marksPerQuestion,
    question_count: review.length,
    selection_seed: settings.selectionSeed,
    status: 'draft',
  }
  const { data: draft, error: draftError } = await supabase
    .from('exam_drafts')
    .insert(draftRow)
    .select('*')
    .single()

  if (draftError || !draft) {
    console.error('[ExamGO drafts] draft save failed', {
      code: draftError?.code,
    })
    throw new ExamDraftDataError(
      draftError?.code === '42501'
        ? 'You do not have permission to save this draft.'
        : 'Unable to save the exam draft. Please try again.',
    )
  }

  const questionRows: TablesInsert<'exam_draft_questions'>[] =
    review.map((item, index) => ({
      exam_draft_id: draft.id,
      question_id: item.question.id,
      position: index + 1,
      is_locked: item.locked,
    }))
  const { error: questionError } = await supabase
    .from('exam_draft_questions')
    .insert(questionRows)

  if (questionError) {
    console.error('[ExamGO drafts] question save failed', {
      code: questionError.code,
    })

    const { error: cleanupError } = await supabase
      .from('exam_drafts')
      .delete()
      .eq('id', draft.id)

    if (cleanupError) {
      console.error('[ExamGO drafts] cleanup failed', {
        code: cleanupError.code,
      })
    }

    throw new ExamDraftDataError(
      'Unable to save the selected draft questions. Please try again.',
    )
  }

  return draft
}
