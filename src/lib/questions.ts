import type { Tables } from '../types/database'
import type {
  AuthorableQuestionType,
  ExamQuestion,
  QuestionOption,
} from '../types/question'
import {
  MANUAL_MARKING_NOTE,
  questionRowToDomain,
  QUESTION_SCHEMA_VERSION,
  validateDomainQuestion,
  type DomainValidationIssue,
  type MatchingItem,
} from '../domain/questionDomain'
import type { PhaseNineQuestion } from './phaseNineWorkflow'

export type Question = Tables<'questions'>
export type QuestionOptionInput = QuestionOption

export type WritingGuidanceInput = {
  modelAnswer: string
  rubricCriteria: string[]
  manualOnly: boolean
}

export type QuestionInput = {
  bankId: string
  externalId: string
  unit: number
  lesson: string
  questionType: AuthorableQuestionType
  difficulty: 'easy' | 'medium' | 'hard'
  prompt: string
  marks: number | null
  options: QuestionOptionInput[]
  correctOptionLabel: string
  binaryLabelMode: 'true-false' | 'yes-no'
  binaryAnswer: boolean
  canonicalAnswer: string
  approvedVariants: string[]
  caseSensitive: boolean
  answerLines: number
  completionText?: string
  completionBlankIds?: string[]
  completionWordBank?: string[]
  completionWordBankOrder?: 'ordered' | 'unordered'
  completionAllowWordReuse?: boolean
  completionRequireAllWordsUsed?: boolean
  completionAnswers?: Record<string, string>
  oddWords?: string[]
  oddWordAnswer?: string
  relationshipWords?: [string, string]
  relationshipAcceptedAnswers?: string[]
  rewriteInstruction?: string
  rewriteAcceptedAnswers?: string[]
  writingMinimumWords?: number | null
  writingMaximumWords?: number | null
  writingGuidance?: WritingGuidanceInput
  matchingLeft?: MatchingItem[]
  matchingRight?: MatchingItem[]
  matchingPairs?: Array<{ leftId: string; rightId: string }>
  isActive: boolean
}

export type QuestionValidationErrors = Partial<Record<keyof QuestionInput, string>>

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isValidUuid(value: string): boolean {
  return UUID_PATTERN.test(value.trim())
}

export function normalizeQuestionInput(input: QuestionInput): QuestionInput {
  const normalized: QuestionInput = {
    ...input,
    bankId: input.bankId.trim().toLowerCase(),
    externalId: input.externalId.trim(),
    lesson: input.lesson.trim(),
    prompt: input.prompt.trim(),
    options: (Array.isArray(input.options) ? input.options : []).map((option) => ({
      label: option.label.trim().toUpperCase(),
      text: option.text.trim(),
    })),
    correctOptionLabel: input.correctOptionLabel.trim().toUpperCase(),
    marks: input.marks ?? null,
    binaryLabelMode: input.binaryLabelMode ?? 'true-false',
    binaryAnswer: input.binaryAnswer ?? true,
    canonicalAnswer: (input.canonicalAnswer ?? '').trim(),
    approvedVariants: (input.approvedVariants ?? []).map((variant) => variant.trim()).filter(Boolean),
    caseSensitive: input.caseSensitive ?? false,
    answerLines: input.answerLines ?? 2,
  }

  if (input.questionType === 'completion') {
    normalized.completionText = (input.completionText ?? '').trim()
    normalized.completionBlankIds = (input.completionBlankIds ?? [])
      .map((id) => id.trim())
      .filter(Boolean)
    normalized.completionWordBank = (input.completionWordBank ?? [])
      .map((word) => word.trim())
      .filter(Boolean)
    normalized.completionWordBankOrder =
      input.completionWordBankOrder ?? 'unordered'
    normalized.completionAllowWordReuse =
      input.completionAllowWordReuse ?? false
    normalized.completionRequireAllWordsUsed =
      input.completionRequireAllWordsUsed ?? false
    normalized.completionAnswers = Object.fromEntries(
      Object.entries(input.completionAnswers ?? {})
        .map(([id, answer]) => [id.trim(), answer.trim()])
        .filter(([id]) => Boolean(id)),
    )
  }

  if (input.questionType === 'odd-word') {
    normalized.oddWords = (input.oddWords ?? [])
      .map((word) => word.trim())
      .filter(Boolean)
    normalized.oddWordAnswer = (input.oddWordAnswer ?? '').trim()
  }

  if (input.questionType === 'word-relationship') {
    normalized.relationshipWords = [
      input.relationshipWords?.[0]?.trim() ?? '',
      input.relationshipWords?.[1]?.trim() ?? '',
    ]
    normalized.relationshipAcceptedAnswers = (
      input.relationshipAcceptedAnswers ?? []
    )
      .map((answer) => answer.trim())
      .filter(Boolean)
  }

  if (input.questionType === 'rewrite') {
    normalized.rewriteInstruction = (input.rewriteInstruction ?? '').trim()
    normalized.rewriteAcceptedAnswers = (input.rewriteAcceptedAnswers ?? [])
      .map((answer) => answer.trim())
      .filter(Boolean)
  }

  if (input.questionType === 'extended-writing') {
    normalized.writingMinimumWords = input.writingMinimumWords ?? null
    normalized.writingMaximumWords = input.writingMaximumWords ?? null
    normalized.writingGuidance = {
      modelAnswer: (input.writingGuidance?.modelAnswer ?? '').trim(),
      rubricCriteria: (input.writingGuidance?.rubricCriteria ?? [])
        .map((criterion) => criterion.trim())
        .filter(Boolean),
      manualOnly: input.writingGuidance?.manualOnly ?? true,
    }
  }

  if (input.questionType === 'matching') {
    normalized.matchingLeft = (input.matchingLeft ?? []).map((item) => ({ id: item.id.trim(), text: item.text.trim() }))
    normalized.matchingRight = (input.matchingRight ?? []).map((item) => ({ id: item.id.trim(), text: item.text.trim() }))
    normalized.matchingPairs = (input.matchingPairs ?? []).map((pair) => ({ leftId: pair.leftId.trim(), rightId: pair.rightId.trim() }))
  }

  return normalized
}

const AUTHORABLE_QUESTION_TYPES: readonly AuthorableQuestionType[] = [
  'multiple-choice',
  'binary',
  'short-answer',
  'completion',
  'odd-word',
  'word-relationship',
  'rewrite',
  'extended-writing',
  'matching',
]

function validationFieldForIssue(
  issue: DomainValidationIssue,
  questionType: AuthorableQuestionType,
): keyof QuestionInput | null {
  if (issue.path.startsWith('content.text')) return 'completionText'
  if (issue.path.startsWith('content.left')) return 'matchingLeft'
  if (issue.path.startsWith('content.right')) return 'matchingRight'
  if (issue.path.startsWith('answer.pairs')) return 'matchingPairs'
  if (issue.path.startsWith('content.blankIds')) return 'completionBlankIds'
  if (issue.path.startsWith('content.wordBankOrder')) {
    return 'completionWordBankOrder'
  }
  if (issue.path.startsWith('content.wordBank')) return 'completionWordBank'
  if (issue.path.startsWith('content.allowWordReuse')) {
    return 'completionAllowWordReuse'
  }
  if (issue.path.startsWith('content.requireAllWordsUsed')) {
    return 'completionRequireAllWordsUsed'
  }
  if (issue.path.startsWith('answer.answers')) return 'completionAnswers'
  if (issue.path.startsWith('content.words')) {
    return questionType === 'odd-word' ? 'oddWords' : 'relationshipWords'
  }
  if (issue.path.startsWith('answer.oddWord')) return 'oddWordAnswer'
  if (issue.path.startsWith('answer.acceptedAnswers')) {
    return questionType === 'rewrite'
      ? 'rewriteAcceptedAnswers'
      : 'relationshipAcceptedAnswers'
  }
  if (issue.path.startsWith('content.instruction')) return 'rewriteInstruction'
  if (issue.path.startsWith('content.minimumWords')) {
    return 'writingMinimumWords'
  }
  if (issue.path.startsWith('content.maximumWords')) {
    return 'writingMaximumWords'
  }
  if (issue.path.startsWith('answer')) return 'writingGuidance'
  return null
}

export function validateQuestionInput(input: QuestionInput): QuestionValidationErrors {
  const errors: QuestionValidationErrors = {}
  if (!isValidUuid(input.bankId)) errors.bankId = 'A valid question bank is required.'
  const externalId = input.externalId.trim()
  if (externalId.length < 1 || externalId.length > 80) errors.externalId = 'Question ID must contain between 1 and 80 characters.'
  if (!Number.isSafeInteger(input.unit) || input.unit < 1 || input.unit > 8) errors.unit = 'Unit must be a whole number between 1 and 8.'
  const lesson = input.lesson.trim()
  if (lesson.length < 1 || lesson.length > 40) errors.lesson = 'Lesson must contain between 1 and 40 characters.'
  if (!AUTHORABLE_QUESTION_TYPES.includes(input.questionType)) errors.questionType = 'Select a supported question type.'
  if (!['easy', 'medium', 'hard'].includes(input.difficulty)) errors.difficulty = 'Select a valid difficulty.'
  const prompt = input.prompt.trim()
  if (prompt.length < 1 || prompt.length > 2000) errors.prompt = 'Question text must contain between 1 and 2000 characters.'

  if (input.questionType === 'multiple-choice') {
    if (!Array.isArray(input.options) || input.options.length < 2 || input.options.length > 6) {
      errors.options = 'Provide between 2 and 6 answer options.'
    } else {
      const labels = input.options.map((option) => option.label.trim().toUpperCase())
      const invalid = input.options.some((option) => option.label.trim().length < 1 || option.label.trim().length > 10 || option.text.trim().length < 1)
      if (invalid) errors.options = 'Every option requires a label of 1–10 characters and answer text.'
      else if (new Set(labels).size !== labels.length) errors.options = 'Answer option labels must be unique.'
      if (!labels.includes(input.correctOptionLabel.trim().toUpperCase())) errors.correctOptionLabel = 'The correct answer must match one of the option labels.'
    }
  }
  if (input.questionType === 'binary' && input.binaryLabelMode !== 'true-false' && input.binaryLabelMode !== 'yes-no') errors.binaryLabelMode = 'Select True/False or Yes/No labels.'
  if (input.questionType === 'binary' && typeof input.binaryAnswer !== 'boolean') errors.binaryAnswer = 'Select the correct binary answer.'
  if (input.questionType === 'short-answer') {
    const canonical = (input.canonicalAnswer ?? '').trim()
    if (!canonical) errors.canonicalAnswer = 'Enter the correct answer before saving.'
    const variants = (input.approvedVariants ?? []).map((variant) => variant.trim()).filter(Boolean)
    const normalized = variants.map((variant) => variant.toLocaleLowerCase())
    if (new Set(normalized).size !== normalized.length || normalized.includes(canonical.toLocaleLowerCase())) errors.approvedVariants = 'List each other accepted answer once, without repeating the correct answer.'
    const answerLines = input.answerLines ?? 2
    if (!Number.isSafeInteger(answerLines) || answerLines < 1 || answerLines > 20) errors.answerLines = 'Answer lines must be a whole number between 1 and 20.'
  }
  if (AUTHORABLE_QUESTION_TYPES.includes(input.questionType)) {
    const normalized = normalizeQuestionInput(input)
    const payload = questionInputPayload(normalized)
    const result = validateDomainQuestion({
      id: 'question-validation',
      ownerId: 'owner-validation',
      bankId: normalized.bankId || 'bank-validation',
      externalId: normalized.externalId || 'external-validation',
      unit: normalized.unit,
      lesson: normalized.lesson || 'lesson-validation',
      type: normalized.questionType,
      schemaVersion: QUESTION_SCHEMA_VERSION,
      difficulty: normalized.difficulty,
      prompt: normalized.prompt || 'prompt-validation',
      marks: normalized.marks,
      content: payload.content,
      answer: payload.answer,
      isActive: normalized.isActive,
      revision: 1,
    })
    if (!result.success) {
      result.issues.forEach((issue) => {
        const field = validationFieldForIssue(
          issue,
          normalized.questionType,
        )
        if (field && !errors[field]) errors[field] = issue.message
      })
    }
  }
  if (typeof input.isActive !== 'boolean') errors.isActive = 'Question status must be valid.'
  return errors
}

export function getFirstQuestionValidationError(errors: QuestionValidationErrors): string | null {
  return Object.values(errors)[0] ?? null
}

function createCommonInput(question: ReturnType<typeof questionRowToDomain>): QuestionInput {
  return {
    bankId: question.bankId,
    externalId: question.externalId,
    unit: question.unit,
    lesson: question.lesson,
    questionType: question.type as AuthorableQuestionType,
    difficulty: question.difficulty,
    prompt: question.prompt,
    marks: question.marks,
    options: [],
    correctOptionLabel: '',
    binaryLabelMode: 'true-false',
    binaryAnswer: true,
    canonicalAnswer: '',
    approvedVariants: [],
    caseSensitive: false,
    answerLines: 2,
    isActive: question.isActive,
  }
}

export function questionToInput(question: Question): QuestionInput {
  let domainQuestion: ReturnType<typeof questionRowToDomain>
  try { domainQuestion = questionRowToDomain(question) }
  catch { throw new Error('This question contains invalid saved data and cannot be used safely.') }
  return domainQuestionToInput(domainQuestion)
}

export function domainQuestionToInput(domainQuestion: ReturnType<typeof questionRowToDomain>): QuestionInput {
  const input = createCommonInput(domainQuestion)
  switch (domainQuestion.type) {
    case 'multiple-choice':
      input.options = domainQuestion.content.options
      input.correctOptionLabel = domainQuestion.answer.correctOptionLabel
      break
    case 'binary':
      input.binaryLabelMode = domainQuestion.content.labelMode
      input.binaryAnswer = domainQuestion.answer.isTrue
      break
    case 'short-answer':
      input.answerLines = domainQuestion.content.answerLines ?? 2
      input.canonicalAnswer = domainQuestion.answer.canonicalAnswer
      input.approvedVariants = domainQuestion.answer.approvedVariants ?? []
      input.caseSensitive = domainQuestion.answer.caseSensitive ?? false
      break
    case 'completion':
      input.completionText = domainQuestion.content.text
      input.completionBlankIds = domainQuestion.content.blankIds
      input.completionWordBank = domainQuestion.content.wordBank
      input.completionWordBankOrder = domainQuestion.content.wordBankOrder
      input.completionAllowWordReuse = domainQuestion.content.allowWordReuse
      input.completionRequireAllWordsUsed =
        domainQuestion.content.requireAllWordsUsed
      input.completionAnswers = domainQuestion.answer.answers
      break
    case 'odd-word':
      input.oddWords = domainQuestion.content.words
      input.oddWordAnswer = domainQuestion.answer.oddWord
      break
    case 'word-relationship':
      input.relationshipWords = domainQuestion.content.words
      input.relationshipAcceptedAnswers = domainQuestion.answer.acceptedAnswers
      break
    case 'rewrite':
      input.rewriteInstruction = domainQuestion.content.instruction
      input.rewriteAcceptedAnswers = domainQuestion.answer.acceptedAnswers
      break
    case 'extended-writing':
      input.writingMinimumWords = domainQuestion.content.minimumWords ?? null
      input.writingMaximumWords = domainQuestion.content.maximumWords ?? null
      input.writingGuidance = {
        modelAnswer: domainQuestion.answer.modelAnswer ?? '',
        rubricCriteria: domainQuestion.answer.rubricCriteria ?? [],
        manualOnly:
          domainQuestion.answer.manualMarkingNote === MANUAL_MARKING_NOTE,
      }
      break
    case 'matching':
      input.matchingLeft = domainQuestion.content.left
      input.matchingRight = domainQuestion.content.right
      input.matchingPairs = domainQuestion.answer.pairs
      break
    default:
      throw new Error('This question type is not supported by the current editor.')
  }
  if (Object.keys(validateQuestionInput(input)).length > 0) throw new Error('This question contains invalid saved data and cannot be used safely.')
  return normalizeQuestionInput(input)
}

export function questionToExamQuestion(question: Question, allocation?: { marks: number }): ExamQuestion {
  let domainQuestion: ReturnType<typeof questionRowToDomain>
  try { domainQuestion = questionRowToDomain(question) }
  catch { throw new Error('This question contains invalid saved data and cannot be used safely.') }
  const marks = allocation?.marks ?? domainQuestion.marks
  if (marks === null || !Number.isSafeInteger(marks) || marks < 1 || marks > 1000) {
    throw new Error('Assign whole-number marks to this question when composing the exam.')
  }
  const common = { id: domainQuestion.id, unit: domainQuestion.unit, lesson: domainQuestion.lesson, difficulty: domainQuestion.difficulty, prompt: domainQuestion.prompt, marks }
  switch (domainQuestion.type) {
    case 'multiple-choice': {
      const correctAnswer = domainQuestion.content.options.find((option) => option.label.trim().toUpperCase() === domainQuestion.answer.correctOptionLabel.trim().toUpperCase())
      if (!correctAnswer) throw new Error('This question does not have a valid correct answer.')
      return { ...common, type: 'multiple-choice', options: domainQuestion.content.options, correctAnswer }
    }
    case 'binary':
      return { ...common, type: 'binary', labelMode: domainQuestion.content.labelMode, isTrue: domainQuestion.answer.isTrue }
    case 'short-answer':
      return { ...common, type: 'short-answer', answerLines: domainQuestion.content.answerLines ?? 2, canonicalAnswer: domainQuestion.answer.canonicalAnswer, approvedVariants: domainQuestion.answer.approvedVariants ?? [], caseSensitive: domainQuestion.answer.caseSensitive ?? false }
    default:
      throw new Error('This question type is not supported by simple-question selection.')
  }
}

export function questionToPhaseNineQuestion(
  question: Question,
): PhaseNineQuestion {
  let domainQuestion: ReturnType<typeof questionRowToDomain>
  try {
    domainQuestion = questionRowToDomain(question)
  } catch {
    throw new Error(
      'This question contains invalid saved data and cannot be used safely.',
    )
  }

  switch (domainQuestion.type) {
    case 'completion':
    case 'odd-word':
    case 'word-relationship':
    case 'rewrite':
    case 'extended-writing':
      return structuredClone(domainQuestion)
    default:
      throw new Error(
        'This question type is not supported by the Phase 9 workflow.',
      )
  }
}

export function questionInputPayload(input: QuestionInput) {
  switch (input.questionType) {
    case 'matching':
      return { schema_version: QUESTION_SCHEMA_VERSION,
        content: { type: 'matching', schemaVersion: QUESTION_SCHEMA_VERSION, left: input.matchingLeft ?? [], right: input.matchingRight ?? [] },
        answer: { type: 'matching', schemaVersion: QUESTION_SCHEMA_VERSION, pairs: input.matchingPairs ?? [] },
        options: null, correct_option_label: null } as const
    case 'multiple-choice':
      return { schema_version: QUESTION_SCHEMA_VERSION, content: { type: 'multiple-choice', schemaVersion: QUESTION_SCHEMA_VERSION, options: input.options }, answer: { type: 'multiple-choice', schemaVersion: QUESTION_SCHEMA_VERSION, correctOptionLabel: input.correctOptionLabel }, options: input.options, correct_option_label: input.correctOptionLabel } as const
    case 'binary':
      return { schema_version: QUESTION_SCHEMA_VERSION, content: { type: 'binary', schemaVersion: QUESTION_SCHEMA_VERSION, labelMode: input.binaryLabelMode }, answer: { type: 'binary', schemaVersion: QUESTION_SCHEMA_VERSION, isTrue: input.binaryAnswer }, options: null, correct_option_label: null } as const
    case 'short-answer':
      return { schema_version: QUESTION_SCHEMA_VERSION, content: { type: 'short-answer', schemaVersion: QUESTION_SCHEMA_VERSION, answerLines: input.answerLines }, answer: { type: 'short-answer', schemaVersion: QUESTION_SCHEMA_VERSION, canonicalAnswer: input.canonicalAnswer, approvedVariants: input.approvedVariants, caseSensitive: input.caseSensitive }, options: null, correct_option_label: null } as const
    case 'completion':
      return {
        schema_version: QUESTION_SCHEMA_VERSION,
        content: {
          type: 'completion',
          schemaVersion: QUESTION_SCHEMA_VERSION,
          text: input.completionText ?? '',
          blankIds: input.completionBlankIds ?? [],
          wordBank: input.completionWordBank ?? [],
          wordBankOrder: input.completionWordBankOrder ?? 'unordered',
          allowWordReuse: input.completionAllowWordReuse ?? false,
          requireAllWordsUsed:
            input.completionRequireAllWordsUsed ?? false,
        },
        answer: {
          type: 'completion',
          schemaVersion: QUESTION_SCHEMA_VERSION,
          answers: input.completionAnswers ?? {},
        },
        options: null,
        correct_option_label: null,
      } as const
    case 'odd-word':
      return {
        schema_version: QUESTION_SCHEMA_VERSION,
        content: {
          type: 'odd-word',
          schemaVersion: QUESTION_SCHEMA_VERSION,
          words: input.oddWords ?? [],
        },
        answer: {
          type: 'odd-word',
          schemaVersion: QUESTION_SCHEMA_VERSION,
          oddWord: input.oddWordAnswer ?? '',
        },
        options: null,
        correct_option_label: null,
      } as const
    case 'word-relationship':
      return {
        schema_version: QUESTION_SCHEMA_VERSION,
        content: {
          type: 'word-relationship',
          schemaVersion: QUESTION_SCHEMA_VERSION,
          words: input.relationshipWords ?? ['', ''],
        },
        answer: {
          type: 'word-relationship',
          schemaVersion: QUESTION_SCHEMA_VERSION,
          acceptedAnswers: input.relationshipAcceptedAnswers ?? [],
        },
        options: null,
        correct_option_label: null,
      } as const
    case 'rewrite':
      return {
        schema_version: QUESTION_SCHEMA_VERSION,
        content: {
          type: 'rewrite',
          schemaVersion: QUESTION_SCHEMA_VERSION,
          instruction: input.rewriteInstruction ?? '',
        },
        answer: {
          type: 'rewrite',
          schemaVersion: QUESTION_SCHEMA_VERSION,
          acceptedAnswers: input.rewriteAcceptedAnswers ?? [],
        },
        options: null,
        correct_option_label: null,
      } as const
    case 'extended-writing': {
      const guidance = input.writingGuidance ?? {
        modelAnswer: '',
        rubricCriteria: [],
        manualOnly: true,
      }
      return {
        schema_version: QUESTION_SCHEMA_VERSION,
        content: {
          type: 'extended-writing',
          schemaVersion: QUESTION_SCHEMA_VERSION,
          ...(input.writingMinimumWords === null ||
          input.writingMinimumWords === undefined
            ? {}
            : { minimumWords: input.writingMinimumWords }),
          ...(input.writingMaximumWords === null ||
          input.writingMaximumWords === undefined
            ? {}
            : { maximumWords: input.writingMaximumWords }),
        },
        answer: {
          type: 'extended-writing',
          schemaVersion: QUESTION_SCHEMA_VERSION,
          ...(guidance.modelAnswer.trim()
            ? { modelAnswer: guidance.modelAnswer.trim() }
            : {}),
          ...(guidance.rubricCriteria.length > 0
            ? { rubricCriteria: guidance.rubricCriteria }
            : {}),
          ...(guidance.manualOnly
            ? { manualMarkingNote: MANUAL_MARKING_NOTE }
            : {}),
        },
        options: null,
        correct_option_label: null,
      } as const
    }
  }
}
