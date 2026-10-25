import { compoundBranchPointIds, parseCompoundSnapshot, type CompoundSnapshot } from '../domain/compoundStructure'
import { canonicalJson, canonicalQuestionCandidates } from './canonicalQuestionCandidates'
import type { DomainQuestion } from '../domain/questionDomain'
import { assignAttemptMarks, type MarkDistribution } from '../domain/markAllocation'
import { parseExamBlueprint, selectBlueprintPaper, type BlueprintPool, type ExamBlueprint } from './examBlueprint'

export interface BlueprintReviewChange {
  blueprint: ExamBlueprint
  snapshot: CompoundSnapshot
}

export interface BlueprintReplacementChoice {
  id: string
  kind: 'question' | 'passage' | 'completion'
  questions: DomainQuestion[]
  passage?: string
  instruction?: string
}

function targetBranch(plan: ExamBlueprint, review: CompoundSnapshot, branchId: string, questionId: string | null) {
  const branch = plan.branches.find(candidate => candidate.id === branchId)
  const captured = review.branches.find(candidate => candidate.id === branchId)
  if (!branch || !captured) throw new Error('This question branch is no longer in the review. Review the complete paper again.')
  const wholeGroup = branch.kind === 'passage' || branch.kind === 'completion' && branch.quantity > 1
  if (wholeGroup !== (questionId === null)) throw new Error('Replace the complete passage or completion group together; separate children cannot be replaced.')
  const target = questionId === null ? captured.items : captured.items.filter(item => item.question.id === questionId)
  if (!target.length) throw new Error('This selected question is no longer in the review.')
  return { branch, captured, target }
}

/** Coarse candidate supply; every proposed replacement must also pass replaceBlueprintQuestion. */
export function getBlueprintReplacementChoices(value: ExamBlueprint, review: CompoundSnapshot, pool: BlueprintPool,
  branchId: string, questionId: string | null): BlueprintReplacementChoice[] {
  const plan = parseExamBlueprint(value)
  if (canonicalJson(plan.bankIds) !== canonicalJson(pool.bankIds)) throw new Error('Reload the selected banks before choosing a replacement.')
  const { branch, captured, target } = targetBranch(plan, review, branchId, questionId)
  const replaced = new Set(target.map(item => item.question.id))
  const used = new Set(review.branches.flatMap(b => b.items.map(item => item.question.id)).filter(id => !replaced.has(id)))
  const current = canonicalQuestionCandidates(pool.questions).filter(q => q.ownerId === plan.ownerId)
  const byId = new Map(current.map(q => [q.id, q]))
  const fits = (q: DomainQuestion) => !used.has(q.id) && branch.questionTypes.includes(q.type) &&
    (!branch.units.length || branch.units.includes(q.unit)) && (!branch.lessons.length || branch.lessons.includes(q.lesson)) &&
    (!branch.difficulties.length || branch.difficulties.includes(q.difficulty)) && !branch.excludedQuestionIds.includes(q.id)
  if (branch.kind === 'passage') return pool.passages.filter(group => group.ownerId === plan.ownerId &&
    group.id !== captured.passageGroup?.id && group.children.length === branch.quantity && group.children.every(({ question }) =>
      canonicalJson(byId.get(question.id)) === canonicalJson(question) && fits(question))).map(group => ({
    id: group.id, kind: 'passage', questions: group.children.map(child => child.question), passage: group.passage, instruction: group.instruction,
  }))
  if (branch.kind === 'completion' && branch.quantity > 1) return pool.completionGroups.flatMap(group => {
    const questions = group.childIds.map(id => byId.get(id))
    return group.ownerId === plan.ownerId && group.id !== captured.completionGroup?.id && questions.length === branch.quantity &&
      questions.every(q => q && fits(q)) ? [{ id: group.id, kind: 'completion' as const, questions: questions as DomainQuestion[], instruction: group.instruction }] : []
  })
  const grouped = new Set([...pool.passages.flatMap(g => g.children.map(c => c.question.id)), ...pool.completionGroups.flatMap(g => g.childIds)])
  const standalone = new Set(pool.standaloneQuestionIds)
  return current.filter(q => !replaced.has(q.id) && standalone.has(q.id) && !grouped.has(q.id) && fits(q)).map(q => ({ id: q.id, kind: 'question', questions: [q] }))
}

/** Explicit review edits retain the exact chosen identities, order and all unchanged branches. */
export function captureReviewOrder(value: ExamBlueprint, review: CompoundSnapshot, pool: BlueprintPool): ExamBlueprint {
  const plan = parseExamBlueprint(value), snapshot = parseCompoundSnapshot(review)
  if (plan.ownerId !== snapshot.ownerId || canonicalJson(plan.bankIds) !== canonicalJson(snapshot.bankIds) ||
    plan.selectionSeed !== snapshot.selectionSeed || plan.totalMarks !== snapshot.totalMarks ||
    plan.branches.length !== snapshot.branches.length || plan.branches.some((branch, index) => branch.id !== snapshot.branches[index].id)) {
    throw new Error('This review no longer matches the blueprint. Review the complete paper again.')
  }
  plan.branches.forEach((branch, index) => {
    const order = snapshot.branches[index].items.map(item => item.question.id)
    if (branch.orderedQuestionIds?.length && canonicalJson(branch.orderedQuestionIds) !== canonicalJson(order)) {
      throw new Error('The chosen order changed since this review. Review the complete paper again.')
    }
    branch.orderedQuestionIds = order
  })
  if (canonicalJson(selectBlueprintPaper(plan, pool)) !== canonicalJson(snapshot)) {
    throw new Error('A question, group or rule changed since this review. Reload the banks and review again.')
  }
  return plan
}

export function moveBlueprintQuestion(value: ExamBlueprint, review: CompoundSnapshot, pool: BlueprintPool,
  branchId: string, questionId: string, direction: -1 | 1): BlueprintReviewChange {
  const plan = captureReviewOrder(value, review, pool)
  const branch = plan.branches.find(candidate => candidate.id === branchId)
  if (!branch || !['questions', 'alternatives'].includes(branch.kind)) {
    throw new Error('Keep passage, matching and completion groups in their original order. Move only separate questions within their branch.')
  }
  if (direction !== -1 && direction !== 1) throw new Error('Choose move up or move down within this branch.')
  const order = branch.orderedQuestionIds!, index = order.indexOf(questionId), target = index + direction
  if (index < 0 || target < 0 || target >= order.length) throw new Error('This move would leave the question branch. Choose an available move within the branch.')
  ;[order[index], order[target]] = [order[target], order[index]]
  return { blueprint: plan, snapshot: selectBlueprintPaper(plan, pool) }
}

export function replaceBlueprintQuestion(value: ExamBlueprint, review: CompoundSnapshot, pool: BlueprintPool,
  branchId: string, questionId: string | null, replacementId: string): BlueprintReviewChange {
  const plan = captureReviewOrder(value, review, pool)
  const { branch, captured, target } = targetBranch(plan, review, branchId, questionId)
  if (target.some(item => branch.lockedQuestionIds.includes(item.question.id))) throw new Error('Unlock this question or complete group before replacing it.')
  if (target.some(item => branch.includedQuestionIds.includes(item.question.id))) throw new Error('Remove Include from this question or complete group before replacing it.')
  const choice = getBlueprintReplacementChoices(value, review, pool, branchId, questionId).find(candidate => candidate.id === replacementId)
  if (!choice) throw new Error(`Q${branch.mainQuestionNumber}${branch.branchLabel ? '/' + branch.branchLabel : ''}: no eligible replacement matches these filters and group boundaries. Change the branch filters or choose another complete candidate.`)
  branch.orderedQuestionIds = questionId === null ? choice.questions.map(q => q.id)
    : captured.items.map(item => item.question.id === questionId ? choice.questions[0].id : item.question.id)
  if (branch.reviewedQuestionRevisions) {
    const questions = questionId === null ? choice.questions : captured.items.map(item => item.question.id === questionId ? choice.questions[0] : item.question)
    branch.reviewedQuestionRevisions = Object.fromEntries(questions.map(q => [q.id, q.revision]))
  }
  if (branch.reviewedGroup && choice.kind !== 'question') {
    const group = [...pool.passages, ...pool.completionGroups].find(group => group.id === choice.id)!
    branch.reviewedGroup = { id: group.id, revision: group.revision }
  }
  if (branch.distribution.mode === 'custom') {
    const next = structuredClone(captured)
    next.items = questionId === null ? choice.questions.map((question, index) => ({ question, label: String(index + 1) }))
      : next.items.map(item => item.question.id === questionId ? { ...item, question: choice.questions[0] } : item)
    if (choice.kind === 'passage') next.passageGroup = pool.passages.find(group => group.id === choice.id)
    if (choice.kind === 'completion') next.completionGroup = pool.completionGroups.find(group => group.id === choice.id)
    const beforePoints = compoundBranchPointIds(captured), afterPoints = compoundBranchPointIds(next)
    if (beforePoints.length !== afterPoints.length) throw new Error('This replacement changes the answerable point count. Choose another complete candidate or explicitly revise the branch.')
    branch.distribution = { mode: 'custom', marksByPoint: Object.fromEntries(afterPoints.map((id, index) => [id, captured.pointMarks![beforePoints[index]]])) }
  }
  return { blueprint: plan, snapshot: selectBlueprintPaper(plan, pool) }
}

export function assignBlueprintMarks(value: ExamBlueprint, review: CompoundSnapshot, pool: BlueprintPool,
  branchId: string, total: number, distribution: MarkDistribution): BlueprintReviewChange {
  const plan = captureReviewOrder(value, review, pool), branch = plan.branches.find(b => b.id === branchId)
  const captured = review.branches.find(b => b.id === branchId)
  if (!branch || !captured) throw new Error('This question branch is no longer in the review.')
  assignAttemptMarks(compoundBranchPointIds(captured), total, captured.attemptCount, distribution)
  branch.marks = total; branch.distribution = structuredClone(distribution)
  plan.totalMarks = plan.branches.reduce((sum, b) => sum + b.marks, 0)
  return { blueprint: plan, snapshot: selectBlueprintPaper(plan, pool) }
}

export function toggleBlueprintLock(value: ExamBlueprint, review: CompoundSnapshot, pool: BlueprintPool,
  branchId: string, questionId: string | null): BlueprintReviewChange {
  const plan = captureReviewOrder(value, review, pool), { branch, target } = targetBranch(plan, review, branchId, questionId)
  const ids = target.map(item => item.question.id), unlock = ids.every(id => branch.lockedQuestionIds.includes(id))
  branch.lockedQuestionIds = unlock ? branch.lockedQuestionIds.filter(id => !ids.includes(id)) : [...new Set([...branch.lockedQuestionIds, ...ids])]
  return { blueprint: plan, snapshot: selectBlueprintPaper(plan, pool) }
}

export function removeBlueprintSelection(value: ExamBlueprint, review: CompoundSnapshot, pool: BlueprintPool,
  branchId: string, questionId: string | null): BlueprintReviewChange {
  const plan = captureReviewOrder(value, review, pool), branch = plan.branches.find(b => b.id === branchId)
  const captured = review.branches.find(b => b.id === branchId)
  if (!branch || !captured) throw new Error('This question branch is no longer in the review.')
  const removed = questionId === null ? captured.items : captured.items.filter(item => item.question.id === questionId)
  if (!removed.length) throw new Error('This selected question is no longer in the review.')
  if (removed.some(item => branch.lockedQuestionIds.includes(item.question.id))) throw new Error('Unlock this question or complete group before removing it.')
  if (removed.some(item => branch.includedQuestionIds.includes(item.question.id))) throw new Error('Remove Include from this question or complete group before removing it.')
  if (questionId === null) {
    if (plan.branches.length === 1) throw new Error('A paper needs at least one question branch. Edit this branch instead of removing it.')
    plan.branches = plan.branches.filter(b => b.id !== branchId); plan.totalMarks -= branch.marks
  } else {
    if (branch.kind !== 'questions' || branch.answerRule.kind !== 'points' || branch.quantity <= 1 || branch.answerRule.pointsToAnswer >= branch.displayedPointCount) {
      throw new Error('Remove only an extra optional question here. Required counts and complete groups need an explicit branch edit or removal of the whole section.')
    }
    branch.quantity--; branch.displayedPointCount--
    branch.orderedQuestionIds = branch.orderedQuestionIds!.filter(id => id !== questionId)
    if (branch.reviewedQuestionRevisions) delete branch.reviewedQuestionRevisions[questionId]
    branch.excludedQuestionIds = [...new Set([...branch.excludedQuestionIds, questionId])]
    if (branch.distribution.mode === 'custom') delete branch.distribution.marksByPoint[questionId]
  }
  return { blueprint: plan, snapshot: selectBlueprintPaper(plan, pool) }
}

export function clearBlueprintOrder(value: ExamBlueprint): ExamBlueprint {
  const plan = parseExamBlueprint(value)
  if (plan.branches.some(branch => branch.distribution.mode === 'custom')) {
    throw new Error('Apply equal marks before returning to bank selection. Custom point marks belong to the current chosen questions.')
  }
  plan.branches.forEach(branch => { delete branch.orderedQuestionIds; delete branch.reviewedQuestionRevisions; delete branch.reviewedGroup })
  return plan
}
