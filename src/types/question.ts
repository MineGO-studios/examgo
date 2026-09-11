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
