// Approved source excerpt: Papers/representative/Exam_002.docx.
// Answer table authority: Papers/representative/Answers_001.docx.
// These are input questions, not a second renderer/projection implementation.
import type { ExamSettings } from '../../types/exam'
import type { ExamQuestion } from '../../types/question'

export const SIMPLE_SETTINGS: ExamSettings = {
  examTitle: 'Mid-Year (2025-2024)',
  schoolName: 'Anonymous',
  teacherName: 'Anonymous',
  grade: 6,
  unit: 1,
  marksPerQuestion: 1,
  questionCount: 3,
  selectionSeed: 8162026,
}

export const SIMPLE_SOURCE_QUESTIONS: ExamQuestion[] = [
  {
    id: 'representative-mcq-1', unit: 1, lesson: 'representative',
    type: 'multiple-choice', difficulty: 'medium', marks: 1,
    prompt: 'How many buttons in a mouse?',
    options: [
      { label: 'A', text: 'Two buttons' },
      { label: 'B', text: 'Three buttons' },
    ],
    correctAnswer: { label: 'A', text: 'Two buttons' },
  },
  {
    id: 'representative-binary-1', unit: 1, lesson: 'representative',
    type: 'binary', difficulty: 'medium', marks: 1,
    prompt: 'The first paper was made in China.',
    labelMode: 'true-false', isTrue: false,
  },
  {
    id: 'representative-short-1', unit: 1, lesson: 'representative',
    type: 'short-answer', difficulty: 'medium', marks: 1,
    prompt: "Where does Wisam's father work?",
    canonicalAnswer: 'An office', approvedVariants: [],
    answerLines: 1, caseSensitive: false,
  },
]
