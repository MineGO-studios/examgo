// Structural excerpt: Papers/representative/Exam_002.docx and Answers_001.docx.
// Q1/A wording is corrected per owner instruction; the source prints True/False
// even though its six items and the paired key are short answers.
import type { CompoundSnapshot } from '../../domain/compoundStructure'
import type { DomainQuestion } from '../../domain/questionDomain'

const ownerId = '22222222-2222-4222-8222-222222222222'
const bankId = '33333333-3333-4333-8333-333333333333'
const id = (n: number) => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`
const passage = 'Hello, my name is Wisam. My mum is a nurse and my dad work in an office. He’s an IT programmer. He makes programs about buildings. My sister, Dania and I go to school by bus. We leave home at 7:30. My dad works five days a week, but my mum only works three days a week. When she is not working in the hospital. She is a housewife at home. She has two jobs.'
const prompts = [
  'Where does Wisam’s father work?', 'Who is a nurse?', 'What time does Dania leave home?',
  'How many days a week does Wisam’s mother work?', 'How many days a week does Wisam’s father work?',
  'Where does Wisam’s mother work?',
]
const answers = ['An office', 'Wisam’s mother', 'She leaves home at 7:30', 'Three days', 'Five days', 'She works in the hospital']
const children: Extract<DomainQuestion, { type: 'short-answer' }>[] = prompts.map((prompt, index) => ({
  id: id(index + 1), ownerId, bankId, externalId: `Q1-A-${index + 1}`,
  unit: 1, lesson: 'representative', difficulty: 'medium', prompt,
  type: 'short-answer', schemaVersion: 1, content: { type: 'short-answer', schemaVersion: 1, answerLines: 1 },
  answer: { type: 'short-answer', schemaVersion: 1, canonicalAnswer: answers[index], approvedVariants: [] },
  marks: 1, isActive: true, revision: 1,
}))

const matching: Extract<DomainQuestion, { type: 'matching' }> = {
  id: id(7), ownerId, bankId, externalId: 'Q2-B', unit: 1, lesson: 'representative',
  difficulty: 'medium', prompt: 'Match the question in list ( A ) with their answer in list  ( B )',
  marks: 10, isActive: true, revision: 1, type: 'matching', schemaVersion: 1,
  content: { type: 'matching', schemaVersion: 1,
    left: [
      { id: 'l1', text: 'Can I help you?' }, { id: 'l2', text: "What's the matter?" },
      { id: 'l3', text: "What's your dad job?" }, { id: 'l4', text: 'My leg is broken?' },
      { id: 'l5', text: 'Where’s the watches shop?' },
    ],
    right: [
      { id: 'r1', text: 'I have a headache' }, { id: 'r2', text: "Yes, please. I'm looking for dress" },
      { id: 'r3', text: "It's on the first floor" }, { id: 'r4', text: 'My dad is a teacher' },
      { id: 'r5', text: 'You shouldn’t stand on it.' },
    ] },
  answer: { type: 'matching', schemaVersion: 1, pairs: [
    { leftId: 'l1', rightId: 'r2' }, { leftId: 'l2', rightId: 'r1' },
    { leftId: 'l3', rightId: 'r4' }, { leftId: 'l4', rightId: 'r5' },
    { leftId: 'l5', rightId: 'r3' },
  ] },
}

const instruction = 'Read the passage and answer the questions. (5 only)'
const group = {
  id: '44444444-4444-4444-8444-444444444444', ownerId, bankId, revision: 1, schemaVersion: 1 as const,
  title: 'Wisam', instruction, arabicInstruction: 'اقرأ القطعة الآتية بعناية ثم أجب عن الأسئلة. (خمسة فقط)',
  passage, attemptCount: 5, expectedMarks: 5,
  children: children.map((question, index) => ({ position: index + 1, question })),
}

export const PHASE_TEN_Q1_Q2_EXCERPT: CompoundSnapshot = {
  schemaVersion: 1, ownerId, bankId, selectionSeed: 8162026, totalMarks: 15,
  branches: [
    { id: 'q1a', mainQuestionNumber: 1, branchLabel: 'A', kind: 'passage', instruction,
      arabicInstruction: group.arabicInstruction, marks: 5, attemptCount: 5, passageGroup: group,
      items: children.map((question, index) => ({ label: String(index + 1), question })) },
    { id: 'q2b', mainQuestionNumber: 2, branchLabel: 'B', kind: 'matching',
      instruction: matching.prompt, arabicInstruction: 'طابق الجمل', marks: 10, attemptCount: 5,
      items: [{ label: 'Main', question: matching }] },
  ],
}
