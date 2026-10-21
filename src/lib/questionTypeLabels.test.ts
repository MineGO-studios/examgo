import { describe, expect, it } from 'vitest'
import { QUESTION_TYPE_GROUPS, questionTypeLabel, questionTypeUse } from './questionTypeLabels'

const ALL = ['multiple-choice', 'binary', 'short-answer', 'completion', 'odd-word', 'matching', 'word-relationship', 'rewrite', 'extended-writing'] as const

describe('question-type vocabulary', () => {
  it('names every canonical type in English and Arabic', () => {
    for (const type of ALL) {
      expect(questionTypeLabel(type, 'en')).not.toBe(type)
      expect(questionTypeLabel(type, 'ar')).not.toBe(type)
    }
  })

  it('puts every type in exactly one chooser group', () => {
    const grouped = QUESTION_TYPE_GROUPS.flatMap(group => group.types)
    expect([...grouped].sort()).toEqual([...ALL].sort())
  })

  it('states where each type can be used, including the unsupported case', () => {
    expect(questionTypeUse('binary')).toBe('Used in: Pick questions by type.')
    expect(questionTypeUse('rewrite')).toBe('Used in: Iraqi exercises and writing.')
    expect(questionTypeUse('matching')).toMatch(/^Not in hosted papers yet/)
  })

  it('leaves an unknown stored type visible rather than hiding it', () => {
    expect(questionTypeLabel('something-new')).toBe('something-new')
  })
})
