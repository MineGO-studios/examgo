import { preparePaperTemplate } from './paperTemplateFormat'
import type { ExamQuestion } from '../types/question'
import { hasPrintedChoiceOptions } from './printedChoiceOptions'
import {
  DEFAULT_EXAM_QUESTION_FILTERS,
  getQuestionQuantities,
  SIMPLE_QUESTION_TYPES,
  type ExamQuestionFilters,
  type ExamSettings,
} from '../types/exam'
import {
  getFirstValidationError,
  validateExamSettings,
} from './validateExamSettings'
import { getSafeErrorDetails } from './safeErrorDetails'
import { validateDocumentText } from './documentText'
import { selectMixedQuestions } from './selectQuestions'
import {
  downloadExamDocumentPair,
  prepareExamDocumentPair,
  type PairedDownloadResult,
  type PreparedExamDocumentPair,
} from './documentDelivery'

const EXAM_TEMPLATE_PATH =
  '/templates/iraqi-mainstream-simple-types-exam-v2.docx'
const ANSWER_KEY_TEMPLATE_PATH =
  '/templates/iraqi-mainstream-simple-types-answer-key-v2.docx'

export type ValidatedSimpleExamSnapshot = {
  selectionSeed: number
  totalMarks: number
  settings: ExamSettings
  questions: readonly ExamQuestion[]
}

export function createValidatedSimpleExamSnapshot(
  settings: ExamSettings,
  questions: readonly ExamQuestion[],
): ValidatedSimpleExamSnapshot {
  if (questions.length < 1) throw new Error('A generated snapshot must contain at least one question.')
  const ids = new Set<string>()
  let totalMarks = 0
  for (const question of questions) {
    if (!question.id || ids.has(question.id)) throw new Error(`Generated snapshot contains duplicate question ID: ${question.id || '(missing)'}.`)
    ids.add(question.id)
    const marks = question.marks
    if (!Number.isSafeInteger(marks) || marks < 1 || marks > 1000) throw new Error(`Question ${question.id} has invalid marks.`)
    totalMarks += marks
    if (question.type === 'multiple-choice' && !question.options.some((option) => option.label === question.correctAnswer.label && option.text === question.correctAnswer.text)) throw new Error(`Question ${question.id} has an invalid multiple-choice answer.`)
    if (question.type === 'short-answer' && !question.canonicalAnswer.trim()) throw new Error(`Question ${question.id} has no reference answer.`)
  }
  if (totalMarks > 1000) throw new Error('The exam total cannot exceed 1000 marks.')
  return {
    selectionSeed: settings.selectionSeed,
    totalMarks,
    settings: structuredClone(settings),
    questions: structuredClone(questions),
  }
}

async function loadTemplate(
  path: string,
  templateName: string,
): Promise<Blob> {
  const response = await fetch(path)

  if (!response.ok) {
    throw new Error(
      `${templateName} loading failed with status ${response.status}.`,
    )
  }

  const template = await response.blob()

  if (template.size === 0) {
    throw new Error(`${templateName} is empty.`)
  }

  return template
}

function getQuestionHeading(question: ExamQuestion, number: number): string {
  switch (question.type) {
    case 'multiple-choice':
      return `Q${number})- Choose the correct answer between brackets.`
    case 'binary':
      return question.labelMode === 'yes-no'
        ? `Q${number})- Answer the following with (Yes) or (No).`
        : `Q${number})- Answer the following with (True) or (False).`
    case 'short-answer':
      return `Q${number})- Answer the following question.`
  }
}

function getStudentLine(question: ExamQuestion): string {
  switch (question.type) {
    case 'multiple-choice':
      return hasPrintedChoiceOptions(question.prompt, question.options) ? question.prompt
        : `${question.prompt} ( ${question.options.map((option) => option.text).join(' / ')} )`
    case 'binary': {
      const labels = question.labelMode === 'yes-no' ? ['Yes', 'No'] : ['True', 'False']
      return `${question.prompt} ( ${labels.join(' / ')} )`
    }
    case 'short-answer':
      return question.prompt
  }
}

function getReferenceAnswer(question: ExamQuestion): string {
  switch (question.type) {
    case 'multiple-choice':
      return `${question.correctAnswer.label}. ${question.correctAnswer.text}`
    case 'binary':
      return question.labelMode === 'yes-no'
        ? question.isTrue ? 'Yes' : 'No'
        : question.isTrue ? 'True' : 'False'
    case 'short-answer': {
      const answers = [question.canonicalAnswer, ...question.approvedVariants]
      return answers.join(' / ')
    }
  }
}

function getTeacherFooter(settings: ExamSettings): string {
  return settings.teacherName?.trim() || '____________________'
}

export function buildExamData(
  questions: readonly ExamQuestion[],
  settings: ExamSettings,
) {
  return {
    ExamTitle: settings.examTitle.trim(),
    SchoolName: settings.schoolName.trim(),
    Grade: String(settings.grade),
    TeacherName: getTeacherFooter(settings),
    Instructions: 'Answer all questions.',
    SectionMarks: questions.reduce((total, question) => total + question.marks, 0),

    Questions: questions.map((question, index) => ({
      Number: index + 1,
      Heading: getQuestionHeading(question, index + 1),
      StudentLine: getStudentLine(question),
      Marks: question.marks,
      AnswerSpace: question.type === 'short-answer'
        ? Array.from({ length: question.answerLines }, () => '________________________________________________').join('\n')
        : '',
    })),
  }
}

export function buildAnswerKeyData(
  questions: readonly ExamQuestion[],
  settings: ExamSettings,
) {
  return {
    ExamTitle: settings.examTitle.trim(),
    SchoolName: settings.schoolName.trim(),
    Grade: String(settings.grade),
    TeacherName: getTeacherFooter(settings),

    Answers: questions.map((question, index) => ({
      Q: `Q${index + 1}`,
      Point: 1,
      Answer: getReferenceAnswer(question),
      Marks: question.marks,
    })),
  }
}

type TemplateBinary = Blob | ArrayBuffer

export async function createExamDocumentBlobs<
  T extends TemplateBinary,
>(
  questions: readonly ExamQuestion[],
  settings: ExamSettings,
  examTemplate: T,
  answerKeyTemplate: T,
): Promise<{ exam: T; answerKey: T }> {
  const snapshot = createValidatedSimpleExamSnapshot(settings, questions)
  const examData = buildExamData(snapshot.questions, snapshot.settings)
  const keyData = buildAnswerKeyData(snapshot.questions, snapshot.settings)
  validateDocumentText(examData)
  validateDocumentText(keyData)
  const { TemplateHandler } = await import('easy-template-x')
  const [exam, answerKey] = await Promise.all([
    new TemplateHandler().process(
      await preparePaperTemplate(examTemplate, 'student'),
      examData,
    ),
    new TemplateHandler().process(
      await preparePaperTemplate(answerKeyTemplate, 'key'),
      keyData,
    ),
  ])

  return { exam, answerKey }
}

export function prepareExamQuestions(
  settings: ExamSettings,
  questions: readonly ExamQuestion[],
  filters: ExamQuestionFilters = DEFAULT_EXAM_QUESTION_FILTERS,
): ExamQuestion[] {
  const quantities = getQuestionQuantities(settings)
  const filteredQuestions = questions.filter(
    (question) => question.unit === settings.unit && (!filters.lesson || question.lesson === filters.lesson) && (!filters.difficulty || question.difficulty === filters.difficulty),
  )
  const requestedCount = SIMPLE_QUESTION_TYPES.reduce((total, type) => total + quantities[type], 0)
  const errors = validateExamSettings(
    { ...settings, questionCount: requestedCount },
    filteredQuestions.length,
  )
  const validationMessage = getFirstValidationError(errors)

  if (validationMessage) {
    throw new Error(validationMessage)
  }

  for (const type of SIMPLE_QUESTION_TYPES) {
    const count = quantities[type]
    if (!Number.isSafeInteger(count) || count < 0) throw new Error(`${type} quantity must be a non-negative whole number.`)
    const available = filteredQuestions.filter((question) => question.type === type).length
    if (count > available) throw new Error(`Only ${available} eligible ${type} questions are available, but ${count} were requested.`)
  }

  return selectMixedQuestions(questions, SIMPLE_QUESTION_TYPES.map((type) => ({
    unit: settings.unit,
    type,
    lesson: filters.lesson || undefined,
    difficulty: filters.difficulty || undefined,
    count: quantities[type],
    seed: settings.selectionSeed,
  })))
}

export async function generateExamDocuments(
  settings: ExamSettings,
  questions: readonly ExamQuestion[],
  filters: ExamQuestionFilters = DEFAULT_EXAM_QUESTION_FILTERS,
): Promise<void> {
  try {
    const selectedQuestions = prepareExamQuestions(
      settings,
      questions,
      filters,
    )

    await generateReviewedExamDocuments(settings, selectedQuestions)
  } catch (error) {
    console.error(
      '[ExamGO] document generation failed:',
      getSafeErrorDetails(error),
    )

    if (error instanceof Error) {
      throw error
    }

    throw new Error('An unknown document-generation error occurred.')
  }
}

export async function generateReviewedExamDocuments(
  settings: ExamSettings,
  selectedQuestions: readonly ExamQuestion[],
): Promise<{
  documents: PreparedExamDocumentPair
  delivery: PairedDownloadResult
}> {
  const documents = await prepareReviewedExamDocuments(settings, selectedQuestions)
  const delivery = await downloadExamDocumentPair(documents)
  return { documents, delivery }
}

/** Prepare one validated pair so persisted workflows can offer explicit downloads. */
export async function prepareReviewedExamDocuments(
  settings: ExamSettings,
  selectedQuestions: readonly ExamQuestion[],
): Promise<PreparedExamDocumentPair> {
  const validationMessage = getFirstValidationError(
    validateExamSettings({ ...settings, questionCount: selectedQuestions.length }, selectedQuestions.length),
  )

  if (validationMessage) {
    throw new Error(validationMessage)
  }

  const [examTemplate, answerKeyTemplate] = await Promise.all([
    loadTemplate(EXAM_TEMPLATE_PATH, 'Exam template'),
    loadTemplate(ANSWER_KEY_TEMPLATE_PATH, 'Answer-key template'),
  ])

  const { exam: generatedExam, answerKey: generatedAnswerKey } =
    await createExamDocumentBlobs(
      selectedQuestions,
      settings,
      examTemplate,
      answerKeyTemplate,
    )

  return prepareExamDocumentPair(
    settings.unit,
    generatedExam,
    generatedAnswerKey,
  )
}
