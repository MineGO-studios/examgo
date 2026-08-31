import { TemplateHandler } from 'easy-template-x'
import { sampleQuestions } from '../data/sampleQuestions'

const TEMPLATE_PATH = '/templates/exam-template-v1.docx'
const OUTPUT_FILENAME = 'ExamGO-Unit1-Sample.docx'
const MARKS_PER_QUESTION = 1

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

export async function generateSampleExam(): Promise<void> {
  try {
    const response = await fetch(TEMPLATE_PATH)

    if (!response.ok) {
      throw new Error(
        `Template loading failed with status ${response.status}.`,
      )
    }

    const template = await response.blob()

    if (template.size === 0) {
      throw new Error('The DOCX template is empty.')
    }

    const templateData = {
      ExamTitle: 'First Monthly Test',
      SchoolName: 'MineGO Test School',
      Grade: '6',
      Instructions: 'Choose the correct answer.',
      SectionMarks: sampleQuestions.length * MARKS_PER_QUESTION,

      Questions: sampleQuestions.map((question, index) => ({
        Number: index + 1,
        Prompt: question.prompt,
        Marks: MARKS_PER_QUESTION,

        Options: question.options.map((option) => ({
          Label: option.label,
          Text: option.text,
        })),
      })),
    }

    const handler = new TemplateHandler()
    const generatedDocument = await handler.process(template, templateData)

    downloadBlob(OUTPUT_FILENAME, generatedDocument)
  } catch (error) {
    console.error('[ExamGO] DOCX generation failed:', error)

    if (error instanceof Error) {
      throw error
    }

    throw new Error('An unknown DOCX generation error occurred.')
  }
}