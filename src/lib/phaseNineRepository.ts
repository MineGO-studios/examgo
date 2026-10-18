import type { Json } from '../types/database'
import { supabase } from './supabase'
import { canonicalJson } from './canonicalQuestionCandidates'
import { parsePhaseNineTeacherIntent, type PhaseNineTeacherIntent } from './phaseNineTeacherWorkflow'
import { reportSafeError } from './safeErrorDetails'
import { accountLimitError } from './accountLimits'

export interface SavedPhaseNineWorkflow {
  id: string
  version: number
  finalized: boolean
  savedAt: string
  intent: PhaseNineTeacherIntent
}

function parseSaved(value: unknown): SavedPhaseNineWorkflow {
  if (!value || typeof value !== 'object') throw new Error('The saved exam response is incomplete. Reopen your saved work before retrying.')
  const row = value as Record<string, unknown>
  if (typeof row.id !== 'string' || !Number.isSafeInteger(row.version) || (row.version as number) < 1 || typeof row.finalized !== 'boolean' || typeof row.savedAt !== 'string') throw new Error('The saved exam response has an unsupported shape.')
  return { id: row.id, version: row.version as number, finalized: row.finalized, savedAt: row.savedAt, intent: parsePhaseNineTeacherIntent(row.workflow) }
}

/** `unknown` replaces the save-specific fallback, e.g. for list loads. */
function persistenceError(code?: string, unknown?: () => string): Error {
  if (code === 'PGRST202' || code === '42883') return new Error('Structured exam storage is not available in this environment yet. Your preview is preserved; do not finalize until the reviewed database update is installed.')
  if (code === '42501' || code === 'PGRST301') return new Error('Your session cannot access this exam. Sign in again and reopen your saved work.')
  if (code === 'PT409' || code === '40001') return new Error('This draft or its questions changed. Reopen the draft and review current questions before saving or finalizing.')
  if (code === '23505') return new Error('This retry identity was already used for different contents. Reopen saved work before starting a new save.')
  return new Error(unknown ? unknown() : 'The save could not be confirmed. Retry the same request or reopen saved work; no download was started.')
}

export async function savePhaseNineDraft(intent: PhaseNineTeacherIntent, id: string, expectedVersion: number, requestId: string): Promise<SavedPhaseNineWorkflow> {
  const payload = parsePhaseNineTeacherIntent(intent)
  const { data, error } = await supabase.rpc('save_phase_nine_draft', {
    p_id: id, p_expected_version: expectedVersion, p_request_id: requestId, p_workflow: payload as unknown as Json,
  })
  if (error) throw accountLimitError(error) ?? persistenceError(error.code)
  const saved = parseSaved(data)
  if (saved.id !== id || saved.finalized || saved.version !== expectedVersion + 1 || canonicalJson(saved.intent) !== canonicalJson(payload)) throw new Error('Saved draft readback differs from the request. Keep this preview and reopen saved work.')
  return saved
}

export async function finalizePhaseNineExam(draft: SavedPhaseNineWorkflow, requestId: string): Promise<SavedPhaseNineWorkflow> {
  if (draft.finalized) return draft
  const payload = parsePhaseNineTeacherIntent(draft.intent)
  const { data, error } = await supabase.rpc('finalize_phase_nine_exam', {
    p_request_id: requestId, p_draft_id: draft.id, p_expected_version: draft.version, p_workflow: payload as unknown as Json,
  })
  if (error) throw accountLimitError(error) ?? persistenceError(error.code)
  const saved = parseSaved(data)
  if (!saved.finalized || canonicalJson(saved.intent) !== canonicalJson(payload)) throw new Error('Finalized readback differs from the reviewed exam. No document was generated; reopen saved work.')
  return saved
}

export async function getPhaseNineWorkflows(): Promise<SavedPhaseNineWorkflow[]> {
  const { data, error } = await supabase.rpc('get_phase_nine_workflows', {})
  if (error) throw persistenceError(error.code, () => reportSafeError(error, 'Saved structured exams could not be loaded. Retry, or reopen My papers.'))
  if (!Array.isArray(data)) throw new Error('Saved structured exam list is invalid.')
  return data.map(parseSaved)
}
