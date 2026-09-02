import type { ExamQuestion } from '../data/sampleQuestions'

export type QuestionSelectionRequest = {
  unit: number
  type: ExamQuestion['type']
  lesson?: string
  difficulty?: ExamQuestion['difficulty']
  count: number
  seed: number
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0

  return () => {
    state += 0x6d2b79f5

    let value = state

    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^=
      value +
      Math.imul(value ^ (value >>> 7), value | 61)

    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function validateQuestionIds(
  questions: readonly ExamQuestion[],
): void {
  const seenIds = new Set<string>()

  for (const question of questions) {
    if (seenIds.has(question.id)) {
      throw new Error(
        `Question bank contains duplicate ID: ${question.id}.`,
      )
    }

    seenIds.add(question.id)
  }
}

export function selectQuestions(
  questions: readonly ExamQuestion[],
  request: QuestionSelectionRequest,
): ExamQuestion[] {
  if (!Number.isInteger(request.count) || request.count < 1) {
    throw new RangeError(
      'Question quantity must be a positive whole number.',
    )
  }

  if (!Number.isSafeInteger(request.seed)) {
    throw new RangeError('Selection seed must be a safe integer.')
  }

  validateQuestionIds(questions)

  const eligibleQuestions = questions.filter((question) => {
    if (question.unit !== request.unit) {
      return false
    }

    if (question.type !== request.type) {
      return false
    }

    if (
      request.lesson !== undefined &&
      question.lesson !== request.lesson
    ) {
      return false
    }

    if (
      request.difficulty !== undefined &&
      question.difficulty !== request.difficulty
    ) {
      return false
    }

    return true
  })

  if (eligibleQuestions.length < request.count) {
    throw new Error(
      `Only ${eligibleQuestions.length} eligible questions are ` +
        `available, but ${request.count} were requested.`,
    )
  }

  const random = createSeededRandom(request.seed)
  const shuffledQuestions = [...eligibleQuestions]

  for (
    let index = shuffledQuestions.length - 1;
    index > 0;
    index -= 1
  ) {
    const replacementIndex = Math.floor(
      random() * (index + 1),
    )

    ;[
      shuffledQuestions[index],
      shuffledQuestions[replacementIndex],
    ] = [
      shuffledQuestions[replacementIndex],
      shuffledQuestions[index],
    ]
  }

  return shuffledQuestions.slice(0, request.count)
}