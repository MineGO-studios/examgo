import { readFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import { describe, expect, it, vi, afterEach } from 'vitest'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
afterEach(() => vi.unstubAllGlobals())
import type { ExamQuestion } from '../data/sampleQuestions'
import type { ExamSettings } from '../types/exam'
import { createExamDocumentBlobs } from './generateExam'
import { selectQuestions } from './selectQuestions'
import { validateExamSettings } from './validateExamSettings'

const QUESTION_COUNT = 50

function createSyntheticQuestions(): ExamQuestion[] {
  return Array.from({ length: QUESTION_COUNT }, (_, index) => {
    const questionNumber = index + 1
    const correctAnswer = {
      label: 'B',
      text: `Correct answer ${questionNumber}`,
    }

    return {
      id: `PERF-Q${String(questionNumber).padStart(3, '0')}`,
      unit: 1,
      lesson: String((index % 8) + 1),
      type: 'multiple-choice',
      difficulty: 'medium',
      prompt: `Performance test question ${questionNumber}?`,
      marks: 1,
      options: [
        { label: 'A', text: `Option A ${questionNumber}` },
        correctAnswer,
        { label: 'C', text: `Option C ${questionNumber}` },
      ],
      correctAnswer,
    }
  })
}

async function loadTemplate(
  relativePath: string,
): Promise<ArrayBuffer> {
  const bytes = await readFile(
    new URL(relativePath, import.meta.url),
  )

  return Uint8Array.from(bytes).buffer
}

describe('50-question document generation', () => {
  it(
    'generates both documents in under 10 seconds',
    async () => {
      const questions = createSyntheticQuestions()
      const settings: ExamSettings = {
        schoolName: 'MineGO Performance Test',
        examTitle: '50-Question Performance Test',
        grade: 6,
        unit: 1,
        marksPerQuestion: 1,
        questionCount: QUESTION_COUNT,
        selectionSeed: 1,
      }

      expect(
        validateExamSettings(settings, questions.length),
      ).toEqual({})

      const [examTemplate, answerKeyTemplate] =
        await Promise.all([
          loadTemplate(
            '../../public/templates/iraqi-mainstream-simple-types-exam-v2.docx',
          ),
          loadTemplate(
            '../../public/templates/iraqi-mainstream-simple-types-answer-key-v2.docx',
          ),
        ])

      vi.stubGlobal('DOMParser', DOMParser)
      vi.stubGlobal('XMLSerializer', XMLSerializer)
      const startedAt = performance.now()

      const selectedQuestions = selectQuestions(questions, {
        unit: settings.unit,
        type: 'multiple-choice',
        count: settings.questionCount,
        seed: settings.selectionSeed,
      })

      const { exam, answerKey } =
        await createExamDocumentBlobs(
          selectedQuestions,
          settings,
          examTemplate,
          answerKeyTemplate,
        )

      const durationMs = performance.now() - startedAt

      console.info(
        `[performance] Generated 50-question pair in ${durationMs.toFixed(2)} ms.`,
      )

      expect(selectedQuestions).toHaveLength(QUESTION_COUNT)
      expect(exam.byteLength).toBeGreaterThan(0)
      expect(answerKey.byteLength).toBeGreaterThan(0)
      expect(durationMs).toBeLessThan(10_000)
    },
    15_000,
  )
})
