export type QuestionOption = {
  label: string
  text: string
}

export type ExamQuestion = {
  id: string
  unit: number
  lesson: string
  type: 'multiple-choice'
  difficulty: 'easy' | 'medium' | 'hard'
  prompt: string
  options: QuestionOption[]
  correctAnswer: QuestionOption
}

export const sampleQuestions: ExamQuestion[] = [
  {
    id: 'U1-Q006',
    unit: 1,
    lesson: '2',
    type: 'multiple-choice',
    difficulty: 'easy',
    prompt: 'My uncle is ___ engineer.',
    options: [
      { label: 'A', text: 'a' },
      { label: 'B', text: 'an' },
      { label: 'C', text: 'the' },
    ],
    correctAnswer: { label: 'B', text: 'an' },
  },
  {
    id: 'U1-Q007',
    unit: 1,
    lesson: '1',
    type: 'multiple-choice',
    difficulty: 'easy',
    prompt: '___ cousins does Sara have?',
    options: [
      { label: 'A', text: 'How old' },
      { label: 'B', text: 'How many' },
      { label: 'C', text: 'What time' },
    ],
    correctAnswer: { label: 'B', text: 'How many' },
  },
  {
    id: 'U1-Q008',
    unit: 1,
    lesson: '3',
    type: 'multiple-choice',
    difficulty: 'easy',
    prompt: 'A doctor works ___ a hospital.',
    options: [
      { label: 'A', text: 'in' },
      { label: 'B', text: 'on' },
      { label: 'C', text: 'at' },
    ],
    correctAnswer: { label: 'A', text: 'in' },
  },
  {
    id: 'U1-Q009',
    unit: 1,
    lesson: '4',
    type: 'multiple-choice',
    difficulty: 'medium',
    prompt: 'Huda ___ home at 7:00.',
    options: [
      { label: 'A', text: 'leave' },
      { label: 'B', text: 'leaves' },
      { label: 'C', text: 'leaving' },
    ],
    correctAnswer: { label: 'B', text: 'leaves' },
  },
  {
    id: 'U1-Q010',
    unit: 1,
    lesson: '7',
    type: 'multiple-choice',
    difficulty: 'easy',
    prompt: 'My father is a teacher. ___ works at a school.',
    options: [
      { label: 'A', text: 'He' },
      { label: 'B', text: 'She' },
      { label: 'C', text: 'They' },
    ],
    correctAnswer: { label: 'A', text: 'He' },
  },
]