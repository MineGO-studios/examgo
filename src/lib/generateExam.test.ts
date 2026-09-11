import { describe, expect, it } from 'vitest'
import type { ExamSettings } from '../types/exam'
import type { ExamQuestion } from '../types/question'
import {
  generateReviewedExamDocuments,
  prepareExamQuestions,
} from './generateExam'

const SETTINGS: ExamSettings = {
  schoolName: 'Test School',
  examTitle: 'Monthly Test',
  grade: 6,
  unit: 1,
  marksPerQuestion: 2,
  questionCount: 2,
  selectionSeed: 17,
}

function makeQuestion(id: string, unit = 1): ExamQuestion {
  const correctAnswer = { label: 'B', text: 'Correct' }

  return {
    id,
    unit,
    lesson: '1',
    type: 'multiple-choice',
    difficulty: 'medium',
    prompt: `Question ${id}`,
    options: [
      { label: 'A', text: 'Incorrect' },
      correctAnswer,
    ],
    correctAnswer,
  }
}

describe('prepareExamQuestions', () => {
  it('selects only from the approved questions supplied by the caller', () => {
    const approvedQuestions = [
      makeQuestion('database-1'),
      makeQuestion('database-2'),
      makeQuestion('database-3'),
      makeQuestion('other-unit', 2),
    ]

    const selected = prepareExamQuestions(
      SETTINGS,
      approvedQuestions,
    )

    expect(selected).toHaveLength(2)
    expect(
      selected.every((question) =>
        approvedQuestions.includes(question),
      ),
    ).toBe(true)
    expect(selected.every((question) => question.unit === 1)).toBe(
      true,
    )
  })

  it('rejects generation when the supplied bank has no eligible questions', () => {
    expect(() =>
      prepareExamQuestions(SETTINGS, [makeQuestion('unit-2', 2)]),
    ).toThrow('No approved questions are available for this test.')
  })

  it('applies lesson and difficulty controls to generation', () => {
    const approvedQuestions = [
      makeQuestion('lesson-1'),
      {
        ...makeQuestion('lesson-2'),
        lesson: '2',
        difficulty: 'hard' as const,
      },
    ]

    expect(
      prepareExamQuestions(
        { ...SETTINGS, questionCount: 1 },
        approvedQuestions,
        {
          questionType: 'multiple-choice',
          lesson: '2',
          difficulty: 'hard',
        },
      ).map((question) => question.id),
    ).toEqual(['lesson-2'])
  })
})

describe('generateReviewedExamDocuments', () => {
  it('revalidates settings after questions are previewed', async () => {
    await expect(
      generateReviewedExamDocuments(
        { ...SETTINGS, schoolName: ' ' },
        [makeQuestion('Q-1')],
      ),
    ).rejects.toThrow('School name is required.')
  })
})
