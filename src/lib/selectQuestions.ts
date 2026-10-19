export type SelectableQuestion = {
  id: string
  selectionKeys?: readonly string[]
  unit: number
  lesson: string
  type: string
  difficulty: 'easy' | 'medium' | 'hard'
}

export function questionSelectionKeys(question: SelectableQuestion): string[] {
  const keys = question.selectionKeys ?? []
  if (keys.length > 20 || keys.some(key => typeof key !== 'string' || !key.trim() || key.length > 200)) {
    throw new Error('Invalid question selection identity.')
  }
  return keys.map(key => `${question.unit}:${key}`)
}

export function conflictsWithSelection(question: SelectableQuestion, selected: readonly SelectableQuestion[]): boolean {
  const used = new Set(selected.flatMap(questionSelectionKeys))
  return questionSelectionKeys(question).some(key => used.has(key))
}

export type QuestionSelectionRequest<
  QuestionType extends string = string,
> = {
  unit: number
  type: QuestionType
  lesson?: string
  difficulty?: SelectableQuestion['difficulty']
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
  questions: readonly SelectableQuestion[],
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

export function selectQuestions<Question extends SelectableQuestion>(
  questions: readonly Question[],
  request: QuestionSelectionRequest,
): Question[] {
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

  const selected: Question[] = []
  for (const question of shuffledQuestions) {
    if (!conflictsWithSelection(question, selected)) selected.push(question)
    if (selected.length === request.count) return selected
  }
  // Conflicting family/wording keys can overlap without forming one equivalence
  // class. Try bounded alternatives before reporting that the count cannot fit.
  let visits = 0
  const search = (start: number, picked: Question[]): Question[] | null => {
    if (++visits > 100_000) throw new Error('Question variety search reached its limit. Reduce quantity or narrow the pool.')
    if (picked.length === request.count) return picked
    if (shuffledQuestions.length - start < request.count - picked.length) return null
    for (let index = start; index < shuffledQuestions.length; index++) {
      const question = shuffledQuestions[index]
      if (conflictsWithSelection(question, picked)) continue
      const result = search(index + 1, [...picked, question])
      if (result) return result
    }
    return null
  }
  const alternative = search(0, [])
  if (alternative) return alternative
  throw new Error(`Only ${selected.length} different question ideas fit this selection, but ${request.count} were requested.`)
}

export function selectMixedQuestions<Question extends SelectableQuestion>(
  questions: readonly Question[],
  requests: readonly QuestionSelectionRequest[],
): Question[] {
  validateQuestionIds(questions)
  const selected: Question[] = []
  const selectedIds = new Set<string>()

  requests.forEach((request, requestIndex) => {
    if (request.count === 0) return
    const available = questions.filter((question) => !selectedIds.has(question.id) && !conflictsWithSelection(question, selected))
    const next = selectQuestions(available, {
      ...request,
      seed: (request.seed + requestIndex * 1_000_003) >>> 0,
    })
    next.forEach((question) => {
      if (selectedIds.has(question.id)) throw new Error(`Question ${question.id} was selected more than once.`)
      selectedIds.add(question.id)
      selected.push(question)
    })
  })

  return selected
}
