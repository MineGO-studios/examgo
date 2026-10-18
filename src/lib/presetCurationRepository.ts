import { CURATION_STATES, parsePresetProvenance, type CurationState, type PresetProvenance } from '../domain/presetCuration'
import type { Json } from '../types/database'
import { isValidUuid } from './questions'
import { supabase } from './supabase'

export type CurationRecord = {
  id: string; bankId: string; revisionId: string | null; version: number; state: CurationState
  provenance: PresetProvenance; reviewer: string | null; approvedAt: string | null; privateNotes: string | null
  unit: number | null; lesson: string | null; prompt: string | null
  currentRevision: number | null; sourceRevision: number | null; published: boolean
  publication: { reviewVersion: number; publisher: string; publishedAt: string; publicProvenance: PresetProvenance; eligible: boolean } | null
  history: { version: number; state: CurationState; actor: string; reason: string; provenance: PresetProvenance;
    privateNotes: string | null; createdAt: string }[]
}
export type CurationTarget = { revisionId: string; bankId: string; questionId: string; externalId: string;
  revision: number; unit: number; lesson: string; prompt: string; content: Record<string, unknown>; answer: Record<string, unknown>; ideaKey?: string | null }
export type CurationDetails = { reviewer: string | null; records: CurationRecord[]; targets: CurationTarget[] }

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid curation readback.')
  return value as Record<string, unknown>
}
function state(value: unknown): CurationState {
  if (typeof value !== 'string' || !(CURATION_STATES as readonly string[]).includes(value)) throw new Error('Invalid curation state.')
  return value as CurationState
}
function uuid(value: unknown): string {
  if (typeof value !== 'string' || !isValidUuid(value)) throw new Error('Invalid curation identity.')
  return value
}
function version(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new Error('Invalid curation version.')
  return value as number
}
function nullableText(value: unknown): string | null {
  if (value !== null && typeof value !== 'string') throw new Error('Invalid curation text.')
  return value as string | null
}
function nullableInteger(value: unknown): number | null {
  if (value !== null) return version(value)
  return null
}
export function parseCurationDetails(value: unknown): CurationDetails {
  const data = object(value)
  if (!Array.isArray(data.records) || !Array.isArray(data.targets)) throw new Error('Invalid curation records.')
  const targets = data.targets.map((value): CurationTarget => {
    const r = object(value)
    if (typeof r.externalId !== 'string' || typeof r.lesson !== 'string' || typeof r.prompt !== 'string') throw new Error('Invalid source question.')
    return { revisionId: uuid(r.revisionId), bankId: uuid(r.bankId), questionId: uuid(r.questionId),
      externalId: r.externalId, revision: version(r.revision), unit: version(r.unit), lesson: r.lesson,
      prompt: r.prompt, content: object(r.content), answer: object(r.answer),
      ...(r.ideaKey===undefined?{}:{ideaKey:nullableText(r.ideaKey)}) }
  })
  return { reviewer: nullableText(data.reviewer), targets, records: data.records.map((value) => {
    const r = object(value)
    if (!Array.isArray(r.history) || typeof r.published !== 'boolean' || (r.published&&!r.publication)) throw new Error('Unsupported publication readback.')
    let publication: CurationRecord['publication'] = null
    if(r.publication){const p=object(r.publication)
      if(!r.published||typeof p.publisher!=='string'||typeof p.publishedAt!=='string'||typeof p.eligible!=='boolean')throw new Error('Invalid publication readback.')
      publication={reviewVersion:version(p.reviewVersion),publisher:p.publisher,publishedAt:p.publishedAt,
        publicProvenance:parsePresetProvenance(p.publicProvenance),eligible:p.eligible}
    }
    return { id: uuid(r.id), bankId: uuid(r.bankId), revisionId: r.revisionId === null ? null : uuid(r.revisionId),
      version: version(r.version), state: state(r.state), provenance: parsePresetProvenance(r.provenance),
      reviewer: nullableText(r.reviewer), approvedAt: nullableText(r.approvedAt), privateNotes: nullableText(r.privateNotes),
      unit: nullableInteger(r.unit), lesson: nullableText(r.lesson), prompt: nullableText(r.prompt),
      currentRevision: nullableInteger(r.currentRevision), sourceRevision: nullableInteger(r.sourceRevision), published: r.published,publication,
      history: r.history.map((value) => {
        const h = object(value)
        if (typeof h.actor !== 'string' || typeof h.reason !== 'string' || typeof h.createdAt !== 'string') throw new Error('Invalid curation history.')
        return { version: version(h.version), state: state(h.state), actor: h.actor, reason: h.reason,
          provenance: parsePresetProvenance(h.provenance), privateNotes: nullableText(h.privateNotes), createdAt: h.createdAt }
      }) }
  }) }
}
export async function assignPresetQuestionIdeas(entries: {revisionId:string;ideaKey:string}[],reason:string):Promise<number>{
  if(entries.length<1||entries.length>100||new Set(entries.map(e=>e.revisionId)).size!==entries.length||
    entries.some(e=>!isValidUuid(e.revisionId)||!/^[a-z0-9][a-z0-9._-]{0,119}$/.test(e.ideaKey))||
    !reason.trim()||reason.length>2000)throw new Error('Use one to 100 distinct revisions, short idea names and a decision reason.')
  const {data,error}=await supabase.rpc('assign_preset_question_ideas',{p_entries:entries as unknown as Json,p_reason:reason})
  if(error)throw new Error(error.code==='23505'?'This revision already has a different idea. Correct it on a new source revision.':
    'Idea mapping failed. Check reviewer authority and current source revisions, then reload.')
  if(!Number.isSafeInteger(data)||data<0||data>entries.length)throw new Error('Invalid idea mapping readback. Reload before retrying.')
  return data
}
export async function publishPresetRevision(record: CurationRecord,publicProvenance: PresetProvenance,reason:string):Promise<void>{
  uuid(record.id);version(record.version)
  const checked=parsePresetProvenance(publicProvenance)
  if(!reason.trim()||reason.length>2000||record.state!=='approved'||!record.revisionId)throw new Error('Publication requires an approved exact revision and a bounded reason.')
  const {data,error}=await supabase.rpc('publish_preset_revision',{p_id:record.id,p_expected_version:record.version,
    p_public_provenance:checked as unknown as Json,p_reason:reason})
  if(error)fail(error.code)
  const p=object(data)
  if(p.curationId!==record.id||p.reviewVersion!==record.version||typeof p.publisher!=='string'||typeof p.publishedAt!=='string')
    throw new Error('Publication readback differs from the reviewed revision. Reload before retrying.')
}
function fail(code: string | undefined): never {
  if (code === '40001') throw new Error('This record changed. Reload its latest version before reviewing.')
  if (code === '42501') throw new Error('Preset review requires an authorized MineGO reviewer account.')
  throw new Error('Curation could not be saved. Check evidence and decision state, then reload before retrying.')
}
export async function getPresetCuration(bankId: string): Promise<CurationDetails> {
  uuid(bankId)
  const { data, error } = await supabase.rpc('get_preset_curation', { p_bank_id: bankId })
  if (error) throw new Error('Preset details could not be loaded. Retry; private bank work remains available.')
  return parseCurationDetails(data)
}
export async function savePresetProvenance(input: { id: string; bankId: string; revisionId: string | null;
  expectedVersion: number; provenance: PresetProvenance; privateNotes: string; reason: string }): Promise<string> {
  uuid(input.id); uuid(input.bankId)
  if (input.revisionId !== null) uuid(input.revisionId)
  const provenance = parsePresetProvenance(input.provenance)
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0 || !input.reason.trim() ||
    input.reason.length > 2000 || input.privateNotes.length > 10000) throw new Error('Check the decision reason and record version.')
  const { data, error } = await supabase.rpc('save_preset_provenance', { p_id: input.id, p_bank_id: input.bankId,
    p_revision_id: input.revisionId, p_expected_version: input.expectedVersion, p_provenance: provenance as unknown as Json,
    p_private_notes: input.privateNotes, p_reason: input.reason })
  if (error) fail(error.code)
  return uuid(data)
}
export async function transitionPresetCuration(record: CurationRecord, nextState: CurationState, reason: string): Promise<void> {
  uuid(record.id); version(record.version); state(nextState)
  if (!reason.trim() || reason.length > 2000) throw new Error('Record a decision reason, up to 2,000 characters.')
  const { data, error } = await supabase.rpc('transition_preset_curation', {
    p_id: record.id, p_expected_version: record.version, p_state: nextState, p_reason: reason })
  if (error) fail(error.code)
  if (data !== record.version + 1) throw new Error('Unexpected decision readback. Reload before retrying.')
}
