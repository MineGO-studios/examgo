import {
  type Question,
  type QuestionInput,
  type QuestionOptionInput,
} from './questions'

const DEFAULT_OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F']

export function createQuestionReference(
  uuid: string = globalThis.crypto.randomUUID(),
): string {
  return `Q-${uuid}`
}

export function createEmptyQuestionInput(
  bankId: string,
): QuestionInput {
  const matchingLeft = [{ id: globalThis.crypto.randomUUID(), text: '' }, { id: globalThis.crypto.randomUUID(), text: '' }]
  const matchingRight = [{ id: globalThis.crypto.randomUUID(), text: '' }, { id: globalThis.crypto.randomUUID(), text: '' }]
  return {
    bankId,
    externalId: createQuestionReference(),
    unit: 1,
    lesson: '1',
    questionType: 'multiple-choice',
    difficulty: 'medium',
    prompt: '',
    marks: null,
    options: [
      { label: 'A', text: '' },
      { label: 'B', text: '' },
      { label: 'C', text: '' },
    ],
    correctOptionLabel: 'A',
    binaryLabelMode: 'true-false',
    binaryAnswer: true,
    canonicalAnswer: '',
    approvedVariants: [],
    caseSensitive: false,
    answerLines: 2,
    matchingLeft,
    matchingRight,
    matchingPairs: matchingLeft.map((item, index) => ({ leftId: item.id, rightId: matchingRight[index].id })),
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
