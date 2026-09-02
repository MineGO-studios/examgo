import { describe, expect, it } from 'vitest'
import {
  sampleQuestions,
  type ExamQuestion,
} from '../data/sampleQuestions'
import {
  selectQuestions,
  type QuestionSelectionRequest,
} from './selectQuestions'

const BASE_REQUEST: QuestionSelectionRequest = {
  unit: 1,
  type: 'multiple-choice',
  count: 3,
  seed: 1,
}

const TEST_SEEDS = Array.from(
  { length: 20 },
  (_, index) => index + 1,
)

function getIds(questions: readonly ExamQuestion[]): string[] {
  return questions.map((question) => question.id)
}

describe('selectQuestions', () => {
  it('returns the requested quantity', () => {
    const selected = selectQuestions(
      sampleQuestions,
      BASE_REQUEST,
    )

    expect(selected).toHaveLength(BASE_REQUEST.count)
  })

  it('returns identical IDs for the same seed', () => {
    const request = {
      ...BASE_REQUEST,
      seed: 12345,
    }

    const firstSelection = selectQuestions(
      sampleQuestions,
      request,
    )
    const secondSelection = selectQuestions(
      sampleQuestions,
      request,
    )

    expect(getIds(firstSelection)).toEqual(
      getIds(secondSelection),
    )
  })

  it('can produce different selections from different seeds', () => {
    const firstSelection = selectQuestions(
      sampleQuestions,
      {
        ...BASE_REQUEST,
        seed: 1,
      },
    )
    const secondSelection = selectQuestions(
      sampleQuestions,
      {
        ...BASE_REQUEST,
        seed: 2,
      },
    )

    expect(getIds(firstSelection)).not.toEqual(
      getIds(secondSelection),
    )
  })

  it('does not modify the original question bank', () => {
    const originalBank = JSON.stringify(sampleQuestions)

    selectQuestions(sampleQuestions, BASE_REQUEST)

    expect(JSON.stringify(sampleQuestions)).toBe(originalBank)
  })

  it.each(TEST_SEEDS)(
    'returns unique question IDs for seed %i',
    (seed) => {
      const selected = selectQuestions(sampleQuestions, {
        ...BASE_REQUEST,
        count: 4,
        seed,
      })

      const selectedIds = getIds(selected)

      expect(new Set(selectedIds).size).toBe(
        selectedIds.length,
      )
    },
  )

  it('filters questions by lesson', () => {
    const selected = selectQuestions(sampleQuestions, {
      ...BASE_REQUEST,
      lesson: '7',
      count: 1,
    })

    expect(getIds(selected)).toEqual(['U1-Q010'])
  })

  it('filters questions by difficulty', () => {
    const selected = selectQuestions(sampleQuestions, {
      ...BASE_REQUEST,
      difficulty: 'medium',
      count: 1,
    })

    expect(getIds(selected)).toEqual(['U1-Q009'])
  })

  it('reports an insufficient eligible pool', () => {
    expect(() =>
      selectQuestions(sampleQuestions, {
        ...BASE_REQUEST,
        difficulty: 'hard',
        count: 1,
      }),
    ).toThrow(
      'Only 0 eligible questions are available, but 1 were requested.',
    )
  })

  it('rejects duplicate question IDs in the bank', () => {
    const duplicateQuestion: ExamQuestion = {
      ...sampleQuestions[0],
    }

    expect(() =>
      selectQuestions(
        [...sampleQuestions, duplicateQuestion],
        BASE_REQUEST,
      ),
    ).toThrow(
      `Question bank contains duplicate ID: ${duplicateQuestion.id}.`,
    )
  })

  it('rejects a zero question quantity', () => {
    expect(() =>
      selectQuestions(sampleQuestions, {
        ...BASE_REQUEST,
        count: 0,
      }),
    ).toThrow(
      'Question quantity must be a positive whole number.',
    )
  })

  it('rejects an unsafe seed', () => {
    expect(() =>
      selectQuestions(sampleQuestions, {
        ...BASE_REQUEST,
        seed: Number.MAX_SAFE_INTEGER + 1,
      }),
    ).toThrow('Selection seed must be a safe integer.')
  })
})