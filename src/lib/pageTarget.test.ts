import { describe, expect, it } from 'vitest'
import {
  estimateQuestionPages,
  getPageTargetWarning,
} from './pageTarget'

describe('page-target estimates', () => {
  it.each([
    [1, 1],
    [8, 1],
    [9, 2],
    [50, 7],
  ])('estimates %i questions as %i pages', (questions, pages) => {
    expect(estimateQuestionPages(questions)).toBe(pages)
  })

  it('does not warn when the estimate fits the target', () => {
    expect(getPageTargetWarning(16, 2)).toBeNull()
  })

  it('warns when the estimate exceeds the target', () => {
    expect(getPageTargetWarning(17, 2)).toContain(
      'estimated at 3 question pages',
    )
  })
})
