export const QUESTIONS_PER_ESTIMATED_PAGE = 8

export type PageTarget = 1 | 2 | 3 | 4 | 5

export function estimateQuestionPages(questionCount: number): number {
  return Math.max(
    1,
    Math.ceil(questionCount / QUESTIONS_PER_ESTIMATED_PAGE),
  )
}

export function getPageTargetWarning(
  questionCount: number,
  pageTarget: PageTarget,
): string | null {
  const estimatedPages = estimateQuestionPages(questionCount)

  if (estimatedPages <= pageTarget) {
    return null
  }

  return (
    `This selection is estimated at ${estimatedPages} question pages, ` +
    `which exceeds the ${pageTarget}-page target. Reduce the question ` +
    'quantity or increase the target before printing.'
  )
}
