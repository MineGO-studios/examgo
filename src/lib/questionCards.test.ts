import { describe, expect, it } from 'vitest'
import { questionAnswerPreview, questionTypeMark, unitCounts } from './questionCards'

const base = { content: {}, answer: {}, correct_option_label: null, options: [] }

describe('question bank index cards', () => {
  it('shows the correct option with its text', () => {
    expect(questionAnswerPreview({ ...base, question_type: 'multiple-choice', content: { options: [{ label: 'A', text: 'one' }, { label: 'B', text: 'two' }] }, answer: { correctOptionLabel: 'B' } })).toBe('B · two')
  })

  it('reads true/false and yes/no answers', () => {
    expect(questionAnswerPreview({ ...base, question_type: 'binary', content: { labelMode: 'true-false' }, answer: { isTrue: false } })).toBe('False')
    expect(questionAnswerPreview({ ...base, question_type: 'binary', content: { labelMode: 'yes-no' }, answer: { isTrue: true } })).toBe('Yes')
  })

  it('falls back to a neutral line for unexpected shapes', () => {
    expect(questionAnswerPreview({ ...base, question_type: 'short-answer', answer: null })).toBe('Answer key ready')
    expect(questionAnswerPreview({ ...base, question_type: 'something-new' })).toBe('Answer key ready')
    expect(questionTypeMark('something-new')).toBe('?')
  })

  it('counts questions per unit in unit order', () => {
    expect(unitCounts([{ unit: 2, is_active: true }, { unit: 1, is_active: false }, { unit: 2, is_active: false }]))
      .toEqual([{ unit: 1, total: 1, usable: 0 }, { unit: 2, total: 2, usable: 1 }])
  })
})
