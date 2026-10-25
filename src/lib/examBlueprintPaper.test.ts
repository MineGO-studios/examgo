import { expect, it } from 'vitest'
import { compoundBranchPointIds } from '../domain/compoundStructure'
import { makeExam002Candidate } from './fixtures/phaseTenExam002Candidate'
import { selectBlueprintPaper, type BlueprintPool, type ExamBlueprint } from './examBlueprint'
import { recordBlueprintSourceReview } from './examBlueprintRecovery'
import { EXAM_BLUEPRINT_PROFILE_ID } from './examBlueprintWorkflow'
import { blueprintPaperSettings, createBlueprintPaperIntent, parseBlueprintPaperIntent } from './examBlueprintPaper'
import { assessBlueprintFit } from './examBlueprintFit'

function fixture() {
  const source = structuredClone(makeExam002Candidate('tissue'))
  const questions = source.branches.flatMap(branch => branch.items.map(item => item.question))
  const pool: BlueprintPool = { bankIds: [source.bankId], questions, passages: [source.branches[0].passageGroup!], completionGroups: [], standaloneQuestionIds: questions.map(q => q.id) }
  const plan: ExamBlueprint = { schemaVersion: 1, version: 1, ownerId: source.ownerId, bankIds: pool.bankIds, selectionSeed: source.selectionSeed,
    totalMarks: source.totalMarks, branches: source.branches.map(branch => ({ id: branch.id, mainQuestionNumber: branch.mainQuestionNumber,
      branchLabel: branch.branchLabel, kind: branch.kind, instruction: branch.instruction, arabicInstruction: branch.arabicInstruction,
      questionTypes: [...new Set(branch.items.map(item => item.question.type))], quantity: branch.items.length,
      displayedPointCount: compoundBranchPointIds(branch).length, marks: branch.marks, distribution: { mode: 'equal' },
      answerRule: branch.kind === 'alternatives' ? { kind: 'choose-one' } : branch.id === 'q4a' ? { kind: 'task' } : { kind: 'points', pointsToAnswer: branch.attemptCount },
      units: [], lessons: [], difficulties: [], includedQuestionIds: branch.items.map(item => item.question.id), excludedQuestionIds: [], lockedQuestionIds: [] })) }
  const review = selectBlueprintPaper(plan, pool)
  const intent = { schemaVersion: 1 as const, profileId: EXAM_BLUEPRINT_PROFILE_ID, rendererVersion: 1 as const,
    blueprint: recordBlueprintSourceReview(plan, review, pool), settings: { schoolName: 'School', examTitle: 'Saved paper', teacherName: 'Teacher', grade: 6 },
    generalInstruction: 'Follow each instruction.' }
  return { intent, review, pool }
}

it('roundtrips one immutable captured paper with explicit layout status independently of current banks', () => {
  const { intent, review, pool } = fixture(), before = structuredClone({ intent, review })
  const paper = createBlueprintPaperIntent(intent, review, 'unchanged-two-page')
  pool.questions.length = 0; pool.passages.length = 0
  expect(parseBlueprintPaperIntent(JSON.parse(JSON.stringify(paper)))).toEqual(paper)
  expect(blueprintPaperSettings(paper)).toMatchObject({ schoolName: 'School', teacherName: 'Teacher', selectionSeed: review.selectionSeed })
  expect(paper.layout).toMatchObject({ status: 'NEEDS_REVIEW', decision: 'unchanged-two-page' })
  paper.snapshot.branches[0].instruction = 'Changed copy'
  expect({ intent, review }).toEqual(before)
})

it('rejects divergent source versions, order, marks and forged readiness instead of rendering stale intent', () => {
  const { intent, review } = fixture(), paper = createBlueprintPaperIntent(intent, review, 'review-required')
  for (const mutate of [
    (p: typeof paper) => { p.snapshot.branches[1].items.reverse() },
    (p: typeof paper) => { p.snapshot.branches[1].items[0].question.revision++ },
    (p: typeof paper) => { p.snapshot.totalMarks++ },
    (p: typeof paper) => { p.layout.status = 'READY' as 'NEEDS_REVIEW' },
    (p: typeof paper) => { delete p.intent.blueprint.branches[0].reviewedQuestionRevisions },
    (p: typeof paper) => { delete p.intent.blueprint.branches[0].reviewedGroup },
  ]) {
    const changed = structuredClone(paper); mutate(changed)
    expect(() => parseBlueprintPaperIntent(changed)).toThrow()
  }
})

it('reports section-aware content pressure without changing content or claiming measured page boundaries', () => {
  const { intent, review } = fixture(), paper = createBlueprintPaperIntent(intent, review, 'review-required')
  const before = structuredClone(paper), assessed = assessBlueprintFit(paper)
  expect(assessed.status).toBe('NEEDS_REVIEW')
  expect(assessed.sections.map(section => section.branchId)).toEqual(review.branches.map(branch => branch.id))
  expect(assessed.sections.map(section => section.marks)).toEqual(review.branches.map(branch => branch.marks))
  expect(assessed.reasons.join(' ')).toContain('does not measure Word or LibreOffice page breaks')
  expect(paper).toEqual(before)
  const longer = structuredClone(paper)
  longer.snapshot.branches[0].passageGroup!.passage = 'Long unchanged passage line for layout review.\n'.repeat(100)
  const pressure = assessBlueprintFit(longer)
  expect(pressure.sections[0].estimatedLines).toBeGreaterThan(assessed.sections[0].estimatedLines)
  expect(pressure.sections[0].exceedsPageBudget).toBe(true)
  expect(pressure.reasons.join(' ')).toContain('have not been shortened')
})
