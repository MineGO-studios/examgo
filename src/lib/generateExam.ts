import { TemplateHandler } from 'easy-template-x'
import {
  sampleQuestions,
  type ExamQuestion,
} from '../data/sampleQuestions'
import type { ExamSettings } from '../types/exam'
import {
  getFirstValidationError,
  validateExamSettings,
} from './validateExamSettings'
import { selectQuestions } from './selectQuestions'

const EXAM_TEMPLATE_PATH = '/templates/exam-template-v1.docx'
const ANSWER_KEY_TEMPLATE_PATH =
  '/templates/answer-key-template-v1.docx'

const EXAM_FILENAME = 'ExamGO-Unit1-Sample.docx'
const ANSWER_KEY_FILENAME = 'ExamGO-Unit1-Answer-Key.docx'

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

export async function generateExamDocuments(
  settings: ExamSettings,
): Promise<void> {
  try {
    const errors = validateExamSettings(
      settings,
      sampleQuestions.length,
    )
    const validationMessage = getFirstValidationError(errors)

    if (validationMessage) {
      throw new Error(validationMessage)
    }

    const selectedQuestions = selectQuestions(sampleQuestions, {
      unit: settings.unit,
      type: 'multiple-choice',
      count: settings.questionCount,
      seed: settings.selectionSeed,
    })

    const [examTemplate, answerKeyTemplate] =
      await Promise.all([
        loadTemplate(EXAM_TEMPLATE_PATH, 'Exam template'),
        loadTemplate(
          ANSWER_KEY_TEMPLATE_PATH,
          'Answer-key template',
        ),
      ])

    const [generatedExam, generatedAnswerKey] =
      await Promise.all([
        new TemplateHandler().process(
          examTemplate,
          buildExamData(selectedQuestions, settings),
        ),
        new TemplateHandler().process(
          answerKeyTemplate,
          buildAnswerKeyData(selectedQuestions, settings),
        ),
      ])

    downloadBlob(EXAM_FILENAME, generatedExam)
    downloadBlob(ANSWER_KEY_FILENAME, generatedAnswerKey)
  } catch (error) {
    console.error('[ExamGO] document generation failed:', error)

    if (error instanceof Error) {
      throw error
    }

    throw new Error('An unknown document-generation error occurred.')
  }
}
