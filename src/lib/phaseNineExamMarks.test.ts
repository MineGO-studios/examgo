import { describe, expect, it } from 'vitest'
import { SOURCE_STRUCTURE, SETTINGS } from './fixtures/phaseNineSource'
import { assignPhaseNineBranchMarks, buildPhaseNineAnswerKeyData, parsePhaseNineSnapshot,
  phaseNineBranchPointIds, replacePhaseNineQuestion } from './phaseNineWorkflow'
import { parsePhaseNineTeacherIntent, PHASE_NINE_GENERAL_INSTRUCTION, PHASE_NINE_PROFILE_ID,
  phaseNinePool, selectPhaseNineMarkedPaper } from './phaseNineTeacherWorkflow'

const bankIds = ['123e4567-e89b-42d3-a456-426614174000', '223e4567-e89b-42d3-a456-426614174000']
const questions = SOURCE_STRUCTURE.branches.flatMap((branch) => branch.items.map((item) => ({ ...item.question, marks: null })))
function intent() {
  return parsePhaseNineTeacherIntent({ schemaVersion: 3, profileId: PHASE_NINE_PROFILE_ID, rendererVersion: 1,
    ownerId: questions[0].ownerId, bankId: bankIds[0], bankIds, settings: { ...SETTINGS, teacherName: 'Teacher', questionCount: 16 },
    filters: { lesson: '', difficulty: '' }, pageTarget: 1, generalInstruction: PHASE_NINE_GENERAL_INSTRUCTION,
    review: selectPhaseNineMarkedPaper(questions, SETTINGS.selectionSeed) })
}

describe('Phase Nine exam-owned marks and membership pools', () => {
  it('selects markless canonical revisions deterministically and ignores bank mark defaults', () => {
    const review = selectPhaseNineMarkedPaper(questions, 7)
    expect(selectPhaseNineMarkedPaper([...questions, ...questions].reverse(), 7)).toEqual(review)
    expect(review.snapshot.totalMarks).toBe(60)
    expect(review.snapshot.structure.branches.flatMap((b) => b.items).every((i) => i.question.marks === null)).toBe(true)
    expect(selectPhaseNineMarkedPaper(questions.map((q) => ({ ...q, marks: 99 })), 7).snapshot.structure.branches.map((b) => b.marks)).toEqual([10, 10, 10, 10, 20])
  })
  it('preserves a required custom completion split without changing canonical questions', () => {
    const original = intent()
    const branch = original.review.snapshot.structure.branches[0]
    const custom = Object.fromEntries(phaseNineBranchPointIds(branch).map((id, index) => [id, [1, 2, 1, 2, 1][index]]))
    const review = assignPhaseNineBranchMarks(original.review, branch.id, 7, { mode: 'custom', marksByPoint: custom })
    const restored = parsePhaseNineTeacherIntent({ ...original, review })
    expect(restored.review.snapshot.totalMarks).toBe(57)
    expect(buildPhaseNineAnswerKeyData(restored.review.snapshot, SETTINGS).Answers.slice(0, 5).map((row) => row.Mark)).toEqual([1, 2, 1, 2, 1])
    expect(restored.review.snapshot.structure.branches[0].items[0].question).toEqual(branch.items[0].question)
    expect(parsePhaseNineSnapshot(JSON.stringify(review.snapshot))).toEqual(review.snapshot)
    expect(() => assignPhaseNineBranchMarks(review, branch.id, 7, { mode: 'equal' })).toThrow('whole')
  })
  it('enforces equal whole optional marks and counts writing alternatives once', () => {
    const review = intent().review
    const optional = review.snapshot.structure.branches[1]
    expect(() => assignPhaseNineBranchMarks(review, optional.id, 7, { mode: 'equal' })).toThrow('whole')
    const writing = assignPhaseNineBranchMarks(review, 'q5', 23, { mode: 'equal' })
    expect(writing.snapshot.totalMarks).toBe(63)
    expect(buildPhaseNineAnswerKeyData(writing.snapshot, SETTINGS).Answers.filter((row) => row.Q === '5').map((row) => row.Mark)).toEqual([23, 23])
  })
  it('maps replacement scoring onto new point identities and keeps the source revision markless', () => {
    const original = intent().review
    const branch = original.snapshot.structure.branches[0]
    const points = phaseNineBranchPointIds(branch)
    const review = assignPhaseNineBranchMarks(original, branch.id, 7,
      { mode: 'custom', marksByPoint: Object.fromEntries(points.map((id, i) => [id, [1, 2, 1, 2, 1][i]])) })
    const target = branch.items[0].question
    const replacement = { ...target, id: 'a23e4567-e89b-42d3-a456-426614174000' }
    const updated = replacePhaseNineQuestion(review, target.id, [replacement])
    expect(updated.snapshot.structure.branches[0].items[0].question).toEqual(replacement)
    expect(Object.values(updated.snapshot.structure.branches[0].pointMarks!)).toEqual([1, 2, 1, 2, 1])
    expect(Object.keys(updated.snapshot.structure.branches[0].pointMarks!).every((id) => id.startsWith(replacement.id))).toBe(true)
  })
  it('deduplicates authorized membership-reader rows and preserves owner/unit/filter exclusions', () => {
    expect(phaseNinePool([...questions, ...questions], questions[0].ownerId, bankIds, { lesson: '', difficulty: '' })).toHaveLength(16)
    expect(phaseNinePool(questions, bankIds[0], bankIds, { lesson: '', difficulty: '' })).toEqual([])
    expect(phaseNinePool(questions, questions[0].ownerId, bankIds, { lesson: 'missing', difficulty: '' })).toEqual([])
    expect(phaseNinePool(questions.map((q) => ({ ...q, unit: 2 })), questions[0].ownerId, bankIds, { lesson: '', difficulty: '' })).toEqual([])
  })
  it('rejects duplicate banks, missing scoring and mixed version envelopes', () => {
    const original = intent()
    expect(() => parsePhaseNineTeacherIntent({ ...original, bankIds: [bankIds[0], bankIds[0]] })).toThrow('distinct')
    expect(() => parsePhaseNineTeacherIntent({ ...original, schemaVersion: 2 })).toThrow('Multiple banks')
    const broken = structuredClone(original)
    delete broken.review.snapshot.structure.branches[0].pointMarks
    expect(() => parsePhaseNineTeacherIntent(broken)).toThrow('Assign exam marks')
  })
  it('filters incompatible replacement instructions before selecting a feasible source prompt', () => {
    const review = intent().review
    const target = review.snapshot.structure.branches[3].items[0].question
    if (target.type !== 'rewrite') throw new Error('Fixture rewrite missing')
    const valid = { ...target, id: 'a23e4567-e89b-42d3-a456-426614174000' }
    const invalid = { ...target, id: 'b23e4567-e89b-42d3-a456-426614174000', content: { ...target.content, instruction: 'Use another grammar rule.' } }
    expect(replacePhaseNineQuestion(review, target.id, [invalid, valid]).snapshot.structure.branches[3].items[0].question).toEqual(valid)
  })
})
