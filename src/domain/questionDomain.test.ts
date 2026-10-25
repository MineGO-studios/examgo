import { describe, expect, it } from 'vitest'
import type { Tables } from '../types/database'
import {
  MANUAL_MARKING_NOTE,
  QUESTION_SCHEMA_VERSION,
  domainQuestionToLegacyExamQuestion,
  domainQuestionToPersistenceInsert,
  domainQuestionToRendererInput,
  domainQuestionToSelectionInput,
  questionRowToDomain,
  validateDomainQuestion,
  validateExamSnapshot,
  validateQuestionGraph,
  type DomainQuestion,
  type ExamSnapshot,
  type QuestionGroup,
} from './questionDomain'

const OWNER_ID = '123e4567-e89b-42d3-a456-426614174000'
const BANK_ID = '223e4567-e89b-42d3-a456-426614174000'
const QUESTION_ID = '323e4567-e89b-42d3-a456-426614174000'
const MULTIPLE_CHOICE_OPTIONS = [
  { label: 'A', text: 'Wrong' },
  { label: 'B', text: 'Correct' },
]

function question(
  payload: Pick<
    DomainQuestion,
    'type' | 'content' | 'answer'
  >,
): DomainQuestion {
  return {
    id: QUESTION_ID,
    ownerId: OWNER_ID,
    bankId: BANK_ID,
    externalId: `phase6-${payload.type}`,
    unit: 1,
    lesson: '1',
    schemaVersion: QUESTION_SCHEMA_VERSION,
    difficulty: 'medium',
    prompt: `Valid ${payload.type} question`,
    marks: 2,
    isActive: true,
    revision: 1,
    ...payload,
  } as DomainQuestion
}

const MULTIPLE_CHOICE = question({
  type: 'multiple-choice',
  content: {
    type: 'multiple-choice',
    schemaVersion: 1,
    options: MULTIPLE_CHOICE_OPTIONS,
  },
  answer: {
    type: 'multiple-choice',
    schemaVersion: 1,
    correctOptionLabel: 'B',
  },
})

const VALID_QUESTIONS: DomainQuestion[] = [
  MULTIPLE_CHOICE,
  question({
    type: 'binary',
    content: {
      type: 'binary',
      schemaVersion: 1,
      labelMode: 'true-false',
    },
    answer: { type: 'binary', schemaVersion: 1, isTrue: true },
  }),
  question({
    type: 'short-answer',
    content: { type: 'short-answer', schemaVersion: 1, answerLines: 2 },
    answer: {
      type: 'short-answer',
      schemaVersion: 1,
      canonicalAnswer: 'Baghdad',
      approvedVariants: ['Bagdad'],
    },
  }),
  question({
    type: 'completion',
    content: {
      type: 'completion',
      schemaVersion: 1,
      text: 'I ___ to school.',
      blankIds: ['blank-1'],
      wordBank: ['go'],
      wordBankOrder: 'unordered',
      allowWordReuse: false,
      requireAllWordsUsed: true,
    },
    answer: {
      type: 'completion',
      schemaVersion: 1,
      answers: { 'blank-1': 'go' },
    },
  }),
  question({
    type: 'odd-word',
    content: {
      type: 'odd-word',
      schemaVersion: 1,
      words: ['red', 'blue', 'chair'],
    },
    answer: { type: 'odd-word', schemaVersion: 1, oddWord: 'chair' },
  }),
  question({
    type: 'matching',
    content: {
      type: 'matching',
      schemaVersion: 1,
      left: [
        { id: 'l1', text: 'one' },
        { id: 'l2', text: 'two' },
      ],
      right: [
        { id: 'r1', text: '1' },
        { id: 'r2', text: '2' },
      ],
    },
    answer: {
      type: 'matching',
      schemaVersion: 1,
      pairs: [
        { leftId: 'l1', rightId: 'r1' },
        { leftId: 'l2', rightId: 'r2' },
      ],
    },
  }),
  question({
    type: 'word-relationship',
    content: {
      type: 'word-relationship',
      schemaVersion: 1,
      words: ['hot', 'cold'],
    },
    answer: {
      type: 'word-relationship',
      schemaVersion: 1,
      acceptedAnswers: ['opposites'],
    },
  }),
  question({
    type: 'rewrite',
    content: {
      type: 'rewrite',
      schemaVersion: 1,
      instruction: 'Rewrite in the past tense.',
    },
    answer: {
      type: 'rewrite',
      schemaVersion: 1,
      acceptedAnswers: ['He went home.'],
    },
  }),
  question({
    type: 'extended-writing',
    content: {
      type: 'extended-writing',
      schemaVersion: 1,
      minimumWords: 40,
      maximumWords: 60,
    },
    answer: {
      type: 'extended-writing',
      schemaVersion: 1,
      rubricCriteria: ['Uses complete sentences', 'Answers the prompt'],
    },
  }),
]

describe('question-domain validation', () => {
  it.each(VALID_QUESTIONS.map((item) => [item.type, item] as const))(
    'accepts a valid %s question',
    (_type, item) => {
      expect(validateDomainQuestion(item)).toEqual({ success: true })
    },
  )

  it('rejects units beyond the eight-unit book', () => {
    expect(validateDomainQuestion({ ...MULTIPLE_CHOICE, unit: 8 })).toEqual({ success: true })
    expect(validateDomainQuestion({ ...MULTIPLE_CHOICE, unit: 9 })).toMatchObject({
      success: false,
      issues: expect.arrayContaining([expect.objectContaining({ path: 'unit' })]),
    })
  })

  it('rejects unsupported versions before rendering', () => {
    const invalid = {
      ...MULTIPLE_CHOICE,
      schemaVersion: 2,
      content: { ...MULTIPLE_CHOICE.content, schemaVersion: 2 },
    }

    expect(validateDomainQuestion(invalid)).toMatchObject({
      success: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ path: 'schemaVersion' }),
        expect.objectContaining({ path: 'content.schemaVersion' }),
      ]),
    })
  })

  it('rejects invalid marks and mismatched completion answers', () => {
    const completion = VALID_QUESTIONS.find(
      (item) => item.type === 'completion',
    )

    expect(
      validateDomainQuestion({
        ...completion,
        marks: 0,
        answer: {
          type: 'completion',
          schemaVersion: 1,
          answers: { unknown: 'answer' },
        },
      }),
    ).toMatchObject({ success: false })
  })

  it('requires an explicit True/False or Yes/No label mode', () => {
    expect(
      validateDomainQuestion(
        question({
          type: 'binary',
          content: {
            type: 'binary',
            schemaVersion: 1,
          } as never,
          answer: {
            type: 'binary',
            schemaVersion: 1,
            isTrue: false,
          },
        }),
      ),
    ).toMatchObject({
      success: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ path: 'content.labelMode' }),
      ]),
    })

    expect(
      validateDomainQuestion(
        question({
          type: 'binary',
          content: {
            type: 'binary',
            schemaVersion: 1,
            labelMode: 'yes-no',
          },
          answer: {
            type: 'binary',
            schemaVersion: 1,
            isTrue: true,
          },
        }),
      ),
    ).toEqual({ success: true })
  })

  it('keeps a canonical short answer separate from approved variants', () => {
    const invalid = question({
      type: 'short-answer',
      content: {
        type: 'short-answer',
        schemaVersion: 1,
      },
      answer: {
        type: 'short-answer',
        schemaVersion: 1,
        canonicalAnswer: 'Baghdad',
        approvedVariants: ['Baghdad', 'baghdad'],
      },
    })

    expect(validateDomainQuestion(invalid)).toMatchObject({
      success: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ path: 'answer.approvedVariants' }),
      ]),
    })

    expect(
      validateDomainQuestion({
        ...invalid,
        answer: {
          type: 'short-answer',
          schemaVersion: 1,
          canonicalAnswer: ' ',
          approvedVariants: ['Baghdad'],
        },
      }),
    ).toMatchObject({
      success: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ path: 'answer.canonicalAnswer' }),
      ]),
    })
  })

  it('enforces completion word-bank membership and reuse policy', () => {
    const reusedWithoutPermission = question({
      type: 'completion',
      content: {
        type: 'completion',
        schemaVersion: 1,
        text: 'I ___ and they ___.',
        blankIds: ['first', 'second'],
        wordBank: ['go', 'walk'],
        wordBankOrder: 'ordered',
        allowWordReuse: false,
        requireAllWordsUsed: true,
      },
      answer: {
        type: 'completion',
        schemaVersion: 1,
        answers: { first: 'go', second: 'go' },
      },
    })

    expect(validateDomainQuestion(reusedWithoutPermission)).toMatchObject({
      success: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ path: 'answer.answers' }),
      ]),
    })

    expect(
      validateDomainQuestion({
        ...reusedWithoutPermission,
        answer: {
          type: 'completion',
          schemaVersion: 1,
          answers: { first: 'go', second: 'outside-bank' },
        },
      }),
    ).toMatchObject({
      success: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ path: 'answer.answers' }),
      ]),
    })

    expect(
      validateDomainQuestion(
        question({
          type: 'completion',
          content: {
            type: 'completion',
            schemaVersion: 1,
            text: 'It ___ and this ___.',
            blankIds: ['first', 'second'],
            wordBank: ['is'],
            wordBankOrder: 'unordered',
            allowWordReuse: true,
            requireAllWordsUsed: true,
          },
          answer: {
            type: 'completion',
            schemaVersion: 1,
            answers: { first: 'is', second: 'is' },
          },
        }),
      ),
    ).toEqual({ success: true })
  })

  it('rejects unequal matching lists and reused List B targets', () => {
    const invalid = question({
      type: 'matching',
      content: {
        type: 'matching',
        schemaVersion: 1,
        left: [
          { id: 'l1', text: 'one' },
          { id: 'l2', text: 'two' },
        ],
        right: [
          { id: 'r1', text: '1' },
          { id: 'r2', text: '2' },
          { id: 'r3', text: 'unused' },
        ],
      },
      answer: {
        type: 'matching',
        schemaVersion: 1,
        pairs: [
          { leftId: 'l1', rightId: 'r1' },
          { leftId: 'l2', rightId: 'r1' },
        ],
      },
    })

    expect(validateDomainQuestion(invalid)).toMatchObject({
      success: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ path: 'content.right' }),
        expect.objectContaining({ path: 'answer.pairs' }),
      ]),
    })
  })

  it('accepts approved writing guidance or explicit manual-only marking', () => {
    const writingContent = {
      type: 'extended-writing' as const,
      schemaVersion: 1 as const,
      minimumWords: 40,
    }

    expect(
      validateDomainQuestion(
        question({
          type: 'extended-writing',
          content: writingContent,
          answer: {
            type: 'extended-writing',
            schemaVersion: 1,
            modelAnswer: 'An approved model response.',
          },
        }),
      ),
    ).toEqual({ success: true })

    expect(
      validateDomainQuestion(
        question({
          type: 'extended-writing',
          content: writingContent,
          answer: {
            type: 'extended-writing',
            schemaVersion: 1,
            manualMarkingNote: MANUAL_MARKING_NOTE,
          },
        }),
      ),
    ).toEqual({ success: true })

    expect(
      validateDomainQuestion(
        question({
          type: 'extended-writing',
          content: writingContent,
          answer: {
            type: 'extended-writing',
            schemaVersion: 1,
          },
        }),
      ),
    ).toMatchObject({
      success: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ path: 'answer' }),
      ]),
    })


    expect(
      validateDomainQuestion(
        question({
          type: 'extended-writing',
          content: writingContent,
          answer: {
            type: 'extended-writing',
            schemaVersion: 1,
            modelAnswer: 'Approved model.',
            manualMarkingNote: MANUAL_MARKING_NOTE,
          },
        }),
      ),
    ).toMatchObject({
      success: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ path: 'answer' }),
      ]),
    })
  })
})

describe('question-domain adapters', () => {
  it('keeps legacy MCQ renderer output identical', () => {
    expect(domainQuestionToLegacyExamQuestion(MULTIPLE_CHOICE)).toEqual({
      id: QUESTION_ID,
      unit: 1,
      lesson: '1',
      type: 'multiple-choice',
      difficulty: 'medium',
      prompt: 'Valid multiple-choice question',
      marks: 2,
      options: [
        { label: 'A', text: 'Wrong' },
        { label: 'B', text: 'Correct' },
      ],
      correctAnswer: { label: 'B', text: 'Correct' },
    })
  })

  it('writes both typed and legacy MCQ persistence fields', () => {
    expect(domainQuestionToPersistenceInsert(MULTIPLE_CHOICE)).toMatchObject({
      id: QUESTION_ID,
      owner_id: OWNER_ID,
      bank_id: BANK_ID,
      question_type: 'multiple-choice',
      schema_version: 1,
      marks: 2,
      content: MULTIPLE_CHOICE.content,
      answer: MULTIPLE_CHOICE.answer,
      options: MULTIPLE_CHOICE_OPTIONS,
      correct_option_label: 'B',
    })
  })

  it('keeps selection and renderer inputs separate', () => {
    expect(domainQuestionToSelectionInput(MULTIPLE_CHOICE)).not.toHaveProperty(
      'answer',
    )
    expect(domainQuestionToRendererInput(MULTIPLE_CHOICE)).not.toHaveProperty(
      'ownerId',
    )
  })

  it('converts a typed persistence row back to a domain question', () => {
    const row: Tables<'questions'> = {
      id: QUESTION_ID,
      owner_id: OWNER_ID,
      bank_id: BANK_ID,
      external_id: 'phase6-multiple-choice',
      unit: 1,
      lesson: '1',
      question_type: 'multiple-choice',
      schema_version: 1,
      difficulty: 'medium',
      prompt: 'Valid multiple-choice question',
      marks: 2,
      content: MULTIPLE_CHOICE.content,
      answer: MULTIPLE_CHOICE.answer,
      options: MULTIPLE_CHOICE_OPTIONS,
      correct_option_label: 'B',
      current_revision: 1,
      is_active: true,
      created_at: '2026-09-16T00:00:00.000Z',
      updated_at: '2026-09-16T00:00:00.000Z',
    }

    expect(questionRowToDomain(row)).toEqual(MULTIPLE_CHOICE)
  })
})

describe('question grouping and immutable snapshots', () => {
  const root: QuestionGroup = {
    id: 'root',
    ownerId: OWNER_ID,
    type: 'passage',
    schemaVersion: 1,
    parentGroupId: null,
    position: null,
    label: null,
    expectedMarks: 2,
  }
  const child: QuestionGroup = {
    ...root,
    id: 'child',
    type: 'branch',
    parentGroupId: 'root',
    position: 1,
    label: 'A',
  }

  it('accepts an ordered, owner-consistent graph', () => {
    expect(
      validateQuestionGraph(
        [root, child],
        [{ groupId: 'child', questionId: QUESTION_ID, ownerId: OWNER_ID, position: 1 }],
        [MULTIPLE_CHOICE],
      ),
    ).toEqual({ success: true })
  })

  it('rejects cycles, missing references, and owner mismatches', () => {
    const cyclicRoot = { ...root, parentGroupId: 'child', position: 2 }
    const result = validateQuestionGraph(
      [cyclicRoot, child],
      [{ groupId: 'missing', questionId: QUESTION_ID, ownerId: 'other', position: 1 }],
      [MULTIPLE_CHOICE],
    )

    expect(result).toMatchObject({ success: false })
    if (!result.success) {
      expect(result.issues.map((issue) => issue.message)).toEqual(
        expect.arrayContaining([
          'Group relationships cannot contain a cycle.',
          'Group does not exist.',
          'Group, question, and member owners must match.',
        ]),
      )
    }
  })

  it('requires snapshot marks and positions to match captured revisions', () => {
    const snapshot: ExamSnapshot = {
      id: 'snapshot',
      ownerId: OWNER_ID,
      schemaVersion: 1,
      selectionSeed: 42,
      totalMarks: 2,
      questions: [
        {
          questionId: QUESTION_ID,
          questionRevisionId: 'revision-1',
          revision: 1,
          position: 1,
          marks: 2,
          sourceGroupId: 'child',
        },
      ],
    }

    expect(validateExamSnapshot(snapshot)).toEqual({ success: true })
    expect(
      validateExamSnapshot({
        ...snapshot,
        schemaVersion: 2 as 1,
        totalMarks: 3,
        questions: [...snapshot.questions, { ...snapshot.questions[0] }],
      }),
    ).toMatchObject({ success: false })
  })
})
