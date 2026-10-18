import type { StagedInterchangeQuestion } from './questionInterchange'
import {
  getFirstQuestionValidationError,
  normalizeQuestionInput,
  validateQuestionInput,
  domainQuestionToInput,
  type QuestionInput,
} from './questions'
import { validateDomainQuestion, type DomainQuestion } from '../domain/questionDomain'

export type CatalogueConversion =
  | { status: 'ready'; input: QuestionInput }
  | { status: 'review'; reason: string }

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {}
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function textArray(value: unknown): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? value.map((item) => item.trim()).filter(Boolean) : []
}

function answerText(answer: unknown): string {
  return typeof answer === 'string' ? answer.trim() : text(object(answer).text)
}

function optionsFromSource(fields: Record<string, string>): QuestionInput['options'] {
  return ['a', 'b', 'c', 'd', 'e', 'f'].flatMap((letter) => {
    const value = fields[`option_${letter}`]?.trim()
    return value ? [{ label: letter.toUpperCase(), text: value }] : []
  })
}

function matchingItems(value: unknown, side: string): Array<{ id: string; text: string }> {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const row = object(item)
    const label = text(row.label)
    const description = text(row.text)
    return label && description ? [{ id: `${side}:${label}`, text: description }] : []
  })
}

/** Strict conversion candidate. Source groups and provenance remain in staging. */
export function normalizeCatalogueQuestion(question: StagedInterchangeQuestion,
  bankId: string): CatalogueConversion {
  if ((question.groupCompleteness && question.groupCompleteness !== 'complete') ||
    (question.groupIds.length > 0 && question.groupCompleteness !== 'complete')) {
    return { status: 'review', reason: 'Source group is incomplete.' }
  }
  if (!question.lesson) return { status: 'review', reason: 'Lesson is missing.' }
  if (!question.prompt.trim()) return { status: 'review', reason: 'Source question prompt is missing.' }
  const content = object(question.content)
  const answer = object(question.answer)
  const fields = question.sourceFields
  // Canonical typed files use the existing domain contract. Never reinterpret
  // malformed typed content as a different legacy answer representation.
  if ('type' in content || 'schemaVersion' in content || 'type' in answer || 'schemaVersion' in answer) {
    const candidate = { id: '123e4567-e89b-42d3-a456-426614174000', ownerId: '123e4567-e89b-42d3-a456-426614174001',
      bankId, externalId: question.catalogueId, unit: question.displayUnit, lesson: question.lesson,
      type: question.type, schemaVersion: 1, difficulty: question.difficulty, prompt: question.prompt,
      marks: null, content: question.content, answer: question.answer, isActive: true, revision: 1 }
    const validation = validateDomainQuestion(candidate)
    if (!validation.success) return { status: 'review', reason: validation.issues[0].message }
    try { return { status: 'ready', input: domainQuestionToInput(candidate as DomainQuestion) } }
    catch (error) { return { status: 'review', reason: error instanceof Error ? error.message : 'Typed content requires review.' } }
  }
  const base: QuestionInput = {
    bankId, externalId: question.catalogueId, unit: question.displayUnit,
    lesson: question.lesson, questionType: question.type,
    difficulty: question.difficulty, prompt: question.prompt, marks: null,
    options: [], correctOptionLabel: '', binaryLabelMode: 'true-false',
    binaryAnswer: true, canonicalAnswer: '', approvedVariants: [],
    caseSensitive: false, answerLines: 2, isActive: true,
  }
  let reason = ''
  switch (question.type) {
    case 'multiple-choice': {
      base.options = optionsFromSource(fields)
      if (base.options.length === 0 && Array.isArray(content.options)) {
        base.options = content.options.flatMap((item) => {
          const option = object(item)
          const label = text(option.label).toUpperCase()
          const value = text(option.text)
          return label && value ? [{ label, text: value }] : []
        })
      }
      if (base.options.length === 0 && Array.isArray(content.choices)) {
        base.options = content.choices.flatMap((item, index) => {
          const value = text(item)
          return value ? [{ label: String.fromCharCode(65 + index), text: value }] : []
        })
      }
      base.correctOptionLabel = text(fields.correct_option_label || answer.option_label ||
        answer.correctOptionLabel).toUpperCase()
      if (!base.correctOptionLabel && typeof question.answer === 'string') {
        const label = question.answer.trim().toUpperCase()
        if (base.options.some((option) => option.label === label)) base.correctOptionLabel = label
      }
      if (!base.correctOptionLabel && base.options.length > 0) {
        const matches = base.options.filter((option) => option.text.toLocaleLowerCase() ===
          answerText(question.answer).toLocaleLowerCase())
        if (matches.length === 1) base.correctOptionLabel = matches[0].label
      }
      if (base.options.length < 2 || !base.correctOptionLabel) reason = 'Choice options or correct label need review.'
      break
    }
    case 'binary': {
      const positive = text(content.positive_label || answer.printed_positive_label || fields.binary_label_mode)
      base.binaryLabelMode = /yes/i.test(positive) ? 'yes-no' : 'true-false'
      const value = answerText(question.answer).toLowerCase()
      if (['true', 'yes'].includes(value)) base.binaryAnswer = true
      else if (['false', 'no'].includes(value)) base.binaryAnswer = false
      else reason = 'Binary answer needs review.'
      break
    }
    case 'short-answer':
      if (Object.keys(content).length) reason = 'Structured short-answer content needs review.'
      base.canonicalAnswer = answerText(question.answer)
      if (!base.canonicalAnswer) reason = 'Short answer is missing.'
      break
    case 'completion': {
      const words = textArray(content.words ?? content.word_bank)
      const value = answerText(question.answer)
      const blankMatches = question.prompt.match(/_{2,}|\.{3,}|…+/g) ?? []
      if (blankMatches.length !== 1 || words.length < 1 || !value) {
        reason = 'Completion blank, word bank or answer needs review.'
      } else {
        base.completionText = question.prompt
        base.completionBlankIds = ['1']
        base.completionWordBank = words
        base.completionWordBankOrder = 'unordered'
        base.completionAllowWordReuse = false
        base.completionRequireAllWordsUsed = false
        base.completionAnswers = { '1': value }
      }
      break
    }
    case 'odd-word': {
      base.oddWords = optionsFromSource(fields).map((option) => option.text)
      if (!base.oddWords.length) base.oddWords = textArray(content.choices)
      if (!base.oddWords.length) base.oddWords = question.prompt.split(/\s*\/\s*|\s*,\s*/).map((part) => part.trim()).filter(Boolean)
      base.oddWordAnswer = answerText(question.answer)
      break
    }
    case 'matching': {
      base.matchingLeft = matchingItems(content.list_a, 'left')
      base.matchingRight = matchingItems(content.list_b, 'right')
      base.matchingPairs = Array.isArray(answer.pairs) ? answer.pairs.flatMap((item) => {
        const pair = object(item)
        const left = text(pair.left)
        const right = text(pair.right)
        return left && right ? [{ leftId: `left:${left}`, rightId: `right:${right}` }] : []
      }) : []
      break
    }
    case 'word-relationship': {
      const separator = /[;؛]/.test(question.prompt) ? /\s*[;؛]\s*/
        : /→|->/.test(question.prompt) ? /\s*(?:→|->)\s*/ : /\s*[:：]\s*/
      const segments = question.prompt.split(separator).map((part) => part.trim()).filter(Boolean)
      if (segments.length !== 2) reason = 'Relationship halves need review.'
      else base.relationshipWords = [segments[0], segments[1]]
      base.relationshipAcceptedAnswers = textArray(answer.accepted_answers)
      if (!base.relationshipAcceptedAnswers.length) base.relationshipAcceptedAnswers = [answerText(question.answer)].filter(Boolean)
      break
    }
    case 'rewrite':
      base.rewriteInstruction = text(content.instruction || fields.instructions)
      base.rewriteAcceptedAnswers = textArray(answer.accepted_answers)
      if (!base.rewriteAcceptedAnswers.length) base.rewriteAcceptedAnswers = [answerText(question.answer)].filter(Boolean)
      break
    case 'extended-writing': {
      const modelAnswer = answerText(question.answer)
      const rubricCriteria = textArray(answer.rubric)
      base.writingGuidance = {
        modelAnswer, rubricCriteria,
        manualOnly: !modelAnswer && rubricCriteria.length === 0,
      }
      break
    }
  }
  if (reason) return { status: 'review', reason }
  const validation = getFirstQuestionValidationError(validateQuestionInput(base))
  return validation ? { status: 'review', reason: validation }
    : { status: 'ready', input: normalizeQuestionInput(base) }
}
