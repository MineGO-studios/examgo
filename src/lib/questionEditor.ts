import {
  type Question,
  type QuestionInput,
  type QuestionOptionInput,
} from './questions'

const DEFAULT_OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F']

export function createEmptyQuestionInput(
  bankId: string,
): QuestionInput {
  return {
    bankId,
    externalId: '',
    unit: 1,
    lesson: '1',
    questionType: 'multiple-choice',
    difficulty: 'medium',
    prompt: '',
    options: [
      { label: 'A', text: '' },
      { label: 'B', text: '' },
      { label: 'C', text: '' },
    ],
    correctOptionLabel: 'A',
    isActive: true,
  }
}

export function addQuestionOption(
  options: QuestionOptionInput[],
): QuestionOptionInput[] {
  if (options.length >= DEFAULT_OPTION_LABELS.length) {
    return options
  }

  return [
    ...options,
    {
      label: DEFAULT_OPTION_LABELS[options.length],
      text: '',
    },
  ]
}

export function removeQuestionOption(
  options: QuestionOptionInput[],
  index: number,
): QuestionOptionInput[] {
  if (options.length <= 2) {
    return options
  }

  return options.filter((_, optionIndex) => optionIndex !== index)
}

export function sortQuestions(
  questions: Question[],
): Question[] {
  return [...questions].sort(
    (left, right) =>
      left.unit - right.unit ||
      left.lesson.localeCompare(right.lesson, undefined, {
        numeric: true,
      }) ||
      left.external_id.localeCompare(right.external_id, undefined, {
        numeric: true,
      }),
  )
}
