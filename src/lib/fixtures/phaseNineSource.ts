// Source-backed excerpt: Papers/representative/Exam paper_Constructed_1.docx.
// Raw approved input only; production code owns validation, projection and marks.
import { MANUAL_MARKING_NOTE } from '../../domain/questionDomain'
import type { ExamSettings } from '../../types/exam'
import {
  PHASE_NINE_STRUCTURE_VERSION,
  type PhaseNineBranch,
  type PhaseNineExamStructure,
  type PhaseNineQuestion,
} from '../phaseNineWorkflow'

const OWNER_ID = '223e4567-e89b-42d3-a456-426614174000'
const BANK_ID = '123e4567-e89b-42d3-a456-426614174000'

export const SETTINGS: ExamSettings = {
  schoolName: 'Anonymous',
  examTitle: 'First Trial',
  teacherName: 'Anonymous',
  grade: 6,
  unit: 1,
  marksPerQuestion: 2,
  questionCount: 15,
  selectionSeed: 9172026,
}

function common(
  id: string,
  type: PhaseNineQuestion['type'],
  prompt: string,
  marks: number,
) {
  return {
    id,
    ownerId: OWNER_ID,
    bankId: BANK_ID,
    externalId: id,
    unit: 1,
    lesson: 'representative',
    type,
    schemaVersion: 1 as const,
    difficulty: 'medium' as const,
    prompt,
    marks,
    isActive: true,
    revision: 1,
  }
}

const completion: PhaseNineQuestion = {
  ...common(
    '323e4567-e89b-42d3-a456-426614174000',
    'completion',
    'Use the words in the box to complete the sentences.',
    10,
  ),
  type: 'completion',
  content: {
    type: 'completion',
    schemaVersion: 1,
    text: [
      'We are shopping in the ..........',
      'Eight .......... go round the sun.',
      'Jeans are made of ..........',
      'The supermarket ad says food .......... are going down this week.',
      'You grate with a ..........',
    ].join('\n'),
    blankIds: ['blank-1', 'blank-2', 'blank-3', 'blank-4', 'blank-5'],
    wordBank: ['planets', 'grater', 'prices', 'mall', 'denim'],
    wordBankOrder: 'unordered',
    allowWordReuse: false,
    requireAllWordsUsed: true,
  },
  answer: {
    type: 'completion',
    schemaVersion: 1,
    answers: {
      'blank-1': 'mall',
      'blank-2': 'planets',
      'blank-3': 'denim',
      'blank-4': 'prices',
      'blank-5': 'grater',
    },
  },
}

const ODD_WORDS = [
  [['saucepan', 'knife', 'fork', 'spoon'], 'saucepan'],
  [['apple', 'orange', 'cher', 'potato'], 'potato'],
  [['face', 'hair', 'wash', 'hands'], 'wash'],
  [['aunt', 'boy', 'uncle', 'father'], 'boy'],
  [['metal', 'cotton', 'leather', 'jug'], 'jug'],
  [['bread', 'tomato', 'cucumber', 'onion'], 'bread'],
] as const

const oddQuestions: PhaseNineQuestion[] = ODD_WORDS.map(
  ([words, answer], index) => ({
    ...common(
      `4${index}3e4567-e89b-42d3-a456-426614174000`,
      'odd-word',
      words.join(' / '),
      2,
    ),
    type: 'odd-word',
    content: { type: 'odd-word', schemaVersion: 1, words: [...words] },
    answer: { type: 'odd-word', schemaVersion: 1, oddWord: answer },
  }),
)

const RELATIONSHIPS = [
  ['doct, doctor ; wait, ..........', ['doct', 'doctor'], 'waiter'],
  ['old, older ; nice, ..........', ['old', 'older'], 'nicer'],
  ['start, started ; buy, ..........', ['start', 'started'], 'bought'],
  ['g, gram ; m, ..........', ['g', 'gram'], 'metre'],
  ['October, in October ; Saturday, ..........', ['October', 'in October'], 'on Saturday'],
  ['long × short ; cheap × ..........', ['long', 'short'], 'expensive'],
] as const

const relationshipQuestions: PhaseNineQuestion[] = RELATIONSHIPS.map(
  ([prompt, words, answer], index) => ({
    ...common(
      `5${index}3e4567-e89b-42d3-a456-426614174000`,
      'word-relationship',
      prompt,
      2,
    ),
    type: 'word-relationship',
    content: {
      type: 'word-relationship',
      schemaVersion: 1,
      words: [...words],
    },
    answer: {
      type: 'word-relationship',
      schemaVersion: 1,
      acceptedAnswers: [answer],
    },
  }),
)

const rewrite: PhaseNineQuestion = {
  ...common(
    '723e4567-e89b-42d3-a456-426614174000',
    'rewrite',
    'are basim and hiba twins',
    10,
  ),
  type: 'rewrite',
  content: {
    type: 'rewrite',
    schemaVersion: 1,
    instruction:
      'Rewrite the sentence using capital letters and punctuation marks.',
  },
  answer: {
    type: 'rewrite',
    schemaVersion: 1,
    acceptedAnswers: ['Are Basim and Hiba twins ?'],
  },
}

function writing(
  id: string,
  prompt: string,
): PhaseNineQuestion {
  return {
    ...common(id, 'extended-writing', prompt, 20),
    type: 'extended-writing',
    content: { type: 'extended-writing', schemaVersion: 1 },
    answer: {
      type: 'extended-writing',
      schemaVersion: 1,
      manualMarkingNote: MANUAL_MARKING_NOTE,
    },
  }
}

const writingA = writing(
  '823e4567-e89b-42d3-a456-426614174000',
  'Write two notes to your brother and sister.',
)
const writingB = writing(
  '923e4567-e89b-42d3-a456-426614174000',
  'Write an email to your friend.',
)

function branch(
  overrides: Partial<PhaseNineBranch> &
    Pick<PhaseNineBranch, 'id' | 'kind' | 'mainQuestionNumber' | 'marks' | 'attemptCount' | 'items'>,
): PhaseNineBranch {
  return {
    branchLabel: null,
    instruction: 'Source instruction',
    arabicInstruction: '',
    layout: 'vertical',
    ...overrides,
  }
}

export const SOURCE_STRUCTURE: PhaseNineExamStructure = {
  schemaVersion: PHASE_NINE_STRUCTURE_VERSION,
  branches: [
    branch({
      id: 'q3a',
      mainQuestionNumber: 3,
      branchLabel: 'A',
      kind: 'completion',
      instruction: 'Use the words in the box to complete the sentences.',
      arabicInstruction: 'استخدم الكلمات بين الاقواس لاكمال الجمل',
      marks: 10,
      attemptCount: 5,
      items: [{ visibleLabel: '1–5', question: completion }],
    }),
    branch({
      id: 'q3b',
      mainQuestionNumber: 3,
      branchLabel: 'B',
      kind: 'odd-word',
      instruction: 'B-Write the odd word. (5 only)',
      arabicInstruction: 'اكتب الكلمة المختلفة. (خمس فقط)',
      marks: 10,
      attemptCount: 5,
      items: oddQuestions.map((question, index) => ({
        visibleLabel: String(index + 1),
        question,
      })),
    }),
    branch({
      id: 'q4a',
      mainQuestionNumber: 4,
      branchLabel: 'A',
      kind: 'word-relationship',
      instruction: 'Fill the blanks with the missing words. (5 only).',
      arabicInstruction: 'املأ الفراغات بالكلمات المفقودة. (خمس فقط)',
      marks: 10,
      attemptCount: 5,
      layout: 'source-two-column',
      items: relationshipQuestions.map((question, index) => ({
        visibleLabel: String(index + 1),
        question,
      })),
    }),
    branch({
      id: 'q4b',
      mainQuestionNumber: 4,
      branchLabel: 'B',
      kind: 'rewrite',
      instruction:
        'Rewrite the sentence using capital letters and punctuation marks.',
      arabicInstruction:
        'أعد كتابة الجملة الآتية باستخدام الحروف الكبيرة وعلامات التنقيط.',
      marks: 10,
      attemptCount: 1,
      items: [{ visibleLabel: 'Main', question: rewrite }],
    }),
    branch({
      id: 'q5',
      mainQuestionNumber: 5,
      kind: 'writing-alternatives',
      instruction: 'Writing (Choose either A or B)',
      arabicInstruction: 'اختر إما A أو B.',
      marks: 20,
      attemptCount: 1,
      layout: 'writing-alternatives',
      items: [
        {
          visibleLabel: 'A',
          question: writingA,
          arabicPrompt: 'اكتب ملاحظتين لأخيك وأختك',
        },
        {
          visibleLabel: 'B',
          question: writingB,
          arabicPrompt: 'اكتب إيميلاً إلى صديقك',
        },
      ],
    }),
  ],
}
