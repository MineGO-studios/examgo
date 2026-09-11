import { TemplateHandler } from 'easy-template-x'
import type { ExamQuestion } from '../types/question'
import type { ExamSettings } from '../types/exam'
import {
  getFirstValidationError,
  validateExamSettings,
} from './validateExamSettings'
import { selectQuestions } from './selectQuestions'

const EXAM_TEMPLATE_PATH =
  '/templates/iraqi-mainstream-exam-v1.docx'
const ANSWER_KEY_TEMPLATE_PATH =
  '/templates/iraqi-mainstream-answer-key-v1.docx'

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

function downloadBlob(filename: string, blob: Blob): void {
  const downloadUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = downloadUrl
  link.download = filename
  link.style.display = 'none'

  document.body.appendChild(link)
  link.click()

  window.setTimeout(() => {
    link.remove()
    URL.revokeObjectURL(downloadUrl)
  }, 0)
}

function buildExamData(
  questions: readonly ExamQuestion[],
  settings: ExamSettings,
) {
  return {
    ExamTitle: settings.examTitle.trim(),
    SchoolName: settings.schoolName.trim(),
    Grade: String(settings.grade),
    Instructions: 'Choose the correct answer.',
    SectionMarks:
      questions.length * settings.marksPerQuestion,

    Questions: questions.map((question, index) => ({
      Number: index + 1,
      Prompt: question.prompt,
      Marks: settings.marksPerQuestion,

      Options: question.options.map((option) => ({
        Label: option.label,
        Text: option.text,
      })),
    })),
  }
}

function buildAnswerKeyData(
  questions: readonly ExamQuestion[],
  settings: ExamSettings,
) {
  return {
    ExamTitle: settings.examTitle.trim(),
    SchoolName: settings.schoolName.trim(),
    Grade: String(settings.grade),

    Questions: questions.map((question, index) => ({
      Number: index + 1,
      Prompt: question.prompt,
      Answer:
        `${question.correctAnswer.label}. ` +
        question.correctAnswer.text,
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
  const [exam, answerKey] = await Promise.all([
    new TemplateHandler().process(
      examTemplate,
      buildExamData(questions, settings),
    ),
    new TemplateHandler().process(
      answerKeyTemplate,
      buildAnswerKeyData(questions, settings),
    ),
  ])

  return { exam, answerKey }
}

export function prepareExamQuestions(
  settings: ExamSettings,
  questions: readonly ExamQuestion[],
): ExamQuestion[] {
  const eligibleQuestionCount = questions.filter(
    (question) =>
      question.unit === settings.unit &&
      question.type === 'multiple-choice',
  ).length
  const errors = validateExamSettings(
    settings,
    eligibleQuestionCount,
  )
  const validationMessage = getFirstValidationError(errors)

  if (validationMessage) {
    throw new Error(validationMessage)
  }

  return selectQuestions(questions, {
    unit: settings.unit,
    type: 'multiple-choice',
    count: settings.questionCount,
    seed: settings.selectionSeed,
  })
}

export async function generateExamDocuments(
  settings: ExamSettings,
  questions: readonly ExamQuestion[],
): Promise<void> {
  try {
    const selectedQuestions = prepareExamQuestions(
      settings,
      questions,
    )

    const [examTemplate, answerKeyTemplate] =
      await Promise.all([
        loadTemplate(EXAM_TEMPLATE_PATH, 'Exam template'),
        loadTemplate(
          ANSWER_KEY_TEMPLATE_PATH,
          'Answer-key template',
        ),
      ])

    const { exam: generatedExam, answerKey: generatedAnswerKey } =
      await createExamDocumentBlobs(
        selectedQuestions,
        settings,
        examTemplate,
        answerKeyTemplate,
      )

    downloadBlob(
      `ExamGO-Unit${settings.unit}-Exam.docx`,
      generatedExam,
    )
    downloadBlob(
      `ExamGO-Unit${settings.unit}-Answer-Key.docx`,
      generatedAnswerKey,
    )
  } catch (error) {
    console.error('[ExamGO] document generation failed:', error)

    if (error instanceof Error) {
      throw error
    }

    throw new Error('An unknown document-generation error occurred.')
  }
}
