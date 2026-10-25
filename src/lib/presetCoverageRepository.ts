import type { QuestionDifficulty, QuestionType } from '../domain/questionDomain'
import { resolveGradeSixCoverage, type GradeSixCoverageSettings } from './gradeSixCoverage'
import { supabase } from './supabase'

export type PresetCoverageBreakdown = {
  lesson: string
  type: QuestionType
  difficulty: QuestionDifficulty
  publishedCount: number
  knownIdeaCount: number
}
export type PresetUnitCoverage = {
  unit: number
  publishedQuestionCount: number
  knownIdeaQuestionCount: number
  capturableGroupCount: number
  capturableGroupPointCount: number
  capturableStandaloneCount: number
  breakdown: PresetCoverageBreakdown[]
}
export type PresetCoverageReport = {
  schemaVersion: 1
  captureScope: 'unit-one-simple'
  difficultyCalibrated: false
  units: PresetUnitCoverage[]
}
const questionTypes: readonly QuestionType[] = ['multiple-choice', 'binary', 'short-answer', 'completion',
  'odd-word', 'matching', 'word-relationship', 'rewrite', 'extended-writing']
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
    Object.keys(value).length !== keys.length || Object.keys(value).some(key => !keys.includes(key))) {
    throw new Error('Invalid coverage report fields.')
  }
  return value as Record<string, unknown>
}
function count(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > 1_000_000) {
    throw new Error('Invalid coverage count.')
  }
  return value as number
}
export function parsePresetCoverageReport(value: unknown): PresetCoverageReport {
  const root = record(value, ['schemaVersion', 'captureScope', 'difficultyCalibrated', 'units'])
  if (root.schemaVersion !== 1 || root.captureScope !== 'unit-one-simple' || root.difficultyCalibrated !== false ||
    !Array.isArray(root.units) || root.units.length !== 4) throw new Error('Unsupported coverage report version or scope.')
  const units = root.units.map((value, index): PresetUnitCoverage => {
    const row = record(value, ['unit', 'publishedQuestionCount', 'knownIdeaQuestionCount', 'capturableGroupCount',
      'capturableGroupPointCount', 'capturableStandaloneCount', 'breakdown'])
    if (row.unit !== index + 1 || !Array.isArray(row.breakdown) || row.breakdown.length > 1000) {
      throw new Error('Invalid coverage units or breakdown.')
    }
    const keys = new Set<string>()
    const breakdown = row.breakdown.map((value): PresetCoverageBreakdown => {
      const item = record(value, ['lesson', 'type', 'difficulty', 'publishedCount', 'knownIdeaCount'])
      if (typeof item.lesson !== 'string' || !item.lesson.trim() || item.lesson.length > 100 ||
        !questionTypes.includes(item.type as QuestionType) || typeof item.difficulty !== 'string' ||
        !['easy', 'medium', 'hard'].includes(item.difficulty)) {
        throw new Error('Invalid lesson, type or difficulty in coverage report.')
      }
      const publishedCount = count(item.publishedCount), knownIdeaCount = count(item.knownIdeaCount)
      const key = JSON.stringify([item.lesson, item.type, item.difficulty])
      if (!publishedCount || knownIdeaCount > publishedCount || keys.has(key)) throw new Error('Invalid or repeated coverage breakdown.')
      keys.add(key)
      return { lesson: item.lesson, type: item.type as QuestionType, difficulty: item.difficulty as QuestionDifficulty,
        publishedCount, knownIdeaCount }
    })
    const parsed: PresetUnitCoverage = { unit: row.unit as number, breakdown,
      publishedQuestionCount: count(row.publishedQuestionCount), knownIdeaQuestionCount: count(row.knownIdeaQuestionCount),
      capturableGroupCount: count(row.capturableGroupCount), capturableGroupPointCount: count(row.capturableGroupPointCount),
      capturableStandaloneCount: count(row.capturableStandaloneCount) }
    if (breakdown.reduce((n, item) => n + item.publishedCount, 0) !== parsed.publishedQuestionCount ||
      breakdown.reduce((n, item) => n + item.knownIdeaCount, 0) !== parsed.knownIdeaQuestionCount ||
      parsed.knownIdeaQuestionCount > parsed.publishedQuestionCount ||
      parsed.capturableGroupCount > parsed.capturableGroupPointCount ||
      (parsed.capturableGroupCount === 0) !== (parsed.capturableGroupPointCount === 0) ||
      parsed.capturableGroupPointCount > parsed.capturableGroupCount * 50 ||
      parsed.capturableGroupPointCount + parsed.capturableStandaloneCount > parsed.knownIdeaQuestionCount ||
      (parsed.unit !== 1 && (parsed.capturableGroupCount || parsed.capturableGroupPointCount || parsed.capturableStandaloneCount))) {
      throw new Error('Coverage totals disagree with the current capture scope.')
    }
    return parsed
  })
  return { schemaVersion: 1, captureScope: 'unit-one-simple', difficultyCalibrated: false, units }
}

// Inventory gaps are not proof of full-paper feasibility or calibrated difficulty.
export function summarizePresetCoverage(report: PresetCoverageReport, settings: GradeSixCoverageSettings) {
  const checked = parsePresetCoverageReport(report), coverage = resolveGradeSixCoverage(settings)
  const units = checked.units.filter(unit => coverage.units.includes(unit.unit))
  return { coverage, units,
    missingCaptureUnits: units.filter(unit => unit.capturableGroupPointCount + unit.capturableStandaloneCount === 0).map(unit => unit.unit),
    unknownIdeaCount: units.reduce((n, unit) => n + unit.publishedQuestionCount - unit.knownIdeaQuestionCount, 0) }
}

export async function getPresetCoverageReport(): Promise<PresetCoverageReport> {
  const { data, error } = await supabase.rpc('get_grade_six_preset_coverage', {})
  if (error) throw new Error(error.code === '42501' ? 'Sign in to view preset coverage.' : 'Coverage report unavailable. Retry later.')
  return parsePresetCoverageReport(data)
}
