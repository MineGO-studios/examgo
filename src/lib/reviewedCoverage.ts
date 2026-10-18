import type { Json } from '../types/database'
import { resolveGradeSixCoverage, type GradeSixCoverageSettings } from './gradeSixCoverage'
import { parsePresetCoverageReport, getPresetCoverageReport, type PresetCoverageReport } from './presetCoverageRepository'
import { parsePresetExercise } from './presetExerciseProjection'
import { getReviewedPresetExercises } from './reviewedExerciseRepository'
import { conflictsWithSelection } from './selectQuestions'
import { isValidUuid } from './questions'
import { getSafeErrorDetails } from './safeErrorDetails'

export type ReviewedCoverageOverview = {
  legacy: PresetCoverageReport
  profiles: Array<{ name: string; units: readonly number[]; exercises: number; displayedPoints: number;
    formats: number; formatsWithoutAlternative: number | null }>
  units: Array<{ unit: number; missingObservedLessons: string[];
    types: Array<{ type: string; publishedRecords: number; completeSourceRecords: number }> }>
}
const profiles: Array<[string, GradeSixCoverageSettings]> = [
  ['First term, month one', { period: 'first-term-month-one' }],
  ['First term, month two', { period: 'first-term-month-two' }],
  ['Mid-year', { period: 'mid-year' }],
  ['Mid-year with Unit 4 revision', { period: 'mid-year', includeRevisionUnit: true }],
]
const types = ['multiple-choice', 'binary', 'short-answer', 'completion', 'odd-word',
  'matching', 'word-relationship', 'rewrite', 'extended-writing']
const changed = () => { throw new Error('Reviewed coverage changed or is incomplete. Reload and try again.') }

export function summarizeReviewedCoverage(aggregate: PresetCoverageReport, values: readonly Json[], ownerId: string): ReviewedCoverageOverview {
  const legacy = parsePresetCoverageReport(aggregate)
  if (!isValidUuid(ownerId) || values.length > 5000) changed()
  const pool = values.map(value => parsePresetExercise(value, ownerId))
  if (new Set(pool.map(e => e.id)).size !== pool.length) changed()
  const records = new Map<string, typeof pool[number]['members'][number]>()
  for (const exercise of pool) for (const member of exercise.members) {
    const previous = records.get(member.question.id)
    if (previous && (previous.revisionId !== member.revisionId ||
      JSON.stringify([previous.question.unit, previous.question.lesson, previous.question.type, previous.question.difficulty]) !==
      JSON.stringify([member.question.unit, member.question.lesson, member.question.type, member.question.difficulty]))) changed()
    records.set(member.question.id, member)
  }
  const members = [...records.values()]
  const cell = (unit: number, lesson: string, type: string, difficulty: string) => JSON.stringify([unit, lesson, type, difficulty])
  const published = new Map(legacy.units.flatMap(u => u.breakdown.map(c => [cell(u.unit, c.lesson, c.type, c.difficulty), c.publishedCount] as const)))
  const ready = new Map<string, number>()
  for (const { question: q } of members) {
    const key = cell(q.unit, q.lesson, q.type, q.difficulty), count = (ready.get(key) ?? 0) + 1
    if (count > (published.get(key) ?? 0)) changed()
    ready.set(key, count)
  }
  const shape = (e: typeof pool[number]) => JSON.stringify([e.kind, e.displayedPointCount, e.attemptCount,
    e.members.map(m => [m.question.unit, m.question.type])])
  const questions = (e: typeof pool[number]) => e.members.map(m => ({ ...m.question, selectionKeys: m.selectionKeys }))
  const summary = profiles.map(([name, setting]) => {
    const { units } = resolveGradeSixCoverage(setting)
    const exercises = pool.filter(e => e.members.every(m => units.includes(m.question.unit)))
    const formats = new Map<string, typeof pool>()
    for (const exercise of exercises) {
      const key = shape(exercise)
      formats.set(key, [...(formats.get(key) ?? []), exercise])
    }
    let comparisons = 0, missing = 0, assessed = true
    for (const sources of formats.values()) {
      let found = false
      for (let i = 0; i < sources.length && !found && assessed; i++) {
        const selected = questions(sources[i])
        for (const other of sources.slice(i + 1)) {
          if (++comparisons > 50_000) { assessed = false; break }
          if (questions(other).every(q => !selected.some(p => p.id === q.id) && !conflictsWithSelection(q, selected))) { found = true; break }
        }
      }
      if (!assessed) break
      if (!found) missing++
    }
    return { name, units, exercises: exercises.length, displayedPoints: exercises.reduce((n, e) => n + e.displayedPointCount, 0),
      formats: formats.size, formatsWithoutAlternative: assessed ? missing : null }
  })
  return { legacy, profiles: summary, units: legacy.units.map(u => ({ unit: u.unit,
    missingObservedLessons: [...new Set(u.breakdown.map(c => c.lesson))].filter(lesson =>
      !members.some(m => m.question.unit === u.unit && m.question.lesson === lesson)),
    types: types.map(type => ({ type, publishedRecords: u.breakdown.filter(c => c.type === type).reduce((n, c) => n + c.publishedCount, 0),
      completeSourceRecords: members.filter(m => m.question.unit === u.unit && m.question.type === type).length })) })) }
}

export async function getReviewedCoverageOverview(ownerId: string): Promise<ReviewedCoverageOverview> {
  if (!isValidUuid(ownerId)) changed()
  const read = <T,>(stage: string, request: Promise<T>): Promise<T> => request.catch(error => {
    console.error('[ExamGO coverage read]', { stage, ...getSafeErrorDetails(error) }); throw error
  })
  const [aggregate, sources] = await Promise.all([read('aggregate', getPresetCoverageReport()), read('sources', getReviewedPresetExercises(ownerId))])
  try { return summarizeReviewedCoverage(aggregate, sources, ownerId) } catch (error) {
    console.error('[ExamGO coverage consistency]', getSafeErrorDetails(error)); throw error
  }
}
