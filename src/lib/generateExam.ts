import { TemplateHandler } from 'easy-template-x'
import {
  sampleQuestions,
  type ExamQuestion,
} from '../data/sampleQuestions'

const EXAM_TEMPLATE_PATH = '/templates/exam-template-v1.docx'
const ANSWER_KEY_TEMPLATE_PATH =
  '/templates/answer-key-template-v1.docx'

const EXAM_FILENAME = 'ExamGO-Unit1-Sample.docx'
const ANSWER_KEY_FILENAME = 'ExamGO-Unit1-Answer-Key.docx'
const MARKS_PER_QUESTION = 1

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

function buildExamData(questions: readonly ExamQuestion[]) {
  return {
    ExamTitle: 'First Monthly Test',
    SchoolName: 'MineGO Test School',
    Grade: '6',
    Instructions: 'Choose the correct answer.',
    SectionMarks: questions.length * MARKS_PER_QUESTION,

    Questions: questions.map((question, index) => ({
      Number: index + 1,
      Prompt: question.prompt,
      Marks: MARKS_PER_QUESTION,

      Options: question.options.map((option) => ({
        Label: option.label,
        Text: option.text,
      })),
    })),
  }
}

function buildAnswerKeyData(questions: readonly ExamQuestion[]) {
  return {
    ExamTitle: 'First Monthly Test',
    SchoolName: 'MineGO Test School',
    Grade: '6',

    Questions: questions.map((question, index) => ({
      Number: index + 1,
      Prompt: question.prompt,
      Answer: `${question.correctAnswer.label}. ${question.correctAnswer.text}`,
    })),
  }
}

export async function generateSampleDocuments(): Promise<void> {
  try {
    const selectedQuestions: readonly ExamQuestion[] = sampleQuestions

    const [examTemplate, answerKeyTemplate] = await Promise.all([
      loadTemplate(EXAM_TEMPLATE_PATH, 'Exam template'),
      loadTemplate(ANSWER_KEY_TEMPLATE_PATH, 'Answer-key template'),
    ])

    const [generatedExam, generatedAnswerKey] = await Promise.all([
      new TemplateHandler().process(
        examTemplate,
        buildExamData(selectedQuestions),
      ),
      new TemplateHandler().process(
        answerKeyTemplate,
        buildAnswerKeyData(selectedQuestions),
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