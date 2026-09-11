import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import type { QuestionBank } from './questionBankRepository'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  insert: vi.fn(),
  single: vi.fn(),
}))

vi.mock('./supabase', () => ({
  supabase: {
    from: mocks.from,
  },
}))

import {
  createQuestionBank,
  getQuestionBanks,
} from './questionBankRepository'

const BANK: QuestionBank = {
  id: '123e4567-e89b-42d3-a456-426614174000',
  owner_id: '223e4567-e89b-42d3-a456-426614174000',
  name: 'Unit 1 approved questions',
  grade: 6,
  subject: 'English',
  curriculum: 'Iraqi mainstream',
  is_archived: false,
  created_at: '2026-09-10T12:00:00.000Z',
  updated_at: '2026-09-10T12:00:00.000Z',
}

beforeEach(() => {
  vi.resetAllMocks()

  mocks.from.mockReturnValue({
    select: mocks.select,
    insert: mocks.insert,
  })
  mocks.select.mockReturnValue({
    eq: mocks.eq,
    single: mocks.single,
  })
  mocks.eq.mockReturnValue({ order: mocks.order })
  mocks.insert.mockReturnValue({ select: mocks.select })
})

describe('getQuestionBanks', () => {
  it('loads active banks in name order', async () => {
    mocks.order.mockResolvedValue({
      data: [BANK],
      error: null,
    })

    await expect(getQuestionBanks()).resolves.toEqual([BANK])

    expect(mocks.from).toHaveBeenCalledWith('question_banks')
    expect(mocks.select).toHaveBeenCalledWith('*')
    expect(mocks.eq).toHaveBeenCalledWith('is_archived', false)
    expect(mocks.order).toHaveBeenCalledWith('name', {
      ascending: true,
    })
  })

  it('returns a safe error when loading fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.order.mockResolvedValue({
      data: null,
      error: {
        code: 'PGRST000',
        message: 'Sensitive database detail',
      },
    })

    await expect(getQuestionBanks()).rejects.toMatchObject({
      code: 'read-failed',
      message: 'Unable to load question banks. Please try again.',
    })
  })
})

describe('createQuestionBank', () => {
  it('creates a normalized V1 question bank', async () => {
    mocks.single.mockResolvedValue({ data: BANK, error: null })

    await expect(
      createQuestionBank('  Unit 1 approved questions  '),
    ).resolves.toEqual(BANK)

    expect(mocks.insert).toHaveBeenCalledWith({
      name: 'Unit 1 approved questions',
      grade: 6,
      subject: 'English',
      curriculum: 'Iraqi mainstream',
    })
  })

  it('rejects invalid names before contacting Supabase', async () => {
    await expect(createQuestionBank(' ')).rejects.toMatchObject({
      code: 'validation',
      message:
        'Question bank name must contain between 1 and 100 characters.',
    })

    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('maps duplicate names to a clear error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.single.mockResolvedValue({
      data: null,
      error: { code: '23505' },
    })

    await expect(
      createQuestionBank('Unit 1 approved questions'),
    ).rejects.toMatchObject({
      code: 'duplicate',
      message:
        'An active question bank with this name already exists.',
    })
  })
})
