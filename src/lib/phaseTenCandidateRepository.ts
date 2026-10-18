import type { Json } from '../types/database'
import { canonicalJson } from './canonicalQuestionCandidates'
import { parsePhaseTenTeacherIntent, type PhaseTenTeacherIntent } from './phaseTenTeacherWorkflow'
import { supabase } from './supabase'
import { reportSafeError } from './safeErrorDetails'
import { accountLimitError } from './accountLimits'

export interface SavedPhaseTenCandidate {
  id: string
  version: number
  finalized: boolean
  savedAt: string
  intent: PhaseTenTeacherIntent
}

function parseSaved(value: unknown): SavedPhaseTenCandidate {
  if (!value || typeof value !== 'object') throw new Error('Saved candidate response is incomplete. Reopen the paper before retrying.')
  const row = value as Record<string, unknown>
  if (typeof row.id !== 'string' || !Number.isSafeInteger(row.version) || (row.version as number) < 1 ||
    typeof row.finalized !== 'boolean' || typeof row.savedAt !== 'string') throw new Error('Saved candidate response has an unsupported shape.')
  return { id: row.id, version: row.version as number, finalized: row.finalized,
    savedAt: row.savedAt, intent: parsePhaseTenTeacherIntent(row.workflow) }
}

/** `unknown` replaces the save-specific fallback, e.g. for list loads. */
function persistenceError(code?: string, unknown?: () => string): Error {
  if (code === 'PGRST202' || code === '42883') return new Error('Candidate storage is unavailable in this environment. Keep the preview and retry after the reviewed database update.')
  if (code === '42501' || code === 'PGRST301') return new Error('Your session cannot access this paper. Sign in again and reopen saved work.')
  if (code === 'PT409' || code === '40001') return new Error('A selected question, passage or draft changed. Reopen and review before continuing.')
  if (code === '23505') return new Error('This retry identity was used for different contents. Reopen saved work before starting a new save.')
  if (code === '23514') return new Error('The candidate structure, answers or marks differ from the approved source contract. Review the paper before saving.')
  return new Error(unknown ? unknown() : 'The candidate save could not be confirmed. Retry the same request or reopen saved work.')
}

export async function savePhaseTenCandidateDraft(intent: PhaseTenTeacherIntent, id: string, expectedVersion: number, requestId: string): Promise<SavedPhaseTenCandidate> {
  const payload = parsePhaseTenTeacherIntent(intent)
  const { data, error } = await supabase.rpc('save_phase_ten_candidate_draft', {
    p_id: id, p_expected_version: expectedVersion, p_request_id: requestId, p_workflow: payload as unknown as Json,
  })
  if (error) throw accountLimitError(error) ?? persistenceError(error.code)
  const saved = parseSaved(data)
  if (saved.id !== id || saved.finalized || saved.version !== expectedVersion + 1 || canonicalJson(saved.intent) !== canonicalJson(payload)) {
    throw new Error('Saved candidate readback differs from the reviewed request. Reopen the paper.')
  }
  return saved
}

export async function finalizePhaseTenCandidate(draft: SavedPhaseTenCandidate, requestId: string): Promise<SavedPhaseTenCandidate> {
  if (draft.finalized) return draft
  const payload = parsePhaseTenTeacherIntent(draft.intent)
  const { data, error } = await supabase.rpc('finalize_phase_ten_candidate', {
    p_request_id: requestId, p_draft_id: draft.id, p_expected_version: draft.version, p_workflow: payload as unknown as Json,
  })
  if (error) throw accountLimitError(error) ?? persistenceError(error.code)
  const saved = parseSaved(data)
  if (!saved.finalized || canonicalJson(saved.intent) !== canonicalJson(payload)) {
    throw new Error('Finalized candidate readback differs from the reviewed paper. No document was generated; reopen saved work.')
  }
  return saved
}

export async function getPhaseTenCandidateWorkflows(): Promise<SavedPhaseTenCandidate[]> {
  const { data, error } = await supabase.rpc('get_phase_ten_candidate_workflows', {})
  if (error) throw persistenceError(error.code, () => reportSafeError(error, 'Saved complete papers could not be loaded. Retry, or reopen My papers.'))
  if (!Array.isArray(data)) throw new Error('Saved candidate list is invalid.')
  return data.map(parseSaved)
}
