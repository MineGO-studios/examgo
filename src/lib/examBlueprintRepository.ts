import { isUuid } from '../domain/questionDomain'
import type { Json } from '../types/database'
import { canonicalJson } from './canonicalQuestionCandidates'
import { parseExamBlueprintIntent, type ExamBlueprintIntent } from './examBlueprintWorkflow'
import { supabase } from './supabase'
import { accountLimitError } from './accountLimits'

export interface SavedExamBlueprint {
  id: string
  version: number
  savedAt: string
  intent: ExamBlueprintIntent
}

export class BlueprintStorageError extends Error {
  readonly confirmedRejected: boolean
  constructor(message: string, confirmedRejected: boolean) { super(message); this.confirmedRejected = confirmedRejected }
}

function parseSaved(value: unknown): SavedExamBlueprint {
  if (!value || typeof value !== 'object') throw new Error('Saved blueprint response is incomplete. Reopen saved work.')
  const row = value as Record<string, unknown>
  if (typeof row.id !== 'string' || !isUuid(row.id) || !Number.isInteger(row.version) || (row.version as number) < 1 || row.finalized !== false ||
    typeof row.savedAt !== 'string' || !Number.isFinite(Date.parse(row.savedAt))) {
    throw new Error('Saved blueprint response is invalid. Reopen saved work.')
  }
  const intent = parseExamBlueprintIntent(row.workflow)
  if (intent.blueprint.version !== row.version) throw new Error('Saved blueprint versions differ. Reopen saved work.')
  return { id: row.id, version: row.version as number, savedAt: row.savedAt, intent }
}

function storageError(code?: string): Error {
  if (code === 'PGRST202' || code === '42883') return new BlueprintStorageError('Blueprint storage is unavailable here. Keep this page open until the reviewed database update is installed.', true)
  if (code === '42501' || code === 'PGRST301') return new BlueprintStorageError('Your session cannot access this blueprint or an active selected bank. Sign in again and review saved work.', true)
  if (code === '40001') return new BlueprintStorageError('This blueprint changed in another session. Reopen its latest saved version before editing.', true)
  if (code === '23505') return new BlueprintStorageError('This save request already identifies different contents. Reopen saved work before editing.', true)
  if (code === '23514') return new BlueprintStorageError('Blueprint details, counts, instructions or marks are invalid. Review the complete configuration.', true)
  return new BlueprintStorageError('The blueprint save could not be confirmed. Retry the same save before editing, or reopen saved work.', false)
}

export async function saveExamBlueprint(intent: ExamBlueprintIntent, id: string, expectedVersion: number, requestId: string): Promise<SavedExamBlueprint> {
  const payload = parseExamBlueprintIntent(intent)
  if (!isUuid(id) || !isUuid(requestId) || !Number.isInteger(expectedVersion) || expectedVersion < 0 ||
    expectedVersion >= 2147483647 || payload.blueprint.version !== expectedVersion + 1) throw new Error('Blueprint save identity or version is invalid.')
  const { data, error } = await supabase.rpc('save_exam_blueprint', {
    p_id: id, p_expected_version: expectedVersion, p_request_id: requestId, p_workflow: payload as unknown as Json,
  })
  if (error) throw accountLimitError(error) ?? storageError(error.code)
  const saved = parseSaved(data)
  if (saved.id !== id || saved.version !== expectedVersion + 1 || canonicalJson(saved.intent) !== canonicalJson(payload)) {
    throw new Error('Saved blueprint readback differs from the requested configuration. Reopen saved work before editing.')
  }
  return saved
}

export async function getExamBlueprints(ownerId: string, before?: Pick<SavedExamBlueprint, 'id' | 'savedAt'>): Promise<SavedExamBlueprint[]> {
  if (!isUuid(ownerId) || before && (!isUuid(before.id) || !Number.isFinite(Date.parse(before.savedAt)))) throw new Error('Blueprint page identity is invalid.')
  const { data, error } = await supabase.rpc('get_exam_blueprints', { p_before: before?.savedAt ?? null, p_before_id: before?.id ?? null, p_limit: 25 })
  if (error) throw storageError(error.code)
  if (!Array.isArray(data) || data.length > 25) throw new Error('Saved blueprint list is invalid.')
  const rows = data.map(parseSaved)
  if (new Set(rows.map(row => row.id)).size !== rows.length || rows.some(row => row.intent.blueprint.ownerId !== ownerId)) {
    throw new Error('Saved blueprint list contains inaccessible or repeated configurations.')
  }
  return rows
}
