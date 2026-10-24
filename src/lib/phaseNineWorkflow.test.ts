import { describe, expect, it } from 'vitest'
import {
  MANUAL_MARKING_NOTE,
  type DomainQuestion,
} from '../domain/questionDomain'
import {
  assertPhaseNineStructure,
  buildPhaseNineAnswerKeyData,
  buildPhaseNineExamData,
  createPhaseNineReview,
  createPhaseNineSnapshot,
  parsePhaseNineSnapshot,
  replacePhaseNineQuestion,
  selectPhaseNineBranch,
  serializePhaseNineSnapshot,
  togglePhaseNineQuestionLock,
  validatePhaseNineStructure,
  type PhaseNineQuestion,
} from './phaseNineWorkflow'

import { SOURCE_STRUCTURE, SETTINGS } from './fixtures/phaseNineSource'

const oddQuestions = SOURCE_STRUCTURE.branches[1].items.map((item) => item.question)

describe('Phase 9 ministerial workflow', () => {
  it('validates Q3/A through Q5 as branches and counts marks once', () => {
    expect(validatePhaseNineStructure(SOURCE_STRUCTURE)).toEqual([])
    const snapshot = createPhaseNineSnapshot(SOURCE_STRUCTURE, 9172026)
    expect(snapshot.totalMarks).toBe(60)
    expect(snapshot.structure.branches.map((item) => item.id)).toEqual([
      'q3a',
      'q3b',
      'q4a',
      'q4b',
      'q5',
    ])
  })

  it('round-trips the exact structured snapshot without answer or ordering loss', () => {
    const snapshot = createPhaseNineSnapshot(SOURCE_STRUCTURE, 9172026)
    expect(parsePhaseNineSnapshot(serializePhaseNineSnapshot(snapshot))).toEqual(
      snapshot,
    )
  })

  it('builds source-faithful student branches without flattening alternatives', () => {
    const data = buildPhaseNineExamData(
      createPhaseNineSnapshot(SOURCE_STRUCTURE, 9172026),
      SETTINGS,
      'Note: Answer all the questions.',
    )
    expect(data.Branches.map((item) => item.Heading)).toEqual([
      'Q3 A)- Use the words in the box to complete the sentences.',
      'Q3 B)- B-Write the odd word. (5 only)',
      'Q4 A)- Fill the blanks with the missing words. (5 only).',
      'Q4 B)- Rewrite the sentence using capital letters and punctuation marks.',
      'Q5)- Writing (Choose either A or B)',
    ])
    expect(data.Branches[0].WordBank).toBe(
      '{planets,  grater,  prices,  mall,  denim}',
    )
    expect(data.Branches[0].Body).not.toContain('{planets')
    expect(data.Branches[2].Body).toBe([
      '1. doct, doctor ; wait, ..........\t4. g, gram ; m, ..........',
      '2. old, older ; nice, ..........\t5. October, in October ; Saturday, ..........',
      '3. start, started ; buy, ..........\t6. long × short ; cheap × ..........',
    ].join('\n'))
    expect(data.Branches[4]).toMatchObject({
      Marks: 20,
      AlternativeA: 'A- Write two notes to your brother and sister.',
      AlternativeB: 'B- Write an email to your friend.',
      AnswerSpace: '',
    })
    expect(data.Branches).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ Heading: expect.stringMatching(/^Q[1-9]\)- (Word bank|Odd word)/) }),
      ]),
    )
  })

  it('builds merge-ready answer rows with separate rules, marks, and totals', () => {
    const data = buildPhaseNineAnswerKeyData(
      createPhaseNineSnapshot(SOURCE_STRUCTURE, 9172026),
      SETTINGS,
    )
    const q5 = data.Answers.filter((row) => row.Q === '5')
    expect(q5).toEqual([
      {
        Q: '5',
        Part: '—',
        Rule: 'Choose A or B',
        Point: 'A',
        Answer: MANUAL_MARKING_NOTE,
        Mark: 20,
        Total: 20,
      },
      {
        Q: '5',
        Part: '—',
        Rule: 'Choose A or B',
        Point: 'B',
        Answer: MANUAL_MARKING_NOTE,
        Mark: 20,
        Total: 20,
      },
    ])
    const q3b = data.Answers.filter(
      (row) => row.Q === '3' && row.Part === 'B',
    )
    const q4a = data.Answers.filter(
      (row) => row.Q === '4' && row.Part === 'A',
    )
    expect(q3b).toHaveLength(6)
    expect(q4a).toHaveLength(6)
    expect(q3b[0]).toMatchObject({
      Q: '3',
      Part: 'B',
      Rule: 'Answer 5 of 6',
      Point: '1',
      Answer: 'saucepan',
      Mark: 2,
      Total: 10,
    })
    expect(q4a[0]).toMatchObject({
      Q: '4',
      Part: 'A',
      Rule: 'Answer 5 of 6',
      Point: '1',
      Answer: 'waiter',
      Mark: 2,
      Total: 10,
    })
    expect(data.Answers.map((row) => row.Answer).join(' ')).not.toContain(
      'Answer 5 only',
    )
  })

  it('rejects impossible attempt counts, double-counted alternatives, and unsupported shapes', () => {
    const invalid = structuredClone(SOURCE_STRUCTURE)
    invalid.branches[1].attemptCount = 7
    invalid.branches[4].items[1].question.marks = 10
    const messages = validatePhaseNineStructure(invalid).map(
      (issue) => issue.message,
    )
    expect(messages).toEqual(
      expect.arrayContaining([
        'Attempt count must be at least one and no greater than the displayed point count.',
        'Each writing alternative must carry the branch marks without double-counting them.',
      ]),
    )
    expect(() => assertPhaseNineStructure(invalid)).toThrow(
      'Invalid Phase 9 structure',
    )
  })

  it('selects deterministically and preserves review locks and duplicate prevention', () => {
    const selected = selectPhaseNineBranch(oddQuestions, {
      id: 'selected-odd',
      mainQuestionNumber: 3,
      branchLabel: 'B',
      kind: 'odd-word',
      instruction: 'B-Write the odd word. (5 only)',
      marks: 10,
      attemptCount: 5,
      layout: 'vertical',
      questionType: 'odd-word',
      questionCount: 6,
      visibleLabels: ['1', '2', '3', '4', '5', '6'],
    }, 44)
    const selectedAgain = selectPhaseNineBranch(oddQuestions, {
      id: 'selected-odd',
      mainQuestionNumber: 3,
      branchLabel: 'B',
      kind: 'odd-word',
      instruction: 'B-Write the odd word. (5 only)',
      marks: 10,
      attemptCount: 5,
      layout: 'vertical',
      questionType: 'odd-word',
      questionCount: 6,
      visibleLabels: ['1', '2', '3', '4', '5', '6'],
    }, 44)
    expect(selected.items.map((item) => item.question.id)).toEqual(
      selectedAgain.items.map((item) => item.question.id),
    )

    const snapshot = createPhaseNineSnapshot(SOURCE_STRUCTURE, 9172026)
    const review = togglePhaseNineQuestionLock(
      createPhaseNineReview(snapshot),
      oddQuestions[0].id,
    )
    expect(() =>
      replacePhaseNineQuestion(review, oddQuestions[0].id, oddQuestions),
    ).toThrow('Unlock this question')

    const replacement: PhaseNineQuestion = {
      ...(oddQuestions[0] as Extract<DomainQuestion, { type: 'odd-word' }>),
      id: 'aa3e4567-e89b-42d3-a456-426614174000',
      externalId: 'replacement-odd',
    }
    const unlocked = togglePhaseNineQuestionLock(review, oddQuestions[0].id)
    const replaced = replacePhaseNineQuestion(
      unlocked,
      oddQuestions[0].id,
      [...oddQuestions, replacement],
    )
    const ids = replaced.snapshot.structure.branches.flatMap((item) =>
      item.items.map((candidate) => candidate.question.id),
    )
    expect(ids).toContain(replacement.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
