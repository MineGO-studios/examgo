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
function parseTarget(value: unknown): CurationTarget {
  const r = object(value)
  if (typeof r.externalId !== 'string' || typeof r.lesson !== 'string' || typeof r.prompt !== 'string') throw new Error('Invalid source question.')
  return { revisionId: uuid(r.revisionId), bankId: uuid(r.bankId), questionId: uuid(r.questionId),
    externalId: r.externalId, revision: version(r.revision), unit: version(r.unit), lesson: r.lesson,
    prompt: r.prompt, content: object(r.content), answer: object(r.answer),
    ...(r.ideaKey===undefined?{}:{ideaKey:nullableText(r.ideaKey)}) }
}
function parseRecord(value: unknown): CurationRecord {
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
}
function count(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error('Invalid curation count.')
  return value as number
}
export function parseCurationDetails(value: unknown): CurationDetails {
  const data = object(value)
  if (!Array.isArray(data.records) || !Array.isArray(data.targets)) throw new Error('Invalid curation records.')
  return { reviewer: nullableText(data.reviewer), targets: data.targets.map(parseTarget), records: data.records.map(parseRecord) }
}
/** One searched page of preset review: records and question picker matches, plus the bank record and the selected question. */
export type CurationView = { reviewer: string | null; recordCount: number; records: CurationRecord[]; bankRecord: CurationRecord | null
  selectedRecord: CurationRecord | null; targetCount: number; targets: CurationTarget[]; selectedTarget: CurationTarget | null }
export type CurationViewRequest = { search?: string; revisionId?: string | null; recordLimit?: number; targetLimit?: number }
export function parseCurationView(value: unknown): CurationView {
  const data = object(value)
  if (!Array.isArray(data.records) || !Array.isArray(data.targets)) throw new Error('Invalid curation records.')
  return { reviewer: nullableText(data.reviewer), recordCount: count(data.recordCount), records: data.records.map(parseRecord),
    bankRecord: data.bankRecord === null ? null : parseRecord(data.bankRecord),
    selectedRecord: data.selectedRecord === null ? null : parseRecord(data.selectedRecord),
    targetCount: count(data.targetCount), targets: data.targets.map(parseTarget),
    selectedTarget: data.selectedTarget === null ? null : parseTarget(data.selectedTarget) }
}
/** Builds the same page from the full legacy readback; used only until the paged function is installed. */
export function curationViewFromDetails(details: CurationDetails, bankId: string, request: Required<CurationViewRequest>): CurationView {
  const needle = request.search.toLowerCase()
  const records = details.records.filter((r)=>`${r.prompt??'Bank'} ${r.provenance.sourceReference}`.toLowerCase().includes(needle))
  const targets = details.targets.filter((t)=>`${t.externalId} ${t.prompt}`.toLowerCase().includes(needle))
  return { reviewer: details.reviewer, recordCount: records.length, records: records.slice(0, request.recordLimit),
    bankRecord: details.records.find((r)=>r.bankId===bankId&&r.revisionId===null)??null,
    selectedRecord: request.revisionId ? details.records.find((r)=>r.revisionId===request.revisionId)??null : null,
    targetCount: targets.length, targets: targets.slice(0, request.targetLimit),
    selectedTarget: request.revisionId ? details.targets.find((t)=>t.revisionId===request.revisionId)??null : null }
}
function functionMissing(code: string | undefined) { return code === 'PGRST202' || code === '42883' }
const LOAD_FAILED = 'Preset details could not be loaded. Retry; private bank work remains available.'
export async function getPresetCurationView(bankId: string, request: CurationViewRequest = {}): Promise<CurationView> {
  uuid(bankId)
  const checked = { search: request.search ?? '', revisionId: request.revisionId ?? null,
    recordLimit: request.recordLimit ?? 25, targetLimit: request.targetLimit ?? 100 }
  if (checked.revisionId !== null) uuid(checked.revisionId)
  if (checked.search.length > 200) throw new Error('Use a search of up to 200 characters.')
  const { data, error } = await supabase.rpc('get_preset_curation_view', { p_bank_id: bankId, p_search: checked.search,
    p_revision_id: checked.revisionId, p_record_limit: checked.recordLimit, p_target_limit: checked.targetLimit })
  if (error && functionMissing(error.code)) return curationViewFromDetails(await getPresetCuration(bankId), bankId, checked)
  if (error) throw new Error(LOAD_FAILED)
  return parseCurationView(data)
}
/** Reviewer status only; no records or questions are read. */
export async function getPresetReviewer(bankId: string): Promise<string | null> {
  return (await getPresetCurationView(bankId, { recordLimit: 0, targetLimit: 0 })).reviewer
}
export type ProvenanceReadback = Pick<CurationRecord,'id'|'revisionId'|'provenance'|'privateNotes'>
export async function readBackPresetProvenance(bankId: string, ids: string[]): Promise<ProvenanceReadback[]> {
  uuid(bankId); ids.forEach(uuid)
  if (ids.length < 1 || ids.length > 10000) throw new Error('Read back one to 10,000 records.')
  const { data, error } = await supabase.rpc('get_preset_provenance_readback', { p_bank_id: bankId, p_ids: ids })
  if (error && functionMissing(error.code)) return (await getPresetCuration(bankId)).records
  if (error || !Array.isArray(data)) throw new Error(LOAD_FAILED)
  return data.map((value) => {
    const r = object(value)
    return { id: uuid(r.id), revisionId: r.revisionId === null ? null : uuid(r.revisionId),
      provenance: parsePresetProvenance(r.provenance), privateNotes: nullableText(r.privateNotes) }
  })
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
  if (error) throw new Error(LOAD_FAILED)
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
