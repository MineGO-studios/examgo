import { describe, expect, it } from 'vitest'
import type { DomainQuestion } from '../domain/questionDomain'
import { assertGradeSixPaperCoverage, gradeSixCoverageCandidates, resolveGradeSixCoverage } from './gradeSixCoverage'

function question(unit: number, id = `question-${unit}`, revision = 1): DomainQuestion {
  return { id, ownerId: 'owner', bankId: 'bank', externalId: id, unit, lesson: '1',
    difficulty: 'medium', prompt: 'Name a family member.', marks: null, isActive: true, revision,
    type: 'short-answer', schemaVersion: 1, content: { type: 'short-answer', schemaVersion: 1 },
    answer: { type: 'short-answer', schemaVersion: 1, canonicalAnswer: 'Father.' } }
}

describe('initial Grade 6 curriculum coverage', () => {
  it('uses separate first-term monthly units and mid-year with optional revision', () => {
    expect(resolveGradeSixCoverage({ period: 'first-term-month-one' }).units).toEqual([1])
    expect(resolveGradeSixCoverage({ period: 'first-term-month-two' }).units).toEqual([2])
    expect(resolveGradeSixCoverage({ period: 'mid-year' }).units).toEqual([1, 2, 3])
    expect(resolveGradeSixCoverage({ period: 'mid-year', includeRevisionUnit: true }).units).toEqual([1, 2, 3, 4])
  })

  it('defaults to random, without secretly requiring every unit', () => {
    expect(resolveGradeSixCoverage({ period: 'mid-year' }).requiredUnits).toEqual([])
    expect(() => assertGradeSixPaperCoverage([question(1)], { period: 'mid-year', includeRevisionUnit: true })).not.toThrow()
  })

  it('requires all selected units only in the teacher-selected representation mode', () => {
    const settings = { period: 'mid-year' as const, includeRevisionUnit: true, representation: 'each-selected-unit' as const }
    expect(() => assertGradeSixPaperCoverage([question(1), question(2), question(3)], settings)).toThrow('Missing: 4')
    expect(() => assertGradeSixPaperCoverage([1, 2, 3, 4].map(unit => question(unit)), settings)).not.toThrow()
    expect(() => assertGradeSixPaperCoverage([question(1)], { ...settings, includeRevisionUnit: false })).toThrow('Missing: 2, 3')
  })

  it.each([
    null, [], { period: 'final' }, { period: 'second-term-month-one' }, { period: ['mid-year'] },
    { period: 'mid-year', includeRevisionUnit: 'yes' },
    { period: 'first-term-month-two', includeRevisionUnit: true },
    { period: 'mid-year', representation: 'equal-marks' }, { period: 'mid-year', representation: null },
    { period: 'mid-year', totalMarks: 60 }, { period: 'mid-year', branches: 9 },
  ])('rejects unsupported coverage input %j without coupling paper shape', value => {
    expect(() => resolveGradeSixCoverage(value)).toThrow()
  })

  it('resolves canonical identity before filtering units and does not revive withdrawn revisions', () => {
    const old = question(1, 'shared')
    const moved = question(5, 'shared', 2)
    const withdrawn = { ...question(1, 'withdrawn', 2), isActive: false }
    const rows = [old, moved, question(1, 'withdrawn'), withdrawn, question(1, 'kept'), question(1, 'kept')]
    const before = structuredClone(rows)
    expect(gradeSixCoverageCandidates(rows, { period: 'first-term-month-one' }).map(q => q.id)).toEqual(['kept'])
    expect(gradeSixCoverageCandidates([...rows].reverse(), { period: 'first-term-month-one' }).map(q => q.id)).toEqual(['kept'])
    expect(rows).toEqual(before)
    expect(() => gradeSixCoverageCandidates([old, { ...old, prompt: 'Conflicting text.' }], { period: 'mid-year' })).toThrow('Conflicting contents')
  })

  it('rejects empty, out-of-scope, inactive and repeated canonical questions in a selected paper', () => {
    const settings = { period: 'mid-year' as const }
    expect(() => assertGradeSixPaperCoverage([], settings)).toThrow('at least one')
    expect(() => assertGradeSixPaperCoverage([question(4)], settings)).toThrow('outside')
    expect(() => assertGradeSixPaperCoverage([{ ...question(1), isActive: false }], settings)).toThrow('inactive')
    expect(() => assertGradeSixPaperCoverage([question(1), question(2, 'question-1', 2)], settings)).toThrow('more than once')
    expect(() => assertGradeSixPaperCoverage([question(2)], { period: 'first-term-month-one' })).toThrow('outside')
  })
})
