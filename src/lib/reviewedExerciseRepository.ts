import type { Json } from '../types/database'
import type { ExamSettings } from '../types/exam'
import { canonicalJson } from './canonicalQuestionCandidates'
import { createCompoundDocumentBlobs, projectCompoundPaper } from './compoundWorkflow'
import { parsePresetExercise, presetExerciseRenderSnapshot } from './presetExerciseProjection'
import { isValidUuid } from './questions'
import { supabase } from './supabase'
import { accountLimitError } from './accountLimits'
import { getSafeErrorDetails } from './safeErrorDetails'

export type ReviewedExerciseSettings = { schemaVersion: 1; grade: 6; schoolName: string; examTitle: string;
  teacherName: string; selectionSeed: number; totalMarks: number }
export type SavedReviewedExercise = { id: string; ownerId: string; sealed: true; savedAt: string;
  settings: ReviewedExerciseSettings; exercise: Json; totalMarks: number }

function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
    Object.keys(value).some(key => !keys.includes(key))) throw new Error('Invalid reviewed exercise data.')
  return value as Record<string, unknown>
}
function uuid(value: unknown): string {
  if (typeof value !== 'string' || !isValidUuid(value)) throw new Error('Invalid reviewed exercise identity.')
  return value
}
function checkedSettings(value: unknown): ReviewedExerciseSettings {
  const s = object(value, ['schemaVersion', 'grade', 'schoolName', 'examTitle', 'teacherName', 'selectionSeed', 'totalMarks'])
  if (s.schemaVersion !== 1 || s.grade !== 6 || typeof s.schoolName !== 'string' || !s.schoolName.trim() || s.schoolName.length > 80 ||
    typeof s.examTitle !== 'string' || !s.examTitle.trim() || s.examTitle.length > 80 || typeof s.teacherName !== 'string' || s.teacherName.length > 80 ||
    !Number.isSafeInteger(s.selectionSeed) || Number(s.selectionSeed) < 0 || Number(s.selectionSeed) > 4294967295 ||
    !Number.isSafeInteger(s.totalMarks) || Number(s.totalMarks) < 1 || Number(s.totalMarks) > 1000) throw new Error('Complete paper identity, seed and whole total marks are required.')
  return structuredClone(s) as ReviewedExerciseSettings
}
function renderContext(exercise: unknown, ownerId: string, settings: ReviewedExerciseSettings) {
  const parsed = parsePresetExercise(exercise, ownerId)
  const snapshot = presetExerciseRenderSnapshot(exercise, ownerId, settings.selectionSeed, settings.totalMarks)
  const units = [...new Set(parsed.members.map(member => member.question.unit))].sort()
  // These legacy adapter fields are not scoring inputs; branch marks come from the snapshot.
  const paperSettings: ExamSettings = { schoolName: settings.schoolName, examTitle: settings.examTitle, teacherName: settings.teacherName,
    grade: 6, unit: units[0], selectionSeed: settings.selectionSeed, marksPerQuestion: 1, questionCount: parsed.members.length }
  projectCompoundPaper(snapshot, paperSettings, 'Answer questions as instructed.', units)
  return { snapshot, paperSettings, units }
}
export function parseSavedReviewedExercise(value: unknown): SavedReviewedExercise {
  const s = object(value, ['id', 'ownerId', 'sealed', 'savedAt', 'settings', 'exercise', 'totalMarks'])
  const ownerId = uuid(s.ownerId), settings = checkedSettings(s.settings)
  if (s.sealed !== true || typeof s.savedAt !== 'string' || !Number.isFinite(Date.parse(s.savedAt)) || s.totalMarks !== settings.totalMarks) {
    throw new Error('Saved exercise seal, date or scoring disagrees with the teacher request.')
  }
  renderContext(s.exercise, ownerId, settings)
  return { id: uuid(s.id), ownerId, sealed: true, savedAt: s.savedAt, settings,
    exercise: JSON.parse(canonicalJson(s.exercise)) as Json, totalMarks: settings.totalMarks }
}
function fail(code?: string): never {
  if (code === '42501') throw new Error('Sign in with the teacher account that owns this paper.')
  if (code === '40001' || code === '23505') throw new Error('Source or request changed. Keep this review and retry with the same request identity only for unchanged contents.')
  if (code === '40P01' || code === '55P03') throw new Error('Source review is busy. Keep this request identity and retry unchanged contents.')
  throw new Error('Exercise could not be saved or reopened. Keep the reviewed contents and request identity for retry.')
}
export async function getReviewedPresetExercises(ownerId: string): Promise<Json[]> {
  uuid(ownerId)
  let after: string | null = null
  const result: Json[] = []
  for (let page = 0; page < 50; page++) {
    const { data, error } = await supabase.rpc('get_reviewed_preset_exercises', { p_after: after, p_limit: 100 })
    if (error) { console.error('[ExamGO reviewed source read]', getSafeErrorDetails(error)); fail(error.code) }
    const response = object(data, ['schemaVersion', 'exercises', 'nextCursor'])
    if (response.schemaVersion !== 1 || !Array.isArray(response.exercises) || response.exercises.length > 100) throw new Error('Invalid reviewed exercise page.')
    for (const exercise of response.exercises) {
      const parsed = parsePresetExercise(exercise, ownerId)
      if (after && parsed.id <= after) throw new Error('Reviewed exercise page did not advance.')
      after = parsed.id
      result.push(JSON.parse(canonicalJson(exercise)) as Json)
    }
    if (response.nextCursor === null) return result
    if (!response.exercises.length || uuid(response.nextCursor) !== after) throw new Error('Reviewed exercise cursor does not match the returned source page.')
  }
  throw new Error('Reviewed source pool exceeds the bounded read limit.')
}
export async function finalizeReviewedExercise(requestId: string, ownerId: string, settings: ReviewedExerciseSettings,
  exercise: unknown): Promise<SavedReviewedExercise> {
  uuid(requestId); uuid(ownerId)
  const checked = checkedSettings(settings)
  renderContext(exercise, ownerId, checked)
  const expected = JSON.parse(canonicalJson(exercise)) as Json
  const { data, error } = await supabase.rpc('finalize_reviewed_preset_exercise', {
    p_request_id: requestId, p_settings: checked as unknown as Json, p_exercise: expected,
  })
  if (error) { const limit = accountLimitError(error); if (limit) throw limit; fail(error.code) }
  const saved = parseSavedReviewedExercise(data)
  if (saved.ownerId !== ownerId || canonicalJson(saved.settings) !== canonicalJson(checked) ||
    canonicalJson(saved.exercise) !== canonicalJson(expected)) throw new Error('Saved exercise differs from the reviewed source or teacher intent. No documents were generated.')
  return saved
}
export async function getReviewedExerciseExam(id: string, ownerId: string): Promise<SavedReviewedExercise> {
  uuid(id); uuid(ownerId)
  const { data, error } = await supabase.rpc('get_reviewed_preset_exercise_exam', { p_id: id })
  if (error) fail(error.code)
  const saved = parseSavedReviewedExercise(data)
  if (saved.id !== id || saved.ownerId !== ownerId) throw new Error('Saved exercise belongs to a different paper or teacher.')
  return saved
}
export async function createReviewedExerciseDocumentBlobs<T extends Blob | ArrayBuffer>(saved: SavedReviewedExercise,
  examTemplate: T, keyTemplate: T): Promise<{ exam: T; answerKey: T }> {
  const checked = parseSavedReviewedExercise(saved)
  const { snapshot, paperSettings, units } = renderContext(checked.exercise, checked.ownerId, checked.settings)
  return createCompoundDocumentBlobs(snapshot, paperSettings, 'Answer questions as instructed.', examTemplate, keyTemplate, units)
}
