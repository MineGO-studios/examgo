import type {
  ExamQuestionFilters,
  ExamSettings,
} from '../types/exam'
import type { ExamQuestion } from '../types/question'
import { selectQuestions } from './selectQuestions'

export type ReviewedQuestion = {
  question: ExamQuestion
  locked: boolean
}

export function createQuestionReview(
  questions: readonly ExamQuestion[],
): ReviewedQuestion[] {
  return questions.map((question) => ({ question, locked: false }))
}

export function toggleQuestionLock(
  review: readonly ReviewedQuestion[],
  questionId: string,
): ReviewedQuestion[] {
  return review.map((item) =>
    item.question.id === questionId
      ? { ...item, locked: !item.locked }
      : item,
  )
}

export function removeQuestionFromReview(
  review: readonly ReviewedQuestion[],
  questionId: string,
): ReviewedQuestion[] {
  const target = review.find(
    (item) => item.question.id === questionId,
  )

  if (!target) {
    throw new Error('The selected question is no longer in the preview.')
  }

  if (target.locked) {
    throw new Error('Unlock this question before removing it.')
  }

  if (review.length === 1) {
    throw new Error('An exam must contain at least one question.')
  }

  return review.filter((item) => item.question.id !== questionId)
}

export function replaceQuestionInReview(
  review: readonly ReviewedQuestion[],
  questionId: string,
  questionPool: readonly ExamQuestion[],
  settings: ExamSettings,
  filters: ExamQuestionFilters,
): ReviewedQuestion[] {
  const targetIndex = review.findIndex(
    (item) => item.question.id === questionId,
  )

  if (targetIndex < 0) {
    throw new Error('The selected question is no longer in the preview.')
  }

  if (review[targetIndex].locked) {
    throw new Error('Unlock this question before replacing it.')
  }

  const selectedIds = new Set(
    review.map((item) => item.question.id),
  )
  const availableQuestions = questionPool.filter(
    (question) => !selectedIds.has(question.id),
  )
  const [replacement] = selectQuestions(availableQuestions, {
    unit: settings.unit,
    type: filters.questionType,
    lesson: filters.lesson || undefined,
    difficulty: filters.difficulty || undefined,
    count: 1,
    seed: settings.selectionSeed + targetIndex + 1,
  })

  return review.map((item, index) =>
    index === targetIndex
      ? { question: replacement, locked: false }
      : item,
  )
}
