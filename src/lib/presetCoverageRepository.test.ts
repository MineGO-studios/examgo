import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('./supabase', () => ({ supabase: { rpc: mocks.rpc } }))
import { getPresetCoverageReport, parsePresetCoverageReport, summarizePresetCoverage } from './presetCoverageRepository'

function report() {
  return { schemaVersion: 1 as const, captureScope: 'unit-one-simple' as const, difficultyCalibrated: false as const,
    units: [1, 2, 3, 4].map(unit => ({ unit, publishedQuestionCount: 4, knownIdeaQuestionCount: unit === 1 ? 3 : 0,
      capturableGroupCount: unit === 1 ? 1 : 0, capturableGroupPointCount: unit === 1 ? 2 : 0,
      capturableStandaloneCount: unit === 1 ? 1 : 0,
      breakdown: [{ lesson: '1', type: 'short-answer' as const, difficulty: 'medium' as const, publishedCount: 4,
        knownIdeaCount: unit === 1 ? 3 : 0 }] })) }
}
beforeEach(() => vi.resetAllMocks())

it('validates aggregate-only governed coverage and keeps publications separate from capture supply', () => {
  const input = report()
  expect(parsePresetCoverageReport(input)).toEqual(input)
  expect(summarizePresetCoverage(input, { period: 'mid-year' }).missingCaptureUnits).toEqual([2, 3])
  expect(summarizePresetCoverage(input, { period: 'mid-year', includeRevisionUnit: true }).unknownIdeaCount).toBe(13)
  expect(summarizePresetCoverage(input, { period: 'first-term-month-one' }).missingCaptureUnits).toEqual([])
  expect(summarizePresetCoverage(input, { period: 'first-term-month-two' }).missingCaptureUnits).toEqual([2])
})

it('rejects private fields, forged calibration and unsupported capture readiness', () => {
  expect(() => parsePresetCoverageReport({ ...report(), publisherOwnerId: 'hidden' })).toThrow('fields')
  expect(() => parsePresetCoverageReport({ ...report(), difficultyCalibrated: true })).toThrow('scope')
  const input = report()
  input.units[1].knownIdeaQuestionCount = 2
  input.units[1].breakdown[0].knownIdeaCount = 2
  input.units[1].capturableGroupCount = 1
  input.units[1].capturableGroupPointCount = 2
  expect(() => parsePresetCoverageReport(input)).toThrow('capture scope')
})

it('rejects incomplete, repeated, inconsistent and out-of-range aggregate rows', () => {
  expect(() => parsePresetCoverageReport({ ...report(), units: report().units.slice(0, 3) })).toThrow('scope')
  const duplicate = report(); duplicate.units[1].unit = 1
  expect(() => parsePresetCoverageReport(duplicate)).toThrow('units')
  const totals = report(); totals.units[0].publishedQuestionCount = 5
  expect(() => parsePresetCoverageReport(totals)).toThrow('totals')
  const repeated = report(); repeated.units[0].breakdown.push(repeated.units[0].breakdown[0])
  expect(() => parsePresetCoverageReport(repeated)).toThrow('repeated')
  const invalid = report(); invalid.units[0].capturableGroupPointCount = -1
  expect(() => parsePresetCoverageReport(invalid)).toThrow('count')
  const excess = report(); excess.units[0].capturableGroupPointCount = 4
  expect(() => parsePresetCoverageReport(excess)).toThrow('totals')
})

it('uses only the aggregate RPC and surfaces denial or unavailable service instead of inventing zero supply', async () => {
  mocks.rpc.mockResolvedValue({ data: report(), error: null })
  await expect(getPresetCoverageReport()).resolves.toEqual(report())
  expect(mocks.rpc).toHaveBeenCalledWith('get_grade_six_preset_coverage', {})
  mocks.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'private debug' } })
  await expect(getPresetCoverageReport()).rejects.toThrow('Sign in')
  mocks.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'private debug' } })
  await expect(getPresetCoverageReport()).rejects.toThrow('unavailable')
})
