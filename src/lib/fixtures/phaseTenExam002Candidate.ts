// Candidate complete-paper structure from Papers/representative/Exam_002.docx
// and Answers_001.docx. Requires owner content approval before teacher-facing use.
import type { CompoundBranch, CompoundSnapshot } from '../../domain/compoundStructure'
import { MANUAL_MARKING_NOTE, type DomainQuestion } from '../../domain/questionDomain'
import { PHASE_TEN_Q1_Q2_EXCERPT } from './phaseTenQ1Q2'

const ownerId = PHASE_TEN_Q1_Q2_EXCERPT.ownerId
const bankId = PHASE_TEN_Q1_Q2_EXCERPT.bankId
const id = (n: number) => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`
const base = (n: number, prompt: string, marks: number) => ({ id: id(n), ownerId, bankId, externalId: `EXAM-002-${n}`,
  unit: 1, lesson: 'representative', difficulty: 'medium' as const, prompt, marks, isActive: true, revision: 1, schemaVersion: 1 as const })

function binary(n: number, prompt: string, answer: boolean, marks = 1): DomainQuestion {
  return { ...base(n, prompt, marks), type: 'binary', content: { type: 'binary', schemaVersion: 1, labelMode: 'true-false' },
    answer: { type: 'binary', schemaVersion: 1, isTrue: answer } }
}
function short(n: number, prompt: string, answer: string, marks = 1): DomainQuestion {
  return { ...base(n, prompt, marks), type: 'short-answer', content: { type: 'short-answer', schemaVersion: 1, answerLines: 1 },
    answer: { type: 'short-answer', schemaVersion: 1, canonicalAnswer: answer, approvedVariants: [] } }
}
function choice(n: number, prompt: string, options: [string, string], correct: 'A' | 'B', marks = 1): DomainQuestion {
  return { ...base(n, prompt, marks), type: 'multiple-choice',
    content: { type: 'multiple-choice', schemaVersion: 1, options: options.map((text, index) => ({ label: index ? 'B' : 'A', text })) },
    answer: { type: 'multiple-choice', schemaVersion: 1, correctOptionLabel: correct } }
}
function relationship(n: number, prompt: string, pair: [string, string], answer: string): DomainQuestion {
  return { ...base(n, prompt, 1), type: 'word-relationship',
    content: { type: 'word-relationship', schemaVersion: 1, words: pair },
    answer: { type: 'word-relationship', schemaVersion: 1, acceptedAnswers: [answer] } }
}
function writing(n: number, prompt: string, modelAnswer?: string): DomainQuestion {
  return { ...base(n, prompt, 10), type: 'extended-writing', content: { type: 'extended-writing', schemaVersion: 1 },
    answer: { type: 'extended-writing', schemaVersion: 1, ...(modelAnswer ? { modelAnswer } : { manualMarkingNote: MANUAL_MARKING_NOTE }) } }
}
function items(questions: DomainQuestion[], labels?: string[]) {
  return questions.map((question, index) => ({ label: labels?.[index] ?? String(index + 1), question }))
}
function branch(idValue: string, main: number, label: 'A' | 'B' | null, kind: CompoundBranch['kind'], instruction: string,
  arabicInstruction: string, marks: number, attemptCount: number, questions: DomainQuestion[], labels?: string[]): CompoundBranch {
  return { id: idValue, mainQuestionNumber: main, branchLabel: label, kind, instruction, arabicInstruction,
    marks, attemptCount, items: items(questions, labels) }
}

const q1b = [
  binary(20, 'The first paper was made in China.', false),
  short(21, 'Why it’s called a mouse?', 'Because it looks like a real mouse'),
  binary(22, 'Only three thing are made of paper.', false),
  binary(23, "Dad doesn't want to buy a laptop.", false),
  choice(24, 'How many buttons in a mouse?', ['Two buttons', 'Three buttons'], 'A'),
  choice(25, 'What time does the breakfast service start?', ['6:00', '6:30'], 'B'),
]
const q2a = [
  choice(30, '( this – these ) is very nice. It’s the new fashion.', ['this', 'these'], 'A', 2),
  choice(31, 'It’s so hot and he ( feel – feels ) sick.', ['feel', 'feels'], 'B', 2),
  choice(32, 'Rubber ( come from – comes from ) Rubber tree.', ['come from', 'comes from'], 'B', 2),
  choice(33, "I have a brother, ( and – but ) I don't have a sister.", ['and', 'but'], 'B', 2),
  choice(34, 'There is a ( small blue wood – blue wood small ) desk.', ['small blue wood', 'blue wood small'], 'A', 2),
  choice(35, 'I want to ( help – helping ) people when they are ill.', ['help', 'helping'], 'A', 2),
]
const q3a: DomainQuestion = { ...base(40, 'Match family members', 5), type: 'matching',
  content: { type: 'matching', schemaVersion: 1,
    left: ['father', 'brother', 'cousin', 'uncle', 'grandpa'].map((text, index) => ({ id: `l${index + 1}`, text })),
    right: ['sister', 'cousin', 'grandma', 'mother', 'aunt'].map((text, index) => ({ id: `r${index + 1}`, text })) },
  answer: { type: 'matching', schemaVersion: 1, pairs: [
    { leftId: 'l1', rightId: 'r4' }, { leftId: 'l2', rightId: 'r1' }, { leftId: 'l3', rightId: 'r2' },
    { leftId: 'l4', rightId: 'r5' }, { leftId: 'l5', rightId: 'r3' },
  ] } }
const q4a: DomainQuestion = { ...base(50, 'what do basim and hiba do on monday', 5), type: 'rewrite',
  content: { type: 'rewrite', schemaVersion: 1, instruction: 'Rewrite the sentence using capital letters and punctuation marks.' },
  answer: { type: 'rewrite', schemaVersion: 1, acceptedAnswers: ['What do Basim and Hiba do on Monday?'] } }
const q4b = [
  relationship(60, 'teach,  teacher ; engine, ______', ['teach', 'teacher'], 'Engineer'),
  relationship(61, 'book, books ; foot, ______', ['book', 'books'], 'Feet'),
  relationship(62, 'she is, she’s ; I am, ______', ['she is', 'she’s'], 'I’m'),
  relationship(63, 'easy, hard ;  interesting, ______', ['easy', 'hard'], 'Boring'),
  relationship(64, 'play, playing ; run, ______', ['play', 'playing'], 'Running'),
  relationship(65, 'cghou, cough ; arsh, ______', ['cghou', 'cough'], 'Rash'),
]
const q5 = [
  writing(70, 'Write about your self and family.', "My name is Sajad and I'm Iraqi I am 12. I live with my family in Babylon. I have two sisters and a brother. My dad is a teacher My mum is a nurse. When I grow up, I want to be a doctor because I love this job."),
  writing(71, 'Write an email to a friend.'),
]

export const EXAM_002_PROFILE_ID = 'exam-002-structural-v1-candidate'

export function makeExam002Candidate(q3bSixthAnswer: string, historicalWording = false): CompoundSnapshot {
  if (q3bSixthAnswer.trim().toLocaleLowerCase() !== 'tissue') throw new Error('The missing Q3/B source answer needs an explicit owner decision.')
  const q3b: DomainQuestion = { ...base(41, 'Choose the correct word between the brackets. (5 only)', 5),
    type: 'completion', content: { type: 'completion', schemaVersion: 1,
      text: [
        'You ______ keep your password safe.', '______ comes  from  a tree',
        'My dad woks in hospital, He is ______', 'I have ______, You should go to dentist.',
        'You have a headache, You should ______ a tablet', 'You should use a ______ when you sneeze',
      ].join('\n'),
      blankIds: ['blank-1', 'blank-2', 'blank-3', 'blank-4', 'blank-5', 'blank-6'],
      wordBank: ['Doctor', 'wood', 'toothache', 'take', 'must', 'tissue'],
      wordBankOrder: 'unordered', allowWordReuse: false, requireAllWordsUsed: true },
    answer: { type: 'completion', schemaVersion: 1,
      answers: { 'blank-1': 'must', 'blank-2': 'wood', 'blank-3': 'Doctor',
        'blank-4': 'toothache', 'blank-5': 'take', 'blank-6': q3bSixthAnswer.trim() } } }
  const q1a = structuredClone(PHASE_TEN_Q1_Q2_EXCERPT.branches[0])
  const q2b = structuredClone(PHASE_TEN_Q1_Q2_EXCERPT.branches[1])
  const q3aQuestion = historicalWording
    ? { ...q3a, prompt: 'Match Similar words' }
    : q3a
  const q4aQuestion = historicalWording
    ? { ...q4a, prompt: 'what do basim ang hiba do on monday' }
    : q4a
  return { schemaVersion: 1, ownerId, bankId, selectionSeed: 8162026, totalMarks: 60, branches: [
    q1a,
    branch('q1b', 1, 'B', 'questions', 'Choose the correct answer (5 only)', 'أختر الكلمة الصحيحة من بين الاقواس ( 5 فقط )', 5, 5, q1b),
    branch('q2a', 2, 'A', 'questions', 'Choose correct word between brackets (5 only)', 'أختر الكلمة الصحيحة من بين الاقواس ( 5 فقط )', 10, 5, q2a),
    q2b,
    branch('q3a', 3, 'A', 'matching', historicalWording ? 'Match Similar words' : 'Match family members', 'طابق الكلمات', 5, 5, [q3aQuestion], ['Main']),
    branch('q3b', 3, 'B', 'completion', 'Choose the correct word between the brackets. (5 only)', 'أختر الكلمات المناسبة لإكمال الجمل الاتية (5 فقط)', 5, 5, [q3b], ['1–6']),
    branch('q4a', 4, 'A', 'questions', 'Rewrite the sentence using capital letters and punctuation marks.', 'أعد كتابة الجملة الاتية باستخدام الحروف الكبيرة وعلامات التنقيط', 5, 1, [q4aQuestion], ['Main']),
    branch('q4b', 4, 'B', 'questions', 'Fill the blanks with the missing words. (5 only)', 'أملا الفراغات بالكلمات المفقودة ( 5 فقط )', 5, 5, q4b),
    branch('q5', 5, null, 'alternatives', 'Writing (Choose either A or B)', 'أختر أما A أو B', 10, 1, q5, ['A', 'B']),
  ] }
}
