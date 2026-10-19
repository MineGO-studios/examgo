import { isUuid } from '../domain/questionDomain'
import type { Json } from '../types/database'
import { canonicalJson } from './canonicalQuestionCandidates'
import { parseBlueprintPaperIntent, type BlueprintPaperIntent } from './examBlueprintPaper'
import { BlueprintStorageError, type SavedExamBlueprint } from './examBlueprintRepository'
import { supabase } from './supabase'
import { accountLimitError } from './accountLimits'

export interface SavedBlueprintPaper {
  id: string
  savedAt: string
  intent: BlueprintPaperIntent
}

function parseSaved(value: unknown): SavedBlueprintPaper {
  if (!value || typeof value !== 'object') throw new Error('Generated paper response is incomplete. Open saved papers before retrying.')
  const row = value as Record<string, unknown>
  if (typeof row.id !== 'string' || !isUuid(row.id) || row.version !== 1 || row.finalized !== true ||
    typeof row.savedAt !== 'string' || !Number.isFinite(Date.parse(row.savedAt))) throw new Error('Generated paper identity is invalid.')
  return { id: row.id, savedAt: row.savedAt, intent: parseBlueprintPaperIntent(row.workflow) }
}

function storageError(code?: string): BlueprintStorageError {
  const message = code === 'PGRST202' || code === '42883' ? 'Generated paper storage is unavailable until the reviewed database update is installed.'
    : code === '42501' || code === 'PGRST301' ? 'Your session cannot access this paper or its current sources. Sign in again and reopen saved work.'
      : code === '40001' ? 'The blueprint or a chosen source changed. Reload current banks and deliberately resolve the change before finalizing.'
        : code === '23505' ? 'This request or blueprint version already identifies a different generated paper. Reopen its saved paper.'
          : code === '23514' ? 'The captured questions, group, order or marks differ from the saved blueprint. Review and save the complete paper again.'
            : 'Finalization could not be confirmed. Retry this same request before editing, or open saved papers.'
  return new BlueprintStorageError(message, ['PGRST202', '42883', '42501', 'PGRST301', '40001', '23505', '23514'].includes(code ?? ''))
}

export async function finalizeBlueprintPaper(blueprint: SavedExamBlueprint, value: BlueprintPaperIntent, requestId: string): Promise<SavedBlueprintPaper> {
  const payload = parseBlueprintPaperIntent(value)
  if (!isUuid(blueprint.id) || !isUuid(requestId) || !Number.isInteger(blueprint.version) || blueprint.version < 1 ||
    canonicalJson(blueprint.intent) !== canonicalJson(payload.intent)) throw new Error('Save this exact reviewed configuration before finalizing.')
  const { data, error } = await supabase.rpc('finalize_blueprint_paper', { p_request_id: requestId, p_draft_id: blueprint.id,
    p_expected_version: blueprint.version, p_workflow: payload as unknown as Json })
  if (error) throw accountLimitError(error) ?? storageError(error.code)
  const saved = parseSaved(data)
  if (canonicalJson(saved.intent) !== canonicalJson(payload)) throw new BlueprintStorageError('Final paper readback differs. Open saved papers before editing or downloading.', false)
  return saved
}

export async function getBlueprintPapers(ownerId: string, before?: Pick<SavedBlueprintPaper, 'id' | 'savedAt'>): Promise<SavedBlueprintPaper[]> {
  if (!isUuid(ownerId) || before && (!isUuid(before.id) || !Number.isFinite(Date.parse(before.savedAt)))) throw new Error('Generated paper page identity is invalid.')
  const { data, error } = await supabase.rpc('get_blueprint_papers', { p_before: before?.savedAt ?? null, p_before_id: before?.id ?? null, p_limit: 25 })
  if (error) throw storageError(error.code)
  if (!Array.isArray(data) || data.length > 25) throw new Error('Generated paper list is invalid.')
  const rows = data.map(parseSaved)
  if (new Set(rows.map(row => row.id)).size !== rows.length || rows.some(row => row.intent.snapshot.ownerId !== ownerId)) throw new Error('Generated paper list contains inaccessible or repeated papers.')
  return rows
}
