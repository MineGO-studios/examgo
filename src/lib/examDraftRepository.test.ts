import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_EXAM_SETTINGS,
} from '../types/exam'
import type { ExamQuestion } from '../types/question'
import { createQuestionReview } from './reviewQuestions'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  draftInsert: vi.fn(),
  questionInsert: vi.fn(),
  select: vi.fn(),
  single: vi.fn(),
  delete: vi.fn(),
  eq: vi.fn(),
}))

vi.mock('./supabase', () => ({
  supabase: { from: mocks.from },
}))

import { saveExamDraft } from './examDraftRepository'

const QUESTION: ExamQuestion = {
  id: '223e4567-e89b-42d3-a456-426614174000',
  unit: 1,
  lesson: '1',
  type: 'multiple-choice',
  difficulty: 'medium',
  prompt: 'Choose the correct answer.',
  options: [
    { label: 'A', text: 'One' },
    { label: 'B', text: 'Two' },
  ],
  correctAnswer: { label: 'A', text: 'One' },
}

const DRAFT_SETTINGS = {
  ...DEFAULT_EXAM_SETTINGS,
  questionCount: 1,
}

const DRAFT = {
  id: '323e4567-e89b-42d3-a456-426614174000',
  owner_id: '423e4567-e89b-42d3-a456-426614174000',
  bank_id: '123e4567-e89b-42d3-a456-426614174000',
  exam_title: DRAFT_SETTINGS.examTitle,
  school_name: DRAFT_SETTINGS.schoolName,
  grade: 6,
  unit: 1,
  marks_per_question: 1,
  question_count: 1,
  selection_seed: 1,
  status: 'draft',
  created_at: '2026-09-11T08:00:00.000Z',
  updated_at: '2026-09-11T08:00:00.000Z',
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.select.mockReturnValue({ single: mocks.single })
  mocks.delete.mockReturnValue({ eq: mocks.eq })
  mocks.eq.mockResolvedValue({ error: null })
  mocks.from.mockImplementation((table: string) =>
    table === 'exam_drafts'
      ? { insert: mocks.draftInsert, delete: mocks.delete }
      : { insert: mocks.questionInsert },
  )
  mocks.draftInsert.mockReturnValue({ select: mocks.select })
})

describe('saveExamDraft', () => {
  it('saves settings and the ordered reviewed questions', async () => {
    mocks.single.mockResolvedValue({ data: DRAFT, error: null })
    mocks.questionInsert.mockResolvedValue({ error: null })
    const review = createQuestionReview([QUESTION])

    await expect(
      saveExamDraft(DRAFT.bank_id, DRAFT_SETTINGS, review),
    ).resolves.toEqual(DRAFT)

    expect(mocks.draftInsert).toHaveBeenCalledWith({
      bank_id: DRAFT.bank_id,
      exam_title: 'First Monthly Test',
      school_name: 'MineGO Test School',
      grade: 6,
      unit: 1,
      marks_per_question: 1,
      question_count: 1,
      selection_seed: 1,
      status: 'draft',
    })
    expect(mocks.questionInsert).toHaveBeenCalledWith([
      {
        exam_draft_id: DRAFT.id,
        question_id: QUESTION.id,
        position: 1,
        is_locked: false,
      },
    ])
  })

  it('reports a rejected draft insert', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.single.mockResolvedValue({
      data: null,
      error: { code: '42501' },
    })

    await expect(
      saveExamDraft(
        DRAFT.bank_id,
        DRAFT_SETTINGS,
        createQuestionReview([QUESTION]),
      ),
    ).rejects.toThrow('You do not have permission to save this draft.')
  })

  it('revalidates settings before saving the draft', async () => {
    await expect(
      saveExamDraft(
        DRAFT.bank_id,
        { ...DRAFT_SETTINGS, examTitle: ' ' },
        createQuestionReview([QUESTION]),
      ),
    ).rejects.toThrow('Test title is required.')

    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('cleans up the parent draft when question saving fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.single.mockResolvedValue({ data: DRAFT, error: null })
    mocks.questionInsert.mockResolvedValue({
      error: { code: '23503' },
    })

    await expect(
      saveExamDraft(
        DRAFT.bank_id,
        DRAFT_SETTINGS,
        createQuestionReview([QUESTION]),
      ),
    ).rejects.toThrow('Unable to save the selected draft questions')

    expect(mocks.delete).toHaveBeenCalledOnce()
    expect(mocks.eq).toHaveBeenCalledWith('id', DRAFT.id)
  })
})
