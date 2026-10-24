import type { CompoundSnapshot } from '../domain/compoundStructure'
import { canonicalQuestionCandidates } from './canonicalQuestionCandidates'
import { parseExamBlueprint, type BlueprintPool, type ExamBlueprint } from './examBlueprint'
import { captureReviewOrder } from './examBlueprintReview'

export interface BlueprintSourceIssue {
  branchId: string
  slot: string
  id: string
  scope: 'question' | 'group'
  kind: 'missing' | 'changed'
  previousRevision?: number
  currentRevision?: number
  message: string
}

/** Identity/version metadata only. Source content remains in the current bank or immutable generated snapshot. */
export function recordBlueprintSourceReview(value: ExamBlueprint, review: CompoundSnapshot, pool: BlueprintPool): ExamBlueprint {
  const plan = captureReviewOrder(value, review, pool)
  plan.branches.forEach((branch, index) => {
    const captured = review.branches[index]
    branch.reviewedQuestionRevisions = Object.fromEntries(captured.items.map(({ question }) => [question.id, question.revision]))
    const group = captured.passageGroup ?? captured.completionGroup
    if (group) branch.reviewedGroup = { id: group.id, revision: group.revision }
  })
  return parseExamBlueprint(plan)
}

export function getBlueprintSourceIssues(value: ExamBlueprint, pool: BlueprintPool): BlueprintSourceIssue[] {
  const plan = parseExamBlueprint(value), issues: BlueprintSourceIssue[] = []
  const current = new Map(canonicalQuestionCandidates(pool.questions).filter(q => q.ownerId === plan.ownerId).map(q => [q.id, q]))
  const groups = new Map([...pool.passages, ...pool.completionGroups].filter(g => g.ownerId === plan.ownerId).map(g => [g.id, g]))
  for (const branch of plan.branches) {
    const slot = `Q${branch.mainQuestionNumber}${branch.branchLabel ? '/' + branch.branchLabel : ''}`
    for (const id of new Set([...branch.orderedQuestionIds ?? [], ...branch.includedQuestionIds, ...branch.lockedQuestionIds])) {
      const question = current.get(id), previousRevision = branch.reviewedQuestionRevisions?.[id]
      if (!question || previousRevision !== undefined && previousRevision !== question.revision) issues.push({
        branchId: branch.id, slot, id, scope: 'question', kind: question ? 'changed' : 'missing', previousRevision,
        currentRevision: question?.revision, message: question ? `${slot}: a chosen question has a different bank version. Review the current question before accepting it.`
          : `${slot}: a chosen question is missing or no longer available in the selected banks. Restore access or explicitly clear its selection constraints.` })
    }
    if (branch.reviewedGroup) {
      const group = groups.get(branch.reviewedGroup.id)
      if (!group || group.revision !== branch.reviewedGroup.revision) issues.push({ branchId: branch.id, slot, id: branch.reviewedGroup.id,
        scope: 'group', kind: group ? 'changed' : 'missing', previousRevision: branch.reviewedGroup.revision, currentRevision: group?.revision,
        message: `${slot}: the complete linked exercise changed or is unavailable. Keep its children together when resolving it.` })
    }
  }
  return issues
}

/** Explicit acceptance updates versions only; the next complete selection must still pass every rule. */
export function acceptBlueprintSourceUpdates(value: ExamBlueprint, pool: BlueprintPool, branchId: string): ExamBlueprint {
  const plan = parseExamBlueprint(value), branch = plan.branches.find(b => b.id === branchId)
  if (!branch?.orderedQuestionIds?.length) throw new Error('Review the complete chosen order before accepting source versions.')
  const issues = getBlueprintSourceIssues(plan, pool).filter(issue => issue.branchId === branchId)
  if (issues.some(issue => issue.kind === 'missing')) throw new Error('Restore missing questions or explicitly return this branch to bank selection first.')
  if (issues.some(issue => issue.scope === 'group' ? branch.lockedQuestionIds.length : branch.lockedQuestionIds.includes(issue.id))) {
    throw new Error('Unlock the changed question or complete group before accepting its new version.')
  }
  const byId = new Map(canonicalQuestionCandidates(pool.questions).map(q => [q.id, q]))
  branch.reviewedQuestionRevisions = Object.fromEntries(branch.orderedQuestionIds.map(id => [id, byId.get(id)!.revision]))
  if (branch.reviewedGroup) branch.reviewedGroup.revision = [...pool.passages, ...pool.completionGroups].find(g => g.id === branch.reviewedGroup!.id)!.revision
  return parseExamBlueprint(plan)
}

/** Teacher-confirmed recovery keeps include/lock rules, counts and totals; it never invents a replacement. */
export function resetBlueprintBranchSelection(value: ExamBlueprint, branchId: string, newTotal?: number): ExamBlueprint {
  const plan = parseExamBlueprint(value), branch = plan.branches.find(b => b.id === branchId)
  if (!branch) throw new Error('This branch no longer exists.')
  delete branch.orderedQuestionIds; delete branch.reviewedQuestionRevisions; delete branch.reviewedGroup
  branch.distribution = { mode: 'equal' }
  if (newTotal !== undefined) {
    branch.marks = newTotal
    plan.totalMarks = plan.branches.reduce((sum, b) => sum + b.marks, 0)
  }
  return parseExamBlueprint(plan)
}
