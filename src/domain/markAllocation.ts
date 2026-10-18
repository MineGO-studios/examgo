import type { DomainQuestion } from './questionDomain'

export type MarkDistribution =
  | { mode: 'equal' }
  | { mode: 'custom'; marksByPoint: Record<string, number> }

export interface AssignedMarks {
  totalMarks: number
  pointMarks: Array<{ pointId: string; marks: number }>
}

/** Stable answerable parts of one question. Other types have one whole-question point. */
export function questionPointIds(question: DomainQuestion): string[] {
  if (question.type === 'completion') {
    return question.content.blankIds.map((id) => `${question.id}:blank:${id}`)
  }
  if (question.type === 'matching') {
    return question.content.left.map((item) => `${question.id}:pair:${item.id}`)
  }
  return [question.id]
}

/** Passage children are separate points in their main question. */
export function passagePointIds(groupId: string, childQuestionIds: readonly string[]): string[] {
  return childQuestionIds.map((id) => `${groupId}:child:${id}`)
}

/** Exam-time scoring only; canonical bank questions carry no required marks. */
export function assignMarks(pointIds: readonly string[], totalMarks: number,
  distribution: MarkDistribution): AssignedMarks {
  if (pointIds.length < 1 || pointIds.length > 200 ||
    pointIds.some((id) => !id.trim()) || new Set(pointIds).size !== pointIds.length) {
    throw new Error('Mark points must be present, distinct and limited to 200.')
  }
  if (!Number.isSafeInteger(totalMarks) || totalMarks < 1 || totalMarks > 1000) {
    throw new Error('The question total must be a whole number from 1 to 1000.')
  }
  if (distribution.mode === 'equal') {
    if (totalMarks % pointIds.length !== 0 || totalMarks < pointIds.length) {
      throw new Error('Equal marks need a whole, positive mark for every point. Change the total or use a custom split.')
    }
    return { totalMarks, pointMarks: pointIds.map((pointId) => ({
      pointId, marks: totalMarks / pointIds.length,
    })) }
  }
  const keys = Object.keys(distribution.marksByPoint)
  if (keys.length !== pointIds.length || keys.some((key) => !pointIds.includes(key))) {
    throw new Error('Assign a mark to every point and no unrelated point.')
  }
  const pointMarks = pointIds.map((pointId) => ({
    pointId, marks: distribution.marksByPoint[pointId],
  }))
  if (pointMarks.some(({ marks }) => !Number.isSafeInteger(marks) || marks < 1) ||
    pointMarks.reduce((sum, point) => sum + point.marks, 0) !== totalMarks) {
    throw new Error('Point marks must be positive whole numbers that add up to the question total.')
  }
  return { totalMarks, pointMarks }
}

/** Optional points carry the same mark, so every permitted attempt has the same total. */
export function assignAttemptMarks(pointIds: readonly string[], totalMarks: number,
  attemptCount: number, distribution: MarkDistribution): AssignedMarks {
  if (!Number.isSafeInteger(attemptCount) || attemptCount < 1 || attemptCount > pointIds.length) {
    throw new Error('Attempt count must fit the displayed mark points.')
  }
  if (attemptCount === pointIds.length) return assignMarks(pointIds, totalMarks, distribution)
  // Reuse the point identity and total validation without summing unattempted alternatives.
  assignMarks(pointIds, pointIds.length, { mode: 'equal' })
  assignMarks(['attempt-total'], totalMarks, { mode: 'equal' })
  if (totalMarks % attemptCount !== 0) {
    throw new Error('Equal marks need a whole, positive mark for every attempted point. Change the total.')
  }
  const marks = totalMarks / attemptCount
  if (distribution.mode === 'custom') {
    const keys = Object.keys(distribution.marksByPoint)
    if (keys.length !== pointIds.length || keys.some((key) => !pointIds.includes(key))) {
      throw new Error('Assign a mark to every point and no unrelated point.')
    }
    if (pointIds.some((id) => distribution.marksByPoint[id] !== marks)) {
      throw new Error('Optional points must carry equal whole marks so every permitted attempt has the question total.')
    }
  }
  return { totalMarks, pointMarks: pointIds.map((pointId) => ({ pointId, marks })) }
}
