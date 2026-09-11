import { describe, expect, it } from 'vitest'
import type { ExamQuestion } from '../types/question'
import {
  DEFAULT_EXAM_QUESTION_FILTERS,
  DEFAULT_EXAM_SETTINGS,
} from '../types/exam'
import {
  createQuestionReview,
  removeQuestionFromReview,
  replaceQuestionInReview,
  toggleQuestionLock,
} from './reviewQuestions'

const questions: ExamQuestion[] = [
  {
    id: 'Q-1',
    unit: 1,
    lesson: '1',
    type: 'multiple-choice',
    difficulty: 'medium',
    prompt: 'Question one',
    options: [
      { label: 'A', text: 'One' },
      { label: 'B', text: 'Two' },
    ],
    correctAnswer: { label: 'A', text: 'One' },
  },
  {
    id: 'Q-2',
    unit: 1,
    lesson: '1',
    type: 'multiple-choice',
    difficulty: 'medium',
    prompt: 'Question two',
    options: [
      { label: 'A', text: 'One' },
      { label: 'B', text: 'Two' },
    ],
    correctAnswer: { label: 'B', text: 'Two' },
  },
  {
    id: 'Q-3',
    unit: 1,
    lesson: '1',
    type: 'multiple-choice',
    difficulty: 'medium',
    prompt: 'Question three',
    options: [
      { label: 'A', text: 'One' },
      { label: 'B', text: 'Two' },
    ],
    correctAnswer: { label: 'A', text: 'One' },
  },
]

describe('question review controls', () => {
  it('creates an unlocked preview and toggles one lock', () => {
    const review = createQuestionReview(questions.slice(0, 2))
    const locked = toggleQuestionLock(review, 'Q-1')

    expect(locked[0].locked).toBe(true)
    expect(locked[1].locked).toBe(false)
  })

  it('does not remove a locked question', () => {
    const review = toggleQuestionLock(
      createQuestionReview(questions.slice(0, 2)),
      'Q-1',
    )

    expect(() => removeQuestionFromReview(review, 'Q-1')).toThrow(
      'Unlock this question before removing it.',
    )
  })

  it('removes an unlocked question while preserving the rest', () => {
    const review = createQuestionReview(questions.slice(0, 2))

    expect(removeQuestionFromReview(review, 'Q-1')).toEqual([
      { question: questions[1], locked: false },
    ])
  })

  it('replaces an unlocked question with an eligible unselected one', () => {
    const review = createQuestionReview(questions.slice(0, 2))
    const replaced = replaceQuestionInReview(
      review,
      'Q-1',
      questions,
      { ...DEFAULT_EXAM_SETTINGS, questionCount: 2 },
      {
        ...DEFAULT_EXAM_QUESTION_FILTERS,
        lesson: '1',
        difficulty: 'medium',
      },
    )

    expect(replaced.map((item) => item.question.id)).toEqual([
      'Q-3',
      'Q-2',
    ])
  })

  it('reports when no eligible replacement remains', () => {
    const review = createQuestionReview(questions)

    expect(() =>
      replaceQuestionInReview(
        review,
        'Q-1',
        questions,
        { ...DEFAULT_EXAM_SETTINGS, questionCount: 3 },
        {
          ...DEFAULT_EXAM_QUESTION_FILTERS,
          lesson: '1',
          difficulty: 'medium',
        },
      ),
    ).toThrow('Only 0 eligible questions are available')
  })
})
