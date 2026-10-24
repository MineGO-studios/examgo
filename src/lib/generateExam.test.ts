import { describe, expect, it } from 'vitest'
import type { ExamSettings } from '../types/exam'
import type { ExamQuestion } from '../types/question'
import {
  buildAnswerKeyData,
  buildExamData,
  createValidatedSimpleExamSnapshot,
  generateReviewedExamDocuments,
  prepareExamQuestions,
} from './generateExam'

const SETTINGS: ExamSettings = {
  schoolName: 'Test School',
  examTitle: 'Monthly Test',
  teacherName: 'Ms. Test',
  grade: 6,
  unit: 1,
  marksPerQuestion: 2,
  questionCount: 2,
  selectionSeed: 17,
}

const binaryQuestion: ExamQuestion = {
  id: 'binary-1', unit: 1, lesson: '1', type: 'binary', difficulty: 'easy',
  prompt: 'Baghdad is the capital of Iraq.', marks: 1,
  labelMode: 'true-false', isTrue: true,
}

const shortAnswerQuestion: ExamQuestion = {
  id: 'short-1', unit: 1, lesson: '1', type: 'short-answer', difficulty: 'hard',
  prompt: 'Name the capital of Iraq.', marks: 3, answerLines: 2,
  canonicalAnswer: 'Baghdad', approvedVariants: ['Baghdad city'], caseSensitive: false,
}

function makeQuestion(id: string, unit = 1): ExamQuestion {
  const correctAnswer = { label: 'B', text: 'Correct' }

  return {
    id,
    unit,
    lesson: '1',
    type: 'multiple-choice',
    difficulty: 'medium',
    prompt: `Question ${id}`,
    marks: 2,
    options: [
      { label: 'A', text: 'Incorrect' },
      correctAnswer,
    ],
    correctAnswer,
  }
}

describe('prepareExamQuestions', () => {
  it('prints embedded source choices once while retaining unrelated parenthetical text', () => {
    const question = { ...makeQuestion('embedded'), options: [
      { label: 'A', text: 'leave' }, { label: 'B', text: 'leaves' },
    ], correctAnswer: { label: 'B', text: 'leaves' } }
    for (const prompt of ['He (leave / leaves) home.', 'He (leave _ leaves) home.']) {
      expect(buildExamData([{ ...question, prompt }], SETTINGS).Questions[0].StudentLine).toBe(prompt)
    }
    expect(buildExamData([{ ...question, prompt: 'Choose the verb (present tense).' }], SETTINGS)
      .Questions[0].StudentLine).toBe('Choose the verb (present tense). ( leave / leaves )')
  })
  it('selects only from the approved questions supplied by the caller', () => {
    const approvedQuestions = [
      makeQuestion('database-1'),
      makeQuestion('database-2'),
      makeQuestion('database-3'),
      makeQuestion('other-unit', 2),
    ]

    const selected = prepareExamQuestions(
      SETTINGS,
      approvedQuestions,
    )

    expect(selected).toHaveLength(2)
    expect(
      selected.every((question) =>
        approvedQuestions.includes(question),
      ),
    ).toBe(true)
    expect(selected.every((question) => question.unit === 1)).toBe(
      true,
    )
  })

  it('rejects generation when the supplied bank has no eligible questions', () => {
    expect(() =>
      prepareExamQuestions(SETTINGS, [makeQuestion('unit-2', 2)]),
    ).toThrow('No approved questions are available for this test.')
  })

  it('applies lesson and difficulty controls to generation', () => {
    const approvedQuestions = [
      makeQuestion('lesson-1'),
      {
        ...makeQuestion('lesson-2'),
        lesson: '2',
        difficulty: 'hard' as const,
      },
    ]

    expect(
      prepareExamQuestions(
        { ...SETTINGS, questionCount: 1 },
        approvedQuestions,
        {
          questionType: 'multiple-choice',
          lesson: '2',
          difficulty: 'hard',
        },
      ).map((question) => question.id),
    ).toEqual(['lesson-2'])
  })

  it('selects deterministic mixed quantities without duplicate IDs', () => {
    const settings = {
      ...SETTINGS,
      questionCount: 3,
      questionQuantities: { 'multiple-choice': 1, binary: 1, 'short-answer': 1 },
    }
    const pool = [makeQuestion('mcq-1'), makeQuestion('mcq-2'), binaryQuestion, shortAnswerQuestion]
    const first = prepareExamQuestions(settings, pool)
    const second = prepareExamQuestions(settings, pool)
    expect(first.map((question) => question.id)).toEqual(second.map((question) => question.id))
    expect(first.map((question) => question.type)).toEqual(['multiple-choice', 'binary', 'short-answer'])
    expect(new Set(first.map((question) => question.id)).size).toBe(3)
  })
})

describe('validated simple snapshot rendering data', () => {
  const mcq = { ...makeQuestion('mcq-render'), marks: 2 }
  const questions = [mcq, binaryQuestion, shortAnswerQuestion]

  it('captures one exact ordered snapshot and total marks', () => {
    const snapshot = createValidatedSimpleExamSnapshot(SETTINGS, questions)
    expect(snapshot.questions.map((question) => question.id)).toEqual(['mcq-render', 'binary-1', 'short-1'])
    expect(snapshot.totalMarks).toBe(6)
    expect(snapshot.selectionSeed).toBe(17)
  })

  it('builds matching student and reference-answer entries from the same order', () => {
    const student = buildExamData(questions, SETTINGS)
    const key = buildAnswerKeyData(questions, SETTINGS)
    expect(student.SectionMarks).toBe(6)
    expect(student.TeacherName).toBe('Ms. Test')
    expect(key.TeacherName).toBe('Ms. Test')
    expect(student.Questions.map((question) => question.Number)).toEqual([1, 2, 3])
    expect(student.Questions[0].StudentLine).toBe('Question mcq-render ( Incorrect / Correct )')
    expect(student.Questions[1].StudentLine).toBe('Baghdad is the capital of Iraq. ( True / False )')
    expect(key.Answers.map((answer) => answer.Q)).toEqual(['Q1', 'Q2', 'Q3'])
    expect(key.Answers[1].Answer).toBe('True')
    expect(key.Answers[2].Answer).toBe('Baghdad / Baghdad city')
    expect(key.Answers.map((answer) => answer.Marks)).toEqual([2, 1, 3])
  })

  it('rejects duplicate snapshot identities', () => {
    expect(() => createValidatedSimpleExamSnapshot(SETTINGS, [mcq, { ...binaryQuestion, id: mcq.id }])).toThrow('duplicate question ID')
  })
})

describe('generateReviewedExamDocuments', () => {
  it('revalidates settings after questions are previewed', async () => {
    await expect(
      generateReviewedExamDocuments(
        { ...SETTINGS, schoolName: ' ' },
        [makeQuestion('Q-1')],
      ),
    ).rejects.toThrow('School name is required.')
  })
})
