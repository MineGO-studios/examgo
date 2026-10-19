import type {
  Tables,
  TablesInsert,
} from '../types/database'
import type { ExamSettings } from '../types/exam'
import type { ReviewedQuestion } from './reviewQuestions'
import {
  isValidUuid,
  questionToExamQuestion,
  type Question,
} from './questions'
import { supabase } from './supabase'
import { accountLimitError } from './accountLimits'
import { getStandaloneQuestionsForBanks } from './questionMembershipRepository'
import { assignMarks } from '../domain/markAllocation'
import {
  getFirstValidationError,
  validateExamSettings,
} from './validateExamSettings'

export type ExamDraft = Tables<'exam_drafts'>
export type ExamDraftQuestion = Tables<'exam_draft_questions'>

export interface ExamDraftSummary {
  draft: ExamDraft
  bankName: string
}

export interface DraftRecoveryIssue {
  kind: 'missing-question' | 'changed-question'
  position: number | null
  message: string
}

export interface ReopenedExamDraft {
  draft: ExamDraft
  bankName: string
  settings: ExamSettings
  review: ReviewedQuestion[]
  bankQuestions: ReturnType<typeof questionToExamQuestion>[]
}

export type OpenExamDraftResult =
  | { status: 'ready'; value: ReopenedExamDraft }
  | {
      status: 'recovery'
      draft: ExamDraft
      bankName: string
      issues: DraftRecoveryIssue[]
    }

export class ExamDraftDataError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ExamDraftDataError'
  }
}

function draftToSettings(draft: ExamDraft): ExamSettings {
  return {
    schoolName: draft.school_name,
    examTitle: draft.exam_title,
    teacherName: '',
    grade: draft.grade,
    unit: draft.unit,
    marksPerQuestion: draft.marks_per_question,
    questionCount: draft.question_count,
    selectionSeed: draft.selection_seed,
  }
}

export function resolveExamDraft(
  draft: ExamDraft,
  bankName: string,
  memberships: readonly ExamDraftQuestion[],
  questions: readonly Question[],
): OpenExamDraftResult {
  const issues: DraftRecoveryIssue[] = []
  const questionById = new Map(
    questions.map((question) => [question.id, question]),
  )
  const orderedMemberships = [...memberships].sort(
    (left, right) => left.position - right.position,
  )
  const positions = new Set<number>()
  const questionIds = new Set<string>()

  if (memberships.length !== draft.question_count) {
    issues.push({
      kind: 'missing-question',
      position: null,
      message:
        'One or more saved questions are missing or no longer accessible.',
    })
  }

  const review = orderedMemberships.flatMap((membership) => {
    if (
      positions.has(membership.position) ||
      questionIds.has(membership.question_id)
    ) {
      issues.push({
        kind: 'changed-question',
        position: membership.position,
        message:
          'The saved question order is inconsistent and must be reviewed.',
      })
      return []
    }

    positions.add(membership.position)
    questionIds.add(membership.question_id)

    const question = questionById.get(membership.question_id)

    if (!question || question.owner_id !== draft.owner_id) {
      issues.push({
        kind: 'missing-question',
        position: membership.position,
        message: `Question ${membership.position} is missing or no longer accessible.`,
      })
      return []
    }

    if (
      !question.is_active ||
      Date.parse(question.updated_at) > Date.parse(membership.created_at)
    ) {
      issues.push({
        kind: 'changed-question',
        position: membership.position,
        message: `Question ${membership.position} changed after this draft was saved.`,
      })
      return []
    }

    try {
      return [
        {
          question: questionToExamQuestion(question, membership.assigned_marks === null ? undefined : { marks: membership.assigned_marks }),
          locked: membership.is_locked,
        },
      ]
    } catch {
      issues.push({
        kind: 'changed-question',
        position: membership.position,
        message: `Question ${membership.position} contains unsupported saved data.`,
      })
      return []
    }
  })

  if (issues.length > 0 || review.length !== draft.question_count) {
    return {
      status: 'recovery',
      draft,
      bankName,
      issues,
    }
  }

  const bankQuestions = questions
    .filter((question) => question.is_active)
    .flatMap((question) => {
      try {
        return [questionToExamQuestion(question, { marks: draft.marks_per_question })]
      } catch {
        return []
      }
    })

  return {
    status: 'ready',
    value: {
      draft,
      bankName,
      settings: draftToSettings(draft),
      review,
      bankQuestions,
    },
  }
}

export async function getExamDrafts(): Promise<ExamDraftSummary[]> {
  const { data: drafts, error: draftError } = await supabase
    .from('exam_drafts')
    .select('*')
    .order('updated_at', { ascending: false })

  if (draftError) {
    console.error('[ExamGO drafts] draft list failed', {
      code: draftError.code,
    })
    throw new ExamDraftDataError(
      'Unable to load your drafts. Please try again.',
    )
  }

  if (!drafts || drafts.length === 0) {
    return []
  }

  // Structured drafts have a separate versioned reopen path. Older schemas have
  // no workflow property and continue through this legacy recovery adapter.
  const legacyDrafts = drafts.filter((draft) => !('workflow' in draft) || draft.workflow == null)
  if (legacyDrafts.length === 0) return []
  const bankIds = Array.from(
    new Set(legacyDrafts.map((draft) => draft.bank_id)),
  )
  const { data: banks, error: bankError } = await supabase
    .from('question_banks')
    .select('id, name')
    .in('id', bankIds)

  if (bankError) {
    console.error('[ExamGO drafts] bank names failed', {
      code: bankError.code,
    })
    throw new ExamDraftDataError(
      'Your drafts loaded, but their question banks could not be identified.',
    )
  }

  const bankNames = new Map(
    (banks ?? []).map((bank) => [bank.id, bank.name]),
  )

  return legacyDrafts.map((draft) => ({
    draft,
    bankName: bankNames.get(draft.bank_id) ?? 'Unavailable bank',
  }))
}

export async function openExamDraft(
  draftId: string,
): Promise<OpenExamDraftResult> {
  const normalizedDraftId = draftId.trim().toLowerCase()

  if (!isValidUuid(normalizedDraftId)) {
    throw new ExamDraftDataError('A valid draft is required.')
  }

  const { data: draft, error: draftError } = await supabase
    .from('exam_drafts')
    .select('*')
    .eq('id', normalizedDraftId)
    .maybeSingle()

  if (draftError) {
    console.error('[ExamGO drafts] draft open failed', {
      code: draftError.code,
    })
    throw new ExamDraftDataError(
      'Unable to open this draft. Please try again.',
    )
  }

  if (!draft) {
    throw new ExamDraftDataError(
      'This draft is missing or no longer accessible.',
    )
  }

  const bankIds = draft.bank_ids?.length ? draft.bank_ids : [draft.bank_id]
  const [membershipResult, bankResult] =
    await Promise.all([
      supabase
        .from('exam_draft_questions')
        .select('*')
        .eq('exam_draft_id', normalizedDraftId)
        .order('position', { ascending: true }),
      supabase
        .from('question_banks')
        .select('id, name')
        .eq('id', draft.bank_id)
        .maybeSingle(),
    ])

  if (
    membershipResult.error ||
    bankResult.error
  ) {
    console.error('[ExamGO drafts] draft contents failed', {
      membershipCode: membershipResult.error?.code,
      bankCode: bankResult.error?.code,
    })
    throw new ExamDraftDataError(
      'The draft loaded, but its saved questions could not be restored.',
    )
  }

  let questions: Question[]
  try {
    questions = await getStandaloneQuestionsForBanks(bankIds)
  } catch {
    throw new ExamDraftDataError('The draft loaded, but its selected banks or questions are unavailable.')
  }

  return resolveExamDraft(
    draft,
    bankResult.data?.name ?? 'Unavailable bank',
    membershipResult.data ?? [],
    questions,
  )
}

export async function saveExamDraft(
  bankId: string,
  settings: ExamSettings,
  review: readonly ReviewedQuestion[],
  bankIds: readonly string[] = [bankId],
): Promise<ExamDraft> {
  const selectedBankIds = [...new Set(bankIds)]
  if (!isValidUuid(bankId) || selectedBankIds[0] !== bankId ||
    selectedBankIds.length !== bankIds.length || selectedBankIds.length > 20 ||
    selectedBankIds.some((id) => !isValidUuid(id)) || review.length < 1) {
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
  review.forEach((item) => assignMarks([item.question.id], item.question.marks, { mode: 'equal' }))

  const draftRow: TablesInsert<'exam_drafts'> = {
    bank_id: bankId,
    bank_ids: selectedBankIds,
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
    const limit = accountLimitError(draftError)
    if (limit) throw limit
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
      assigned_marks: item.question.marks,
      point_marks: { [item.question.id]: item.question.marks },
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
