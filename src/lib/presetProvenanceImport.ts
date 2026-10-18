import {parsePresetProvenance,provenanceApprovalProblems,type PresetProvenance} from '../domain/presetCuration'
import {isValidUuid} from './questions'
import {supabase} from './supabase'
import type {Json} from '../types/database'
import {getPresetCuration,type CurationRecord} from './presetCurationRepository'

/** Reuse exact persisted Phase 11D conversion; held source rows stay held. */
export async function prepareCataloguePresetProvenance(bankId:string,importId:string):Promise<PresetImportDocument>{
  if(!isValidUuid(bankId)||!isValidUuid(importId))throw new Error('Select a saved source bank and import.')
  const {data:intake,error}=await supabase.from('catalogue_imports').select('source_sha256,source_bank_id,expected_rows,format_version')
    .eq('id',importId).eq('source_bank_id',bankId).maybeSingle()
  if(error||!intake||intake.format_version!==1)throw new Error('Saved source import is inaccessible.')
  const converted=new Set<string>()
  for(let offset=0;;offset+=1000){
    const page=await supabase.from('catalogue_promotion_batches').select('payload').eq('import_id',importId).order('component_key').range(offset,offset+999)
    if(page.error||!page.data)throw new Error('Canonical conversion receipts could not be loaded.')
    for(const receipt of page.data){const payload=object(receipt.payload)
      if(!Array.isArray(payload.questions))throw new Error('Canonical receipt is incomplete.')
      for(const q of payload.questions){const id=object(q).id;if(typeof id!=='string'||!isValidUuid(id))throw new Error('Invalid conversion identity.');converted.add(id)}
    }
    if(page.data.length<1000)break
  }
  const details=await getPresetCuration(bankId)
  if(!details.reviewer)throw new Error('MineGO reviewer authority is required.')
  const entries=details.targets.filter(t=>converted.has(t.questionId)).map(t=>{
    const existing=details.records.find(r=>r.revisionId===t.revisionId)
    return {id:existing?.id??crypto.randomUUID(),revisionId:t.revisionId,privateNotes:existing?.privateNotes??
      `Restricted original/normalized text, family/group relationships, source occurrences and answer evidence remain in saved intake ${importId}, catalogue ${t.externalId}.`,
      provenance:existing?.provenance??{schemaVersion:2 as const,
        sourceReference:`Release SHA-256 ${intake.source_sha256}; catalogue ${t.externalId}; revision ${t.revision}`,
        corpusScope:`Exact saved release: ${intake.expected_rows} original rows.`, ministerialOccurrences:null,
        missingEvidence:['Review exact conversion and complete group context before educational approval.']}}

  })
  if(!entries.length)throw new Error('No validated canonical source conversion is available for this import.')
  return previewPresetProvenanceImport(JSON.stringify({format:'examgo-preset-provenance',schemaVersion:1,mappingVersion:1,
    importId,sourceSha256:intake.source_sha256,entries})).document
}

export type PresetImportEntry={id:string;revisionId:string;provenance:PresetProvenance;privateNotes:string}
export type PresetImportDocument={format:'examgo-preset-provenance';schemaVersion:1;mappingVersion:1;
  importId:string;sourceSha256:string;entries:PresetImportEntry[]}
export type PresetImportPreview={document:PresetImportDocument;rejected:{row:number;reason:string}[];
  duplicates:{row:number;revisionId:string}[];incomplete:{row:number;problems:string[]}[]}
export function verifyPresetProvenanceReadback(entries:PresetImportEntry[],records:Pick<CurationRecord,'id'|'revisionId'|'provenance'|'privateNotes'>[]){
  const byId=new Map(records.map(record=>[record.id,record]))
  for(const entry of entries){const record=byId.get(entry.id)
    if(!record||record.revisionId!==entry.revisionId||record.privateNotes!==entry.privateNotes||
      (Object.keys(entry.provenance) as (keyof PresetProvenance)[]).some(key=>JSON.stringify(record.provenance[key])!==JSON.stringify(entry.provenance[key])))
      throw new Error('Saved provenance differs from the reviewed intake. Reopen the records before retrying.')
  }
}
function object(v:unknown):Record<string,unknown>{
  if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('Expected an object.')
  return v as Record<string,unknown>
}
function exactKeys(o:Record<string,unknown>,keys:string[]){
  if(Object.keys(o).length!==keys.length||Object.keys(o).some(k=>!keys.includes(k)))throw new Error('Unsupported fields; import cannot contain approval or publication decisions.')
}
export function previewPresetProvenanceImport(text:string):PresetImportPreview{
  if(new TextEncoder().encode(text).byteLength>32*1024*1024)throw new Error('Provenance file exceeds 32 MiB.')
  const o=object(JSON.parse(text));exactKeys(o,['format','schemaVersion','mappingVersion','importId','sourceSha256','entries'])
  if(o.format!=='examgo-preset-provenance'||o.schemaVersion!==1||o.mappingVersion!==1||typeof o.importId!=='string'||!isValidUuid(o.importId)||
    typeof o.sourceSha256!=='string'||!/^[0-9a-f]{64}$/.test(o.sourceSha256)||!Array.isArray(o.entries)||o.entries.length<1||o.entries.length>10000)
    throw new Error('Use provenance schema/mapping 1, an exact saved release hash and one to 10,000 records.')
  const document:PresetImportDocument={format:'examgo-preset-provenance',schemaVersion:1,mappingVersion:1,
    importId:o.importId,sourceSha256:o.sourceSha256,entries:[]}
  const rejected:PresetImportPreview['rejected']=[],duplicates:PresetImportPreview['duplicates']=[],incomplete:PresetImportPreview['incomplete']=[]
  const revisions=new Set<string>(),ids=new Set<string>()
  o.entries.forEach((value,row)=>{try{
    const e=object(value);exactKeys(e,['id','revisionId','provenance','privateNotes'])
    if(typeof e.id!=='string'||!isValidUuid(e.id)||typeof e.revisionId!=='string'||!isValidUuid(e.revisionId)||
      typeof e.privateNotes!=='string'||e.privateNotes.length>10000)throw new Error('Invalid exact identity or oversized private notes.')
    const provenance=parsePresetProvenance(e.provenance)
    if(revisions.has(e.revisionId)||ids.has(e.id)){duplicates.push({row:row+1,revisionId:e.revisionId});return}
    revisions.add(e.revisionId);ids.add(e.id)
    document.entries.push({id:e.id,revisionId:e.revisionId,provenance,privateNotes:e.privateNotes})
    const problems=provenanceApprovalProblems(provenance)
    if(problems.length)incomplete.push({row:row+1,problems})
  }catch(e){rejected.push({row:row+1,reason:e instanceof Error?e.message:'Invalid provenance row.'})}})
  return {document,rejected,duplicates,incomplete}
}
export function packPresetProvenanceBatches(entries:PresetImportEntry[]):PresetImportEntry[][]{
  const batches:PresetImportEntry[][]=[];let current:PresetImportEntry[]=[]
  for(const entry of entries){
    if(new TextEncoder().encode(JSON.stringify([entry])).byteLength>650000)throw new Error('One provenance row exceeds the atomic batch limit.')
    if(current.length&& (current.length===100||new TextEncoder().encode(JSON.stringify([...current,entry])).byteLength>650000)){
      batches.push(current);current=[]
    }
    current.push(entry)
  }
  if(current.length)batches.push(current)
  return batches
}
export async function stagePresetProvenanceBatch(batchId:string,document:PresetImportDocument,entries:PresetImportEntry[],reason:string){
  if(!isValidUuid(batchId)||!reason.trim()||reason.length>2000||entries.length<1||entries.length>100)throw new Error('A bounded staging batch and reason are required.')
  const checked=previewPresetProvenanceImport(JSON.stringify({...document,entries}))
  if(checked.rejected.length||checked.duplicates.length)throw new Error('Correct rejected and duplicate records before staging.')
  const {data,error}=await supabase.rpc('stage_preset_provenance_batch',{p_id:batchId,p_import_id:document.importId,
    p_source_sha256:document.sourceSha256,p_schema_version:1,p_mapping_version:1,p_entries:entries as unknown as Json,p_reason:reason})
  if(error)throw new Error(error.code==='23505'?'Existing source provenance differs. Review a correction; do not overwrite it through import.':
    'Governed staging failed. Check reviewer authority, exact saved release and current canonical revision before retrying the same batch.')
  const result=object(data)
  if(result.batchId!==batchId||result.importId!==document.importId||result.sourceSha256!==document.sourceSha256||result.schemaVersion!==1||result.mappingVersion!==1||
    !Number.isSafeInteger(result.created)||!Number.isSafeInteger(result.skipped)||(result.created as number)<0||(result.skipped as number)<0||
    (result.created as number)+(result.skipped as number)!==entries.length||result.updated!==0||result.rejected!==0)
    throw new Error('Staging readback differs from the requested batch. Reopen before retrying.')
  return {batchId,created:result.created as number,skipped:result.skipped as number,updated:0,rejected:0}
}
