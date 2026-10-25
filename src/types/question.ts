export type QuestionOption = { label: string; text: string }

export type SimpleQuestionType = 'multiple-choice' | 'binary' | 'short-answer'

export type PhaseNineExerciseType =
  | 'completion'
  | 'odd-word'
  | 'word-relationship'
  | 'rewrite'
  | 'extended-writing'

export type AuthorableQuestionType =
  | SimpleQuestionType
  | PhaseNineExerciseType
  | 'matching'

const SIMPLE_QUESTION_TYPE_SET = new Set<string>([
  'multiple-choice',
  'binary',
  'short-answer',
])

export function isSimpleQuestionType(
  value: string,
): value is SimpleQuestionType {
  return SIMPLE_QUESTION_TYPE_SET.has(value)
}

type ExamQuestionBase = {
  id: string
  /** Publisher-assigned conflicts, scoped by unit. Private-bank questions omit these. */
  selectionKeys?: string[]
  unit: number
  lesson: string
  difficulty: 'easy' | 'medium' | 'hard'
  prompt: string
  marks: number
  options?: QuestionOption[]
  correctAnswer?: QuestionOption
}

export type ExamQuestion =
  | (ExamQuestionBase & {
      type: 'multiple-choice'
      options: QuestionOption[]
      correctAnswer: QuestionOption
    })
  | (ExamQuestionBase & {
      type: 'binary'
      labelMode: 'true-false' | 'yes-no'
      isTrue: boolean
    })
  | (ExamQuestionBase & {
      type: 'short-answer'
      answerLines: number
      canonicalAnswer: string
      approvedVariants: string[]
      caseSensitive: boolean
    })
