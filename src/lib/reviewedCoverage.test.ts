import { syntheticReviewedExercises } from './fixtures/syntheticPresetExercises'
import { beforeEach, expect, it, vi } from 'vitest'
import type { Json } from '../types/database'
import type { PresetCoverageReport } from './presetCoverageRepository'
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('./supabase', () => ({ supabase: { rpc: mocks.rpc } }))
import { getReviewedCoverageOverview, summarizeReviewedCoverage } from './reviewedCoverage'

const owner = '123e4567-e89b-42d3-a456-426614174000'
const fixture = syntheticReviewedExercises
const sources = () => structuredClone(fixture) as typeof fixture
function aggregate(values = sources()): PresetCoverageReport {
  return { schemaVersion: 1, captureScope: 'unit-one-simple', difficultyCalibrated: false,
    units: [1, 2, 3, 4].map(unit => {
      const unique = new Map<string, { lesson: string; type: string; difficulty: string }>()
      for (const source of values) for (const m of source.members) if (m.question.unit === unit) unique.set(m.question.id, m.question)
      const cells = new Map<string, { lesson: string; type: string; difficulty: string; publishedCount: number; knownIdeaCount: number }>()
      for (const q of unique.values()) {
        const key = JSON.stringify([q.lesson, q.type, q.difficulty])
        const cell = cells.get(key) ?? { lesson: q.lesson, type: q.type, difficulty: q.difficulty, publishedCount: 0, knownIdeaCount: 0 }
        cell.publishedCount++; cell.knownIdeaCount++; cells.set(key, cell)
      }
      return { unit, publishedQuestionCount: unique.size, knownIdeaQuestionCount: unique.size, capturableGroupCount: 0,
        capturableGroupPointCount: 0, capturableStandaloneCount: 0, breakdown: [...cells.values()] as PresetCoverageReport['units'][number]['breakdown'] }
    }) }
}
beforeEach(() => mocks.rpc.mockReset())

it('uses whole authorized exercises rather than aggregate publications for four finite source profiles', () => {
  const input = sources(), before = JSON.stringify(input)
  const overview = summarizeReviewedCoverage(aggregate(input), input, owner)
  expect(overview.profiles.map(p => p.exercises)).toEqual([5, 0, 5, 5])
  expect(overview.profiles.map(p => p.displayedPoints)).toEqual([30, 0, 30, 30])
  expect(overview.profiles[0]).toMatchObject({ formats: 1, formatsWithoutAlternative: 1 })
  expect(overview.units[1].types.find(t => t.type === 'extended-writing')).toMatchObject({ publishedRecords: 0, completeSourceRecords: 0 })
  expect(JSON.stringify(input)).toBe(before)
  for (const secret of [input[0].id, input[0].members[0].question.prompt, 'revisionId', 'idea:', 'ownerId']) expect(JSON.stringify(overview)).not.toContain(secret)
})

it('does not split a synthetic mixed-unit source to fill a monthly or base mid-year scope', () => {
  const mixed = sources().slice(0, 1)
  mixed[0].members[0].question.unit = 4
  const overview = summarizeReviewedCoverage(aggregate(mixed), mixed, owner)
  expect(overview.profiles.map(p => p.exercises)).toEqual([0, 0, 0, 1])
  expect(overview.profiles[3].displayedPoints).toBe(6)
})

it('deduplicates shared canonical records without treating source variants as distinct alternatives', () => {
  const input = sources().slice(0, 1)
  input.push({ ...structuredClone(input[0]), id: '123e4567-e89b-42d3-a456-426614174999' })
  const overview = summarizeReviewedCoverage(aggregate(input), input, owner)
  expect(overview.profiles[0]).toMatchObject({ exercises: 2, formats: 1, formatsWithoutAlternative: 1 })
  expect(overview.units[0].types.find(t => t.type === 'multiple-choice')?.completeSourceRecords).toBe(6)
})

it('rejects duplicate groups, inconsistent aggregate placement, invalid actors and incomplete sources', () => {
  const input = sources(), report = aggregate(input)
  expect(() => summarizeReviewedCoverage(report, [...input, input[0]], owner)).toThrow('changed')
  expect(() => summarizeReviewedCoverage(report, input, 'not-a-uuid')).toThrow()
  const bad = sources(); bad[0].members[0].question.lesson = '99'
  expect(() => summarizeReviewedCoverage(report, bad, owner)).toThrow('changed')
  const missing = sources(); missing[0].attemptCount = null
  expect(() => summarizeReviewedCoverage(report, missing, owner)).toThrow()
})

it('distinguishes unassessed large headroom comparisons from a verified zero', () => {
  const sample = sources()[0]
  const input = Array.from({ length: 500 }, (_, n) => ({ ...structuredClone(sample),
    id: `123e4567-e89b-42d3-a456-${String(n).padStart(12, '0')}` }))
  const overview = summarizeReviewedCoverage(aggregate(input), input, owner)
  expect(overview.profiles[0].formatsWithoutAlternative).toBeNull()
  expect(overview.profiles[0].exercises).toBe(500)
})

it('reads only the protected aggregate and paginated public exercise endpoints, and fails closed', async () => {
  const input = sources(), report = aggregate(input)
  mocks.rpc.mockImplementation(async name => ({ data: name === 'get_grade_six_preset_coverage' ? report :
    { schemaVersion: 1, exercises: input, nextCursor: null }, error: null }))
  await expect(getReviewedCoverageOverview(owner)).resolves.toMatchObject({ profiles: [{ exercises: 5 }, { exercises: 0 }, { exercises: 5 }, { exercises: 5 }] })
  expect(mocks.rpc.mock.calls.map(call => call[0]).sort()).toEqual(['get_grade_six_preset_coverage', 'get_reviewed_preset_exercises'])
  mocks.rpc.mockReset()
  await expect(getReviewedCoverageOverview('bad')).rejects.toThrow()
  expect(mocks.rpc).not.toHaveBeenCalled()
  mocks.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'PRIVATE DETAIL' } })
  await expect(getReviewedCoverageOverview(owner)).rejects.not.toThrow('PRIVATE DETAIL')
})

it('reports empty authorized supply as zero while retaining observed publication gaps', () => {
  const overview = summarizeReviewedCoverage(aggregate(), [] as Json[], owner)
  expect(overview.profiles.every(p => p.exercises === 0 && p.displayedPoints === 0)).toBe(true)
  expect(overview.units[0].missingObservedLessons.length).toBeGreaterThan(0)
})
