import type { SimpleQuestionType } from './question'

export type SimpleQuestionQuantities = Record<SimpleQuestionType, number>

export type ExamSettings = {
  schoolName: string
  examTitle: string
  teacherName?: string
  grade: number
  unit: number
  marksPerQuestion: number
  questionCount: number
  selectionSeed: number
  questionQuantities?: SimpleQuestionQuantities
}

export type ExamQuestionFilters = {
  questionType: SimpleQuestionType
  lesson: string
  difficulty: '' | 'easy' | 'medium' | 'hard'
}

export const EXAM_LIMITS = {
  schoolNameMaxLength: 80,
  examTitleMaxLength: 80,
  teacherNameMaxLength: 80,
  minimumMarksPerQuestion: 1,
  maximumMarksPerQuestion: 20,
  minimumQuestionCount: 1,
  maximumQuestionCount: 50,
  minimumSelectionSeed: 0,
  maximumSelectionSeed: 4294967295,
} as const

export const DEFAULT_EXAM_SETTINGS: ExamSettings = {
  schoolName: 'MineGO Test School',
  examTitle: 'First Monthly Test',
  teacherName: '',
  grade: 6,
  unit: 1,
  marksPerQuestion: 1,
  questionCount: 5,
  selectionSeed: 1,
}

export const SIMPLE_QUESTION_TYPES = [
  'multiple-choice',
  'binary',
  'short-answer',
] as const satisfies readonly SimpleQuestionType[]

export function getQuestionQuantities(
  settings: ExamSettings,
): SimpleQuestionQuantities {
  return settings.questionQuantities ?? {
    'multiple-choice': settings.questionCount,
    binary: 0,
    'short-answer': 0,
  }
}

export const DEFAULT_EXAM_QUESTION_FILTERS: ExamQuestionFilters = {
  questionType: 'multiple-choice',
  lesson: '',
  difficulty: '',
}
