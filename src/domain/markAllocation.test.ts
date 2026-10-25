import { describe, expect, it } from 'vitest'
import { assignAttemptMarks, assignMarks, passagePointIds, questionPointIds } from './markAllocation'
import type { DomainQuestion } from './questionDomain'

const base = { id: 'q-1', type: 'binary', content: { type: 'binary', labelMode: 'true-false' } }

describe('exam-time mark allocation', () => {
  it('uses one point for simple and writing questions, and separate answerable parts for compounds', () => {
    expect(questionPointIds(base as DomainQuestion)).toEqual(['q-1'])
    expect(questionPointIds({ ...base, type: 'extended-writing' } as unknown as DomainQuestion)).toEqual(['q-1'])
    expect(questionPointIds({ ...base, type: 'completion', content: { blankIds: ['a', 'b'] } } as DomainQuestion))
      .toEqual(['q-1:blank:a', 'q-1:blank:b'])
    expect(questionPointIds({ ...base, type: 'matching', content: { left: [{ id: 'a' }, { id: 'b' }] } } as DomainQuestion))
      .toEqual(['q-1:pair:a', 'q-1:pair:b'])
    expect(passagePointIds('group-1', ['q-1', 'q-2'])).toEqual([
      'group-1:child:q-1', 'group-1:child:q-2',
    ])
  })

  it('splits evenly only into positive whole marks', () => {
    expect(assignMarks(['a', 'b'], 6, { mode: 'equal' })).toEqual({
      totalMarks: 6, pointMarks: [{ pointId: 'a', marks: 3 }, { pointId: 'b', marks: 3 }],
    })
    expect(() => assignMarks(['a', 'b'], 5, { mode: 'equal' })).toThrow(/whole/)
    expect(() => assignMarks(['a', 'b'], 1, { mode: 'equal' })).toThrow(/positive/)
  })

  it('accepts a teacher-selected 2+3 split and rejects missing or incorrect totals', () => {
    expect(assignMarks(['a', 'b'], 5, { mode: 'custom', marksByPoint: { a: 2, b: 3 } }))
      .toMatchObject({ totalMarks: 5, pointMarks: [{ marks: 2 }, { marks: 3 }] })
    expect(() => assignMarks(['a', 'b'], 5, { mode: 'custom', marksByPoint: { a: 2 } }))
      .toThrow(/every point/)
    expect(() => assignMarks(['a', 'b'], 5, { mode: 'custom', marksByPoint: { a: 2, b: 2 } }))
      .toThrow(/add up/)
    expect(() => assignMarks(['a', 'b'], 5, { mode: 'custom', marksByPoint: { a: 2, b: 2.5 } }))
      .toThrow(/whole/)
  })

  it('rejects duplicate point identities and invalid totals', () => {
    expect(() => assignMarks(['a', 'a'], 2, { mode: 'equal' })).toThrow(/distinct/)
    expect(() => assignMarks(['a'], 0, { mode: 'equal' })).toThrow(/whole number/)
  })

  it('counts only attempted points and keeps every permitted choice worth the same total', () => {
    expect(assignAttemptMarks(['a', 'b', 'c'], 4, 2, { mode: 'equal' })).toEqual({
      totalMarks: 4, pointMarks: [{ pointId: 'a', marks: 2 }, { pointId: 'b', marks: 2 }, { pointId: 'c', marks: 2 }],
    })
    expect(assignAttemptMarks(['a', 'b'], 5, 2, { mode: 'custom', marksByPoint: { a: 2, b: 3 } }).totalMarks).toBe(5)
    expect(() => assignAttemptMarks(['a', 'b', 'c'], 5, 2, { mode: 'equal' })).toThrow(/whole/)
    expect(() => assignAttemptMarks(['a', 'b'], 5, 1, { mode: 'custom', marksByPoint: { a: 2, b: 3 } })).toThrow(/Optional/)
    expect(() => assignAttemptMarks(['a', 'b'], 5, 1, { mode: 'custom', marksByPoint: { a: 5 } })).toThrow(/every point/)
    expect(() => assignAttemptMarks(['a', 'a'], 4, 1, { mode: 'equal' })).toThrow(/distinct/)
    expect(() => assignAttemptMarks(['a', 'b'], 4, 0, { mode: 'equal' })).toThrow(/Attempt/)
  })
})
