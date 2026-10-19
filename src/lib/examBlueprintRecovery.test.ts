import { expect, it } from 'vitest'
import { makeExam002Candidate } from './fixtures/phaseTenExam002Candidate'
import { selectBlueprintPaper, type BlueprintPool, type ExamBlueprint } from './examBlueprint'
import { acceptBlueprintSourceUpdates, getBlueprintSourceIssues, recordBlueprintSourceReview, resetBlueprintBranchSelection } from './examBlueprintRecovery'
import { replaceBlueprintQuestion } from './examBlueprintReview'
import { makeBlueprintPaperFixture } from './fixtures/blueprintPaper'

it('detects changed or missing complete groups and requires explicit unlocked acceptance without splitting children', () => {
  const { intent, pool } = makeBlueprintPaperFixture(), plan = intent.blueprint, group = pool.passages[0]
  group.revision++; group.passage += ' Source revision update.'
  expect(getBlueprintSourceIssues(plan, pool)).toMatchObject([{ scope: 'group', kind: 'changed', currentRevision: group.revision }])
  plan.branches[0].lockedQuestionIds = [group.children[0].question.id]
  expect(() => acceptBlueprintSourceUpdates(plan, pool, plan.branches[0].id)).toThrow('Unlock')
  plan.branches[0].lockedQuestionIds = []
  const accepted = acceptBlueprintSourceUpdates(plan, pool, plan.branches[0].id)
  const snapshot = selectBlueprintPaper(accepted, pool)
  expect(snapshot.branches[0].passageGroup).toEqual(group)
  expect(snapshot.branches[0].items.map(item => item.question.id)).toEqual(group.children.map(child => child.question.id))
  pool.passages = []
  expect(getBlueprintSourceIssues(accepted, pool)).toMatchObject([{ scope: 'group', kind: 'missing' }])
  expect(() => acceptBlueprintSourceUpdates(accepted, pool, plan.branches[0].id)).toThrow('Restore missing')
})

function fixture() {
  const source = structuredClone(makeExam002Candidate('tissue')), selected = source.branches[1].items.slice(0, 2).map(i => i.question)
  const pool: BlueprintPool = { bankIds: [source.bankId], questions: selected, passages: [], completionGroups: [], standaloneQuestionIds: selected.map(q => q.id) }
  const blueprint: ExamBlueprint = { schemaVersion: 1, version: 1, ownerId: source.ownerId, bankIds: pool.bankIds, selectionSeed: 1, totalMarks: 2,
    branches: [{ id: 'reviewed', mainQuestionNumber: 1, branchLabel: 'B', kind: 'questions', instruction: 'Answer all questions.', arabicInstruction: null,
      questionTypes: [...new Set(selected.map(q => q.type))], quantity: 2, displayedPointCount: 2, answerRule: { kind: 'points', pointsToAnswer: 2 },
      marks: 2, distribution: { mode: 'equal' }, units: [1], lessons: [], difficulties: [], includedQuestionIds: [], excludedQuestionIds: [], lockedQuestionIds: [],
      orderedQuestionIds: selected.map(q => q.id), reviewedQuestionRevisions: Object.fromEntries(selected.map(q => [q.id, q.revision])) }] }
  return { blueprint, pool, selected }
}

it('reuses exact reviewed versions but refuses a changed or missing chosen question', () => {
  const { blueprint, pool, selected } = fixture()
  expect(selectBlueprintPaper(blueprint, pool).branches[0].items.map(i => i.question.id)).toEqual(selected.map(q => q.id))
  pool.questions.push({ ...structuredClone(selected[0]), revision: selected[0].revision + 1, prompt: 'Changed source question?' })
  expect(() => selectBlueprintPaper(blueprint, pool)).toThrow('Q1/B: a reviewed question changed or is unavailable')
  pool.questions = [selected[1]]
  expect(() => selectBlueprintPaper(blueprint, pool)).toThrow('Resolve its version')
})

it('rejects incomplete or invented version metadata instead of losing the chosen source versions', () => {
  const { blueprint, pool, selected } = fixture()
  blueprint.branches[0].reviewedQuestionRevisions = { [selected[0].id]: selected[0].revision }
  expect(() => selectBlueprintPaper(blueprint, pool)).toThrow('reviewed versions must match')
  blueprint.branches[0].reviewedQuestionRevisions = Object.fromEntries(selected.map(q => [q.id, 0]))
  expect(() => selectBlueprintPaper(blueprint, pool)).toThrow('reviewed versions must match')
})

it('requires explicit acceptance of a changed version and refuses to update a locked question silently', () => {
  const { blueprint, pool, selected } = fixture(), before = structuredClone(blueprint)
  const newer = { ...structuredClone(selected[0]), revision: selected[0].revision + 1, prompt: 'Updated source question?' }
  pool.questions.push(newer)
  expect(getBlueprintSourceIssues(blueprint, pool)).toMatchObject([{ slot: 'Q1/B', scope: 'question', kind: 'changed', previousRevision: selected[0].revision, currentRevision: newer.revision }])
  blueprint.branches[0].lockedQuestionIds = [newer.id]
  expect(() => acceptBlueprintSourceUpdates(blueprint, pool, 'reviewed')).toThrow('Unlock')
  blueprint.branches[0].lockedQuestionIds = []
  const accepted = acceptBlueprintSourceUpdates(blueprint, pool, 'reviewed')
  expect(selectBlueprintPaper(accepted, pool).branches[0].items[0].question).toEqual(newer)
  expect(blueprint).toEqual(before)
})

it('retains constraints during missing-question recovery and only changes marks when explicitly supplied', () => {
  const { blueprint, pool, selected } = fixture()
  blueprint.branches[0].includedQuestionIds = [selected[0].id]
  blueprint.branches[0].lockedQuestionIds = [selected[0].id]
  pool.questions = [selected[1]]
  expect(getBlueprintSourceIssues(blueprint, pool)).toMatchObject([{ kind: 'missing', id: selected[0].id }])
  expect(() => acceptBlueprintSourceUpdates(blueprint, pool, 'reviewed')).toThrow('Restore missing')
  const reset = resetBlueprintBranchSelection(blueprint, 'reviewed')
  expect(reset.branches[0].includedQuestionIds).toEqual([selected[0].id])
  expect(reset.branches[0].lockedQuestionIds).toEqual([selected[0].id])
  expect(reset.branches[0].orderedQuestionIds).toBeUndefined()
  expect(() => selectBlueprintPaper(reset, pool)).toThrow()
  blueprint.branches[0].distribution = { mode: 'custom', marksByPoint: { [selected[0].id]: 2, [selected[1].id]: 1 } }
  blueprint.branches[0].marks = 3; blueprint.totalMarks = 3
  expect(() => resetBlueprintBranchSelection(blueprint, 'reviewed')).toThrow('whole marks')
  expect(resetBlueprintBranchSelection(blueprint, 'reviewed', 4).totalMarks).toBe(4)
  expect(blueprint.totalMarks).toBe(3)
})

it('records source versions without content and updates that lineage for a deliberate replacement', () => {
  const { blueprint, pool, selected } = fixture()
  const review = selectBlueprintPaper(blueprint, pool), recorded = recordBlueprintSourceReview(blueprint, review, pool)
  expect(recorded.branches[0].reviewedQuestionRevisions).toEqual(blueprint.branches[0].reviewedQuestionRevisions)
  expect(recorded.branches[0]).not.toHaveProperty('questions')
  const replacement = { ...structuredClone(selected[0]), id: '11111111-1111-4111-8111-111111111112', prompt: 'Explicit replacement?' }
  pool.questions.push(replacement); pool.standaloneQuestionIds.push(replacement.id)
  const changed = replaceBlueprintQuestion(recorded, review, pool, 'reviewed', selected[0].id, replacement.id)
  expect(changed.blueprint.branches[0].reviewedQuestionRevisions).not.toHaveProperty(selected[0].id)
  expect(changed.blueprint.branches[0].reviewedQuestionRevisions![replacement.id]).toBe(replacement.revision)
  expect(selectBlueprintPaper(changed.blueprint, pool)).toEqual(changed.snapshot)
})
