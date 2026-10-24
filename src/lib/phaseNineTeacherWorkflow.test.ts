import { describe, expect, it } from 'vitest'
import { validateExamSnapshot, type ExamSnapshot } from '../domain/questionDomain'
import { canonicalQuestionCandidates } from './canonicalQuestionCandidates'
import { SOURCE_STRUCTURE, SETTINGS } from './fixtures/phaseNineSource'
import { parsePhaseNineTeacherIntent, PHASE_NINE_GENERAL_INSTRUCTION, PHASE_NINE_PROFILE_ID, phaseNinePool, selectPhaseNinePaper } from './phaseNineTeacherWorkflow'
import { replacePhaseNineQuestion, togglePhaseNineQuestionLock } from './phaseNineWorkflow'

const questions = SOURCE_STRUCTURE.branches.flatMap((b) => b.items.map((i) => i.question))
export function teacherIntent() {
  return parsePhaseNineTeacherIntent({ schemaVersion: 2, profileId: PHASE_NINE_PROFILE_ID, rendererVersion: 1,
    ownerId: questions[0].ownerId, bankId: questions[0].bankId,
    settings: { ...SETTINGS, teacherName: 'Teacher test', questionCount: questions.length },
    filters: { lesson: 'representative', difficulty: 'medium' }, pageTarget: 2,
    generalInstruction: PHASE_NINE_GENERAL_INSTRUCTION, review: selectPhaseNinePaper(questions, SETTINGS.selectionSeed) })
}

describe('integrated canonical Phase 9 selection', () => {
  it('preserves identity, revisions, branches, order, answers and marks across equivalent candidate permutations', () => {
    const expected = selectPhaseNinePaper(questions, 7)
    for (let i = 0; i < questions.length; i++) {
      const rotated = [...questions.slice(i), ...questions.slice(0, i)]
      expect(selectPhaseNinePaper(rotated, 7)).toEqual(expected)
      expect(selectPhaseNinePaper(rotated.reverse(), 7)).toEqual(expected)
    }
  })
  it('chooses highest revision, deduplicates exact repeated rows and never resurrects withdrawn latest content', () => {
    const q = questions[0]
    const newer = { ...q, revision: 2, prompt: 'Latest prompt' }
    expect(canonicalQuestionCandidates([q, newer, q])).toEqual([newer])
    expect(canonicalQuestionCandidates([q, { ...newer, isActive: false }])).toEqual([])
  })
  it('rejects conflicting copies of a revision, including old revisions', () => {
    const q = questions[0]
    expect(() => canonicalQuestionCandidates([{ ...q, revision: 3 }, q, { ...q, prompt: 'Conflict' }])).toThrow('Conflicting')
  })
  it('excludes other owners, banks and filter mismatches', () => {
    expect(phaseNinePool(questions, questions[0].ownerId, questions[0].bankId, { lesson: 'absent', difficulty: '' })).toEqual([])
    expect(phaseNinePool(questions, 'other-owner', questions[0].bankId, { lesson: '', difficulty: '' })).toEqual([])
  })
  it('keeps replacement deterministic and locks effective', () => {
    const review = selectPhaseNinePaper(questions, 7)
    const target = review.snapshot.structure.branches[1].items[0].question
    const spare = { ...target, id: 'a23e4567-e89b-42d3-a456-426614174000' }
    expect(replacePhaseNineQuestion(review, target.id, [...questions, spare])).toEqual(replacePhaseNineQuestion(review, target.id, [spare, ...questions].reverse()))
    expect(() => replacePhaseNineQuestion(togglePhaseNineQuestionLock(review, target.id), target.id, [spare])).toThrow('Unlock')
  })
})

describe('complete teacher intent boundary', () => {
  it('round trips all teacher intent, uses attempt-aware 60 marks instead of 84 offered marks and copies caller state', () => {
    const original = teacherIntent()
    const restored = parsePhaseNineTeacherIntent(JSON.parse(JSON.stringify(original)))
    expect(restored).toEqual(original)
    expect(restored.review.snapshot.totalMarks).toBe(60)
    expect(questions.reduce((sum, q) => sum + (q.marks ?? 0), 0)).toBe(84)
    original.settings.teacherName = 'Changed caller'
    expect(restored.settings.teacherName).toBe('Teacher test')
  })
  it.each([
    ['renderer version', (x: ReturnType<typeof teacherIntent>) => { Object.assign(x, { rendererVersion: 99 }) }],
    ['schema version', (x: ReturnType<typeof teacherIntent>) => { Object.assign(x, { schemaVersion: 1 }) }],
    ['teacher name', (x: ReturnType<typeof teacherIntent>) => { Object.assign(x.settings, { teacherName: null }) }],
    ['quantity', (x: ReturnType<typeof teacherIntent>) => { x.settings.questionCount = 1 }],
    ['seed', (x: ReturnType<typeof teacherIntent>) => { x.settings.selectionSeed++ }],
    ['profile', (x: ReturnType<typeof teacherIntent>) => { x.review.snapshot.structure.branches[0].id = 'different' }],
    ['locks', (x: ReturnType<typeof teacherIntent>) => { x.review.lockedQuestionIds = ['missing'] }],
    ['filter', (x: ReturnType<typeof teacherIntent>) => { x.filters.lesson = 'different' }],
    ['page target', (x: ReturnType<typeof teacherIntent>) => { Object.assign(x, { pageTarget: 0 }) }],
  ])('rejects inconsistent %s', (_name, change) => {
    const value = teacherIntent(); change(value)
    expect(() => parsePhaseNineTeacherIntent(value)).toThrow()
  })
  it('rejects two revisions of one canonical question independently of revision identity', () => {
    const base: ExamSnapshot = { id: 'test', ownerId: questions[0].ownerId, schemaVersion: 1, selectionSeed: 1, totalMarks: 4,
      questions: [1, 2].map((revision) => ({ questionId: 'same', questionRevisionId: `revision-${revision}`, revision, marks: 2, position: revision, sourceGroupId: null })) }
    expect(validateExamSnapshot(base).success).toBe(false)
  })
  it('rejects missing, duplicate or unequal-mark attempt group members', () => {
    const base: ExamSnapshot = { id: 'test', ownerId: questions[0].ownerId, schemaVersion: 1, selectionSeed: 1, totalMarks: 2,
      questions: [1, 2].map((n) => ({ questionId: `q-${n}`, questionRevisionId: `r-${n}`, revision: 1, marks: 2, position: n, sourceGroupId: null })),
      attemptGroups: [{ id: 'g', questionIds: ['q-1', 'q-2'], attemptCount: 1 }] }
    expect(validateExamSnapshot(base).success).toBe(true)
    expect(validateExamSnapshot({ ...base, attemptGroups: [{ id: 'g', questionIds: ['q-1'], attemptCount: 1 }] }).success).toBe(false)
    expect(validateExamSnapshot({ ...base, attemptGroups: [{ id: 'g', questionIds: ['q-1', 'q-1'], attemptCount: 1 }] }).success).toBe(false)
    expect(validateExamSnapshot({ ...base, questions: [base.questions[0], { ...base.questions[1], marks: 3 }] }).success).toBe(false)
  })
})
