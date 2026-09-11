import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import type { Question, QuestionInput } from './questions'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  select: vi.fn(),
  single: vi.fn(),
  eq: vi.fn(),
  updateEq: vi.fn(),
  order: vi.fn(),
  maybeSingle: vi.fn(),
}))

vi.mock('./supabase', () => ({
  supabase: {
    from: mocks.from,
  },
}))

import {
  createQuestion,
  getActiveQuestions,
  getQuestions,
  updateQuestion,
} from './questionRepository'

const INPUT: QuestionInput = {
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

const QUESTION_ROW: Question = {
  id: '223e4567-e89b-42d3-a456-426614174000',
  bank_id: '123e4567-e89b-42d3-a456-426614174000',
  external_id: 'U1-Q001',
  unit: 1,
  lesson: 'Lesson 1',
  question_type: 'multiple-choice',
  difficulty: 'medium',
  prompt: 'Choose the correct answer.',
  options: [
    { label: 'A', text: 'First answer' },
    { label: 'B', text: 'Second answer' },
  ],
  correct_option_label: 'B',
  is_active: true,
  created_at: '2026-09-09T12:00:00.000Z',
  updated_at: '2026-09-09T12:00:00.000Z',
}

beforeEach(() => {
  vi.resetAllMocks()

  mocks.from.mockReturnValue({
    insert: mocks.insert,
    select: mocks.select,
    update: mocks.update,
  })

  mocks.insert.mockReturnValue({
    select: mocks.select,
  })

  mocks.update.mockReturnValue({
    eq: mocks.updateEq,
  })

  mocks.select.mockReturnValue({
    single: mocks.single,
    eq: mocks.eq,
    maybeSingle: mocks.maybeSingle,
  })

  mocks.eq.mockReturnValue({
    order: mocks.order,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('createQuestion', () => {

  it('creates and returns a normalized question row', async () => {
    mocks.single.mockResolvedValue({
      data: QUESTION_ROW,
      error: null,
    })

    await expect(createQuestion(INPUT)).resolves.toEqual(
      QUESTION_ROW,
    )

    expect(mocks.from).toHaveBeenCalledWith('questions')
    expect(mocks.insert).toHaveBeenCalledWith({
      bank_id: '123e4567-e89b-42d3-a456-426614174000',
      external_id: 'U1-Q001',
      unit: 1,
      lesson: 'Lesson 1',
      question_type: 'multiple-choice',
      difficulty: 'medium',
      prompt: 'Choose the correct answer.',
      options: [
        { label: 'A', text: 'First answer' },
        { label: 'B', text: 'Second answer' },
      ],
      correct_option_label: 'B',
      is_active: true,
    })

    const insertedRow = mocks.insert.mock.calls[0]?.[0]

    expect(insertedRow).not.toHaveProperty('owner_id')
  })

  it('rejects invalid input before contacting Supabase', async () => {
    await expect(
      createQuestion({
        ...INPUT,
        prompt: ' ',
      }),
    ).rejects.toMatchObject({
      name: 'QuestionDataError',
      code: 'validation',
      message:
        'Question text must contain between 1 and 2000 characters.',
    })

    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('rejects malformed runtime options safely', async () => {
    const malformedInput = {
      ...INPUT,
      options: null,
    } as unknown as QuestionInput

    await expect(
      createQuestion(malformedInput),
    ).rejects.toMatchObject({
      code: 'validation',
      message: 'Provide between 2 and 6 answer options.',
    })

    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('converts duplicate IDs into a clear error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.single.mockResolvedValue({
      data: null,
      error: { code: '23505' },
    })

    await expect(createQuestion(INPUT)).rejects.toMatchObject({
      code: 'duplicate',
      message:
        'A question with this ID already exists in this bank.',
    })
  })

  it('converts RLS failures into an access error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.single.mockResolvedValue({
      data: null,
      error: { code: '42501' },
    })

    await expect(createQuestion(INPUT)).rejects.toMatchObject({
      code: 'access-denied',
      message:
        'You do not have access to this question bank.',
    })
  })

  it('hides unexpected Supabase error details', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.single.mockResolvedValue({
      data: null,
      error: {
        code: 'PGRST000',
        message: 'Sensitive database detail',
      },
    })

    await expect(createQuestion(INPUT)).rejects.toMatchObject({
      code: 'create-failed',
      message: 'Unable to save the question. Please try again.',
    })
  })
})

describe('getQuestions', () => {
  it('returns ordered questions from the requested bank', async () => {
    mocks.order
      .mockReturnValueOnce({ order: mocks.order })
      .mockReturnValueOnce({ order: mocks.order })
      .mockResolvedValueOnce({
        data: [QUESTION_ROW],
        error: null,
      })

    await expect(
      getQuestions(
        ' 123e4567-e89b-42d3-a456-426614174000 ',
      ),
    ).resolves.toEqual([QUESTION_ROW])

    expect(mocks.from).toHaveBeenCalledWith('questions')
    expect(mocks.select).toHaveBeenCalledWith('*')
    expect(mocks.eq).toHaveBeenCalledWith(
      'bank_id',
      '123e4567-e89b-42d3-a456-426614174000',
    )
    expect(mocks.order).toHaveBeenNthCalledWith(
      1,
      'unit',
      { ascending: true },
    )
    expect(mocks.order).toHaveBeenNthCalledWith(
      2,
      'lesson',
      { ascending: true },
    )
    expect(mocks.order).toHaveBeenNthCalledWith(
      3,
      'external_id',
      { ascending: true },
    )
  })

  it('rejects an invalid bank ID before querying Supabase', async () => {
    await expect(
      getQuestions('invalid-bank-id'),
    ).rejects.toMatchObject({
      code: 'validation',
      message: 'A valid question bank is required.',
    })

    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('hides unexpected Supabase read errors', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    mocks.order
      .mockReturnValueOnce({ order: mocks.order })
      .mockReturnValueOnce({ order: mocks.order })
      .mockResolvedValueOnce({
        data: null,
        error: {
          code: 'PGRST000',
          message: 'Sensitive database detail',
        },
      })

    await expect(
      getQuestions(
        '123e4567-e89b-42d3-a456-426614174000',
      ),
    ).rejects.toMatchObject({
      code: 'read-failed',
      message: 'Unable to load questions. Please try again.',
    })
  })
})

describe('getActiveQuestions', () => {
  it('returns only active questions from the owned bank', async () => {
    mocks.order
      .mockReturnValueOnce({ order: mocks.order })
      .mockReturnValueOnce({ order: mocks.order })
      .mockResolvedValueOnce({
        data: [QUESTION_ROW, { ...QUESTION_ROW, id: 'inactive', is_active: false }],
        error: null,
      })

    await expect(
      getActiveQuestions(QUESTION_ROW.bank_id),
    ).resolves.toEqual([QUESTION_ROW])
  })
})

describe('updateQuestion', () => {
  it('updates and returns a normalized question row', async () => {
    mocks.updateEq
      .mockReturnValueOnce({ eq: mocks.updateEq })
      .mockReturnValueOnce({ select: mocks.select })

    mocks.maybeSingle.mockResolvedValue({
      data: QUESTION_ROW,
      error: null,
    })

    await expect(
      updateQuestion(
        ' 223E4567-E89B-42D3-A456-426614174000 ',
        INPUT,
      ),
    ).resolves.toEqual(QUESTION_ROW)

    expect(mocks.update).toHaveBeenCalledWith({
      external_id: 'U1-Q001',
      unit: 1,
      lesson: 'Lesson 1',
      question_type: 'multiple-choice',
      difficulty: 'medium',
      prompt: 'Choose the correct answer.',
      options: [
        { label: 'A', text: 'First answer' },
        { label: 'B', text: 'Second answer' },
      ],
      correct_option_label: 'B',
      is_active: true,
    })

    expect(mocks.updateEq).toHaveBeenNthCalledWith(
      1,
      'id',
      '223e4567-e89b-42d3-a456-426614174000',
    )
    expect(mocks.updateEq).toHaveBeenNthCalledWith(
      2,
      'bank_id',
      '123e4567-e89b-42d3-a456-426614174000',
    )

    const updatePayload = mocks.update.mock.calls[0]?.[0]

    expect(updatePayload).not.toHaveProperty('owner_id')
    expect(updatePayload).not.toHaveProperty('bank_id')
    expect(updatePayload).not.toHaveProperty('id')
  })

  it('rejects an invalid question ID before querying', async () => {
    await expect(
      updateQuestion('invalid-question-id', INPUT),
    ).rejects.toMatchObject({
      code: 'validation',
      message: 'A valid question is required.',
    })

    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('reports inaccessible or missing questions safely', async () => {
    mocks.updateEq
      .mockReturnValueOnce({ eq: mocks.updateEq })
      .mockReturnValueOnce({ select: mocks.select })

    mocks.maybeSingle.mockResolvedValue({
      data: null,
      error: null,
    })

    await expect(
      updateQuestion(QUESTION_ROW.id, INPUT),
    ).rejects.toMatchObject({
      code: 'not-found',
      message:
        'The question was not found or is not accessible.',
    })
  })

  it('converts duplicate IDs into a clear update error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    mocks.updateEq
      .mockReturnValueOnce({ eq: mocks.updateEq })
      .mockReturnValueOnce({ select: mocks.select })

    mocks.maybeSingle.mockResolvedValue({
      data: null,
      error: { code: '23505' },
    })

    await expect(
      updateQuestion(QUESTION_ROW.id, INPUT),
    ).rejects.toMatchObject({
      code: 'duplicate',
      message:
        'A question with this ID already exists in this bank.',
    })
  })

  it('hides unexpected Supabase update errors', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    mocks.updateEq
      .mockReturnValueOnce({ eq: mocks.updateEq })
      .mockReturnValueOnce({ select: mocks.select })

    mocks.maybeSingle.mockResolvedValue({
      data: null,
      error: {
        code: 'PGRST000',
        message: 'Sensitive database detail',
      },
    })

    await expect(
      updateQuestion(QUESTION_ROW.id, INPUT),
    ).rejects.toMatchObject({
      code: 'update-failed',
      message:
        'Unable to update the question. Please try again.',
    })
  })
})
