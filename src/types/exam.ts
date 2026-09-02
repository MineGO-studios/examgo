export type ExamSettings = {
  schoolName: string
  examTitle: string
  grade: number
  unit: number
  marksPerQuestion: number
  questionCount: number
  selectionSeed: number
}

export const EXAM_LIMITS = {
  schoolNameMaxLength: 80,
  examTitleMaxLength: 80,
  minimumMarksPerQuestion: 1,
  maximumMarksPerQuestion: 20,
  minimumQuestionCount: 1,
  maximumQuestionCount: 5,
  minimumSelectionSeed: 0,
  maximumSelectionSeed: 4294967295,
} as const

export const DEFAULT_EXAM_SETTINGS: ExamSettings = {
  schoolName: 'MineGO Test School',
  examTitle: 'First Monthly Test',
  grade: 6,
  unit: 1,
  marksPerQuestion: 1,
  questionCount: 5,
  selectionSeed: 1,
}
