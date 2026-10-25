import { compoundBranchPointIds } from '../../domain/compoundStructure'
import { makeExam002Candidate } from './phaseTenExam002Candidate'
import { selectBlueprintPaper, type BlueprintPool, type ExamBlueprint } from '../examBlueprint'
import { recordBlueprintSourceReview } from '../examBlueprintRecovery'
import { EXAM_BLUEPRINT_PROFILE_ID } from '../examBlueprintWorkflow'

/** Existing representative content through the general production blueprint path. */
export function makeBlueprintPaperFixture() {
  const source = structuredClone(makeExam002Candidate('tissue'))
  const questions = source.branches.flatMap(branch => branch.items.map(item => item.question))
  const passage = source.branches[0].passageGroup!
  const grouped = new Set(passage.children.map(child => child.question.id))
  const pool: BlueprintPool = { bankIds: [source.bankId], questions, passages: [passage], completionGroups: [], standaloneQuestionIds: questions.filter(q => !grouped.has(q.id)).map(q => q.id) }
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
