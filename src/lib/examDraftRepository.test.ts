import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_EXAM_SETTINGS,
} from '../types/exam'
import type { ExamQuestion } from '../types/question'
import type { Tables } from '../types/database'
import type { Question } from './questions'
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

import {
  resolveExamDraft,
  saveExamDraft,
} from './examDraftRepository'

const QUESTION: ExamQuestion = {
  id: '223e4567-e89b-42d3-a456-426614174000',
  unit: 1,
  lesson: '1',
  type: 'multiple-choice',
  difficulty: 'medium',
  prompt: 'Choose the correct answer.',
  marks: 1,
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
  bank_ids: ['123e4567-e89b-42d3-a456-426614174000'],
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

const SAVED_QUESTION: Question = {
  id: QUESTION.id,
  owner_id: DRAFT.owner_id,
  bank_id: DRAFT.bank_id,
  external_id: 'Q-223e4567-e89b-42d3-a456-426614174000',
  unit: 1,
  lesson: '1',
  question_type: 'multiple-choice',
  difficulty: 'medium',
  prompt: QUESTION.prompt,
  options: QUESTION.options,
  correct_option_label: 'A',
  schema_version: 1,
  marks: 1,
  content: {
    type: 'multiple-choice',
    schemaVersion: 1,
    options: QUESTION.options,
  },
  answer: {
    type: 'multiple-choice',
    schemaVersion: 1,
    correctOptionLabel: 'A',
  },
  current_revision: 1,
  is_active: true,
  created_at: '2026-09-11T07:00:00.000Z',
  updated_at: '2026-09-11T07:00:00.000Z',
}

const MEMBERSHIP: Tables<'exam_draft_questions'> = {
  assigned_marks: null,
  mark_attempt_count: null,
  point_marks: null,
  exam_draft_id: DRAFT.id,
  question_id: SAVED_QUESTION.id,
  position: 1,
  is_locked: true,
  created_at: '2026-09-11T08:00:00.000Z',
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
      bank_ids: DRAFT.bank_ids,
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
        assigned_marks: 1,
        point_marks: { [QUESTION.id]: 1 },
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

  it('rejects a fractional teacher mark before creating a draft', async () => {
    await expect(saveExamDraft(DRAFT.bank_id, DRAFT_SETTINGS,
      createQuestionReview([{ ...QUESTION, marks: 2.5 }]))).rejects.toThrow('whole number')
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

describe('resolveExamDraft', () => {
  it('restores saved settings, question order, and locks', () => {
    const result = resolveExamDraft(
      DRAFT,
      'Grade 6 English',
      [MEMBERSHIP],
      [SAVED_QUESTION],
    )

    expect(result.status).toBe('ready')

    if (result.status !== 'ready') {
      throw new Error('Expected the saved draft to reopen.')
    }

    expect(result.value.settings).toEqual(DRAFT_SETTINGS)
    expect(result.value.review).toEqual([
      { question: QUESTION, locked: true },
    ])
    expect(result.value.bankQuestions).toEqual([QUESTION])
  })

  it('restores an exam-assigned mark for a markless bank question', () => {
    const result = resolveExamDraft(DRAFT, 'Grade 6 English',
      [{ ...MEMBERSHIP, assigned_marks: 3, point_marks: { [QUESTION.id]: 3 } }],
      [{ ...SAVED_QUESTION, marks: null }])
    expect(result.status).toBe('ready')
    if (result.status === 'ready') expect(result.value.review[0].question.marks).toBe(3)
  })

  it('requires recovery when a saved question changed later', () => {
    const result = resolveExamDraft(
      DRAFT,
      'Grade 6 English',
      [MEMBERSHIP],
      [
        {
          ...SAVED_QUESTION,
          updated_at: '2026-09-11T09:00:00.000Z',
        },
      ],
    )

    expect(result).toMatchObject({
      status: 'recovery',
      issues: [
        {
          kind: 'changed-question',
          position: 1,
        },
      ],
    })
  })

  it('requires recovery instead of silently replacing missing questions', () => {
    const result = resolveExamDraft(
      DRAFT,
      'Grade 6 English',
      [],
      [],
    )

    expect(result).toMatchObject({
      status: 'recovery',
      issues: [
        {
          kind: 'missing-question',
          position: null,
        },
      ],
    })
  })
})
