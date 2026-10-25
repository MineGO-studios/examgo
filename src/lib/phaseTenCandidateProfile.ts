import { compoundBranchPointIds, parseCompoundSnapshot, type CompoundSnapshot } from '../domain/compoundStructure'
import { makeExam002Candidate } from './fixtures/phaseTenExam002Candidate'
import { assignAttemptMarks, type MarkDistribution } from '../domain/markAllocation'

// Candidate-only contract. Content and coverage decisions must be approved before
// this profile can be offered to teachers.
const source = makeExam002Candidate('tissue')
const historicalSource = makeExam002Candidate('tissue', true)

export function parseExam002CandidateSnapshot(value: unknown): CompoundSnapshot {
  const snapshot = parseCompoundSnapshot(value)
  const examOwnedMarks = snapshot.schemaVersion === 2
  const referenceSource = snapshot.branches[4]?.instruction === historicalSource.branches[4].instruction
    ? historicalSource : source
  if (snapshot.branches.length !== referenceSource.branches.length ||
    !examOwnedMarks && snapshot.totalMarks !== referenceSource.totalMarks) {
    throw new Error('The paper differs from the Exam_002 candidate topology or attempted total.')
  }
  snapshot.branches.forEach((branch, index) => {
    const reference = referenceSource.branches[index]
    for (const key of ['id', 'mainQuestionNumber', 'branchLabel', 'kind', 'instruction', 'arabicInstruction', 'marks', 'attemptCount'] as const) {
      const sourceInstruction = examOwnedMarks &&
        (branch.kind === 'passage' || branch.kind === 'matching' || branch.kind === 'completion' || branch.id === 'q4a') &&
        (key === 'instruction' || key === 'arabicInstruction')
      if (!(examOwnedMarks && key === 'marks') && !sourceInstruction && branch[key] !== reference[key]) {
        throw new Error(`Branch ${index + 1} differs from the Exam_002 candidate profile.`)
      }
    }
    if (examOwnedMarks && branch.kind === 'passage' &&
      branch.arabicInstruction !== branch.passageGroup?.arabicInstruction) {
      throw new Error('Passage branch must preserve its source Arabic instruction.')
    }
    if (examOwnedMarks && branch.kind !== 'passage' &&
      (branch.kind === 'matching' || branch.kind === 'completion' || branch.id === 'q4a')) {
      const question = branch.items[0]?.question
      const sourceInstruction = branch.completionGroup?.instruction ?? (question?.type === 'rewrite' ? question.content.instruction : question?.prompt)
      if (branch.instruction !== reference.instruction && branch.instruction !== sourceInstruction ||
        branch.arabicInstruction !== null && branch.arabicInstruction !== reference.arabicInstruction) {
        throw new Error('Question branch instruction must match its captured source.')
      }
    }
    const atomicCompletion = examOwnedMarks && branch.kind === 'completion' && branch.completionGroup !== undefined
    if (atomicCompletion ? branch.items.length !== 6 || branch.items.some((item, itemIndex) =>
      item.label !== String(itemIndex + 1) || item.question.type !== 'completion' || item.question.content.blankIds.length !== 1)
      : branch.items.length !== reference.items.length || branch.items.some((item, itemIndex) =>
      item.label !== reference.items[itemIndex].label || item.question.type !== reference.items[itemIndex].question.type ||
      !examOwnedMarks && item.question.marks !== reference.items[itemIndex].question.marks)) {
      throw new Error(`Branch ${index + 1} has an unsupported question slot or mark.`)
    }
    if (branch.kind === 'matching' && reference.kind === 'matching') {
      const actual = branch.items[0].question
      const expected = reference.items[0].question
      if (actual.type !== 'matching' || expected.type !== 'matching' ||
        actual.content.left.length !== expected.content.left.length || actual.content.right.length !== expected.content.right.length) {
        throw new Error(`Branch ${index + 1} has an unsupported matching size.`)
      }
    }
    if (branch.kind === 'completion' && reference.kind === 'completion') {
      const actual = branch.items[0].question
      const expected = reference.items[0].question
      if (actual.type !== 'completion' || expected.type !== 'completion' ||
        (atomicCompletion ? branch.items.reduce((count, item) => count + (item.question.type === 'completion' ? item.question.content.blankIds.length : 0), 0)
          : actual.content.blankIds.length) !== expected.content.blankIds.length) {
        throw new Error(`Branch ${index + 1} has an unsupported completion size.`)
      }
    }
  })
  return snapshot
}

export interface CandidateBranchAllocation {
  totalMarks: number
  distribution: MarkDistribution
}

/** Capture teacher scoring separately from every source question and passage revision. */
export function assignCandidateExamMarks(snapshot: CompoundSnapshot, bankIds: readonly string[],
  allocations: Record<string, CandidateBranchAllocation>): CompoundSnapshot {
  const candidate = structuredClone(snapshot)
  const keys = Object.keys(allocations)
  if (keys.length !== candidate.branches.length || keys.some((key) =>
    !candidate.branches.some((branch) => branch.id === key))) {
    throw new Error('Assign marks to every branch and no unrelated branch.')
  }
  candidate.schemaVersion = 2
  candidate.bankIds = [...bankIds]
  candidate.branches.forEach((branch) => {
    const allocation = allocations[branch.id]
    const assigned = assignAttemptMarks(compoundBranchPointIds(branch), allocation.totalMarks,
      branch.attemptCount, allocation.distribution)
    branch.marks = assigned.totalMarks
    branch.pointMarks = Object.fromEntries(assigned.pointMarks.map(({ pointId, marks }) => [pointId, marks]))
  })
  candidate.totalMarks = candidate.branches.reduce((total, branch) => total + branch.marks, 0)
  return parseExam002CandidateSnapshot(candidate)
}

/** Keep teacher scoring by displayed point position when a reviewed slot is replaced. */
export function carryCandidateExamMarks(previous: CompoundSnapshot, next: CompoundSnapshot): CompoundSnapshot {
  const captured = parseExam002CandidateSnapshot(previous)
  if (captured.schemaVersion !== 2) return next
  const allocations = Object.fromEntries(next.branches.map((branch, index) => {
    const before = captured.branches[index]
    const oldPoints = compoundBranchPointIds(before)
    const newPoints = compoundBranchPointIds(branch)
    if (before.id !== branch.id || before.attemptCount !== branch.attemptCount || oldPoints.length !== newPoints.length) {
      throw new Error('Review a new mark allocation when the question points or attempt rule change.')
    }
    return [branch.id, { totalMarks: before.marks, distribution: { mode: 'custom' as const,
      marksByPoint: Object.fromEntries(newPoints.map((id, pointIndex) => [id, before.pointMarks![oldPoints[pointIndex]]])) } }]
  }))
  return assignCandidateExamMarks(next, next.bankIds ?? [next.bankId], allocations)
}
