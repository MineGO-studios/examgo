import { beforeEach, describe, expect, it, vi } from 'vitest'
import { canonicalImportValue } from './questionImportRepository'
import type { StagedInterchangeQuestion } from './questionInterchange'

const BANK='123e4567-e89b-42d3-a456-426614174000'
const OWNER='123e4567-e89b-42d3-a456-426614174001'
const IMPORT='123e4567-e89b-42d3-a456-426614174002'
const mocks=vi.hoisted(()=>({ tables:{} as Record<string,Array<Record<string,unknown>>>,
  calls:[] as Array<{p_import_id:string;p_payload:Record<string,unknown>}>, failNext:false, access:true }))
vi.mock('./supabase',()=>({supabase:{
  auth:{getUser:async()=>({data:{user:{id:'123e4567-e89b-42d3-a456-426614174001'}},error:null})},
  from(table:string){
    const filters:Array<(row:Record<string,unknown>)=>boolean>=[]
    let first=0,last=999
    const result=()=>({data:(mocks.tables[table]??[]).filter((row)=>filters.every((filter)=>filter(row))).slice(first,last+1),error:null})
    const query={ select(){return query}, eq(key:string,value:unknown){filters.push((row)=>row[key]===value);return query},
      in(key:string,values:unknown[]){filters.push((row)=>values.includes(row[key]));return query},
      order(){return query},range(start:number,end:number){first=start;last=end;return query},
      abortSignal(signal:AbortSignal){expect(signal).toBeInstanceOf(AbortSignal);return query},
      maybeSingle:async()=>({data:mocks.access?result().data[0]??null:null,error:null}),
      then(resolve:(value:unknown)=>void){resolve(result())},
    }
    return query
  },
  async rpc(name:string,args:{p_import_id:string;p_payload?:Record<string,unknown>;p_rows?:Array<Record<string,unknown>>}){
    if(name==='attach_catalogue_mapping') {
      let attached=0
      for(const entry of args.p_rows!) {
        const row=mocks.tables.catalogue_import_rows.find((r)=>r.catalogue_id===entry.catalogueId)!
        if(row.normalized===null){row.normalized=structuredClone(entry.normalized);attached++}
      }
      return {data:attached,error:null}
    }
    if(!args.p_payload) throw new Error('Canonical payload required')
    mocks.calls.push({...args,p_payload:args.p_payload})
    if(mocks.failNext){mocks.failNext=false;return {data:null,error:{code:'XX000'}}}
    const p=args.p_payload as {catalogueIds:string[];questions:Array<Record<string,unknown>>;
      groups:Array<Record<string,unknown>>;members:Array<Record<string,unknown>>}
    const receipts=mocks.tables.catalogue_promotion_batches
    const receipt=receipts.find((r)=>canonicalImportValue(r.catalogue_ids)===canonicalImportValue([...p.catalogueIds].sort()))
    if(receipt) return {data:{inserted:0,unchanged:p.questions.length},error:null}
    receipts.push({import_id:args.p_import_id,catalogue_ids:[...p.catalogueIds].sort(),payload:structuredClone(p)})
    for(const q of p.questions) mocks.tables.question_revisions.push({...q,question_id:q.id,revision:1})
    mocks.tables.question_groups.push(...p.groups)
    mocks.tables.question_group_questions.push(...p.members)
    return {data:{inserted:p.questions.length,unchanged:0},error:null}
  },
}}))
import { commitStagedCatalogue, previewStagedCatalogue } from './catalogueImportRepository'

function question(id:string,sourceOrder:number,grouped=true):StagedInterchangeQuestion & {sourceOrder:number}{
  const group={group_id:'G',parent_group_id:'',group_type:'printed_section',instructions:'Answer both.',
    display_count:2,attempt_count:2,group_completeness:'complete'}
  return {catalogueId:id,sourceOrder,type:'binary',prompt:`${id} true?`,unitTags:[1,2],displayUnit:2,
    lesson:'1',difficulty:'medium',difficultyProvisional:true,selectionMarks:null,content:null,answer:'True',
    groupIds:grouped?['G']:[],groupCompleteness:grouped?'complete':null,
    sourceFields:{group_context_json:JSON.stringify(grouped?[group]:[]),extra:'original evidence'},issues:[]}
}
beforeEach(()=>{
  mocks.calls=[];mocks.failNext=false;mocks.access=true
  const rows=[question('Q-1',2),question('Q-2',1),{...question('Q-3',3,false),lesson:null},question('Q-4',4,false)]
  mocks.tables={question_banks:[{id:BANK,owner_id:OWNER,is_archived:false}],
    catalogue_imports:[{id:IMPORT,owner_id:OWNER,source_bank_id:BANK,source_namespace:'teacher',format_version:1,expected_rows:4}],
    catalogue_import_rows:rows.map((q)=>({import_id:IMPORT,catalogue_id:q.catalogueId,normalized:q})),
    catalogue_promotion_batches:[],question_revisions:[],question_groups:[],question_group_questions:[]}
})
describe('saved catalogue commit',()=>{
  it('converts historical raw Papers rows and resumes partially attached mappings without replacing source evidence',async()=>{
    mocks.tables.catalogue_imports[0].source_namespace='Papers/Ready_Question_Bank/master_export'
    for(const row of mocks.tables.catalogue_import_rows) {
      const q=row.normalized as StagedInterchangeQuestion
      row.source_content_hash='a'.repeat(64)
      row.source_fields={catalogue_id:q.catalogueId,question_type:q.type,question_text:q.prompt,unit:'1,2',
        lesson:q.lesson??'',group_context_json:q.sourceFields.group_context_json,
        group_completeness:q.groupCompleteness??'',structured_content_json:'',structured_answer_json:'',
        answer_text:'True',source_occurrences_json:'[]',extra:'original evidence'}
      row.normalized=null
    }
    const originals=structuredClone(mocks.tables.catalogue_import_rows.map((r)=>r.source_fields))
    const preview=await previewStagedCatalogue(IMPORT,BANK)
    expect(preview.plan.readyRows).toBe(3)
    // One earlier attachment survived an interruption; remaining original rows are still raw.
    mocks.tables.catalogue_import_rows[0].normalized=preview.mappingRows[0].normalized
    const result=await commitStagedCatalogue(IMPORT,BANK)
    expect(result).toMatchObject({inserted:3,reviewRows:1})
    expect(mocks.tables.catalogue_import_rows.every((r)=>r.normalized!==null)).toBe(true)
    expect(mocks.tables.catalogue_import_rows.map((r)=>r.source_fields)).toEqual(originals)
  })
  it('preserves source order, commits only ready components and reads back typed answers and group members',async()=>{
    const preview=await previewStagedCatalogue(IMPORT,BANK)
    expect(preview.document.questions.map((q)=>q.catalogueId)).toEqual(['Q-2','Q-1','Q-3','Q-4'])
    const result=await commitStagedCatalogue(IMPORT,BANK)
    expect(result).toMatchObject({sourceRows:4,readyRows:3,inserted:3,unchanged:0,reviewRows:1,groups:1,
      review:[{catalogueIds:['Q-3']}]})
    expect(mocks.tables.question_revisions.map((q)=>q.external_id)).toEqual(['Q-2','Q-1','Q-4'])
    expect(mocks.tables.question_revisions.every((q)=>q.marks===null)).toBe(true)
    const retry=await commitStagedCatalogue(IMPORT,BANK)
    expect(retry).toMatchObject({inserted:0,unchanged:3})
    expect((await previewStagedCatalogue(IMPORT,BANK)).totals).toEqual({added:0,updated:0,unchanged:3,duplicate:0,rejected:0,review:1})
    expect(retry.totals).toEqual({added:0,updated:0,unchanged:3,duplicate:0,rejected:0,review:1})
    expect(retry.diagnostics).toContainEqual(expect.objectContaining({row:'Q-3',field:'lesson',status:'missing',remedy:expect.stringContaining('map the lesson')}))
    expect(mocks.tables.question_revisions).toHaveLength(3)
    expect(mocks.calls[2].p_payload).toEqual(mocks.calls[0].p_payload)
  })
  it('resumes a committed component without replacing its UUID after an interrupted import',async()=>{
    await commitStagedCatalogue(IMPORT,BANK)
    // Simulate an interruption after the first component committed.
    mocks.tables.catalogue_promotion_batches.pop()
    mocks.tables.question_revisions=mocks.tables.question_revisions.slice(0,2)
    mocks.calls=[];mocks.failNext=true
    await expect(commitStagedCatalogue(IMPORT,BANK)).rejects.toThrow('Retry this saved import')
    const retry=await commitStagedCatalogue(IMPORT,BANK)
    expect(retry).toMatchObject({inserted:1,unchanged:2})
    expect(mocks.calls[1].p_payload).toEqual(mocks.calls[0].p_payload)
  })
  it('rejects inaccessible or incomplete staging before any canonical write',async()=>{
    mocks.access=false
    await expect(commitStagedCatalogue(IMPORT,BANK)).rejects.toThrow('inaccessible')
    mocks.access=true;mocks.tables.catalogue_import_rows.pop()
    await expect(commitStagedCatalogue(IMPORT,BANK)).rejects.toThrow('incomplete')
    expect(mocks.calls).toHaveLength(0)
  })
  it('rejects changed saved conversions before writes and detects incomplete ordered readback',async()=>{
    await commitStagedCatalogue(IMPORT,BANK)
    mocks.calls=[]
    const row=mocks.tables.catalogue_import_rows[0].normalized as StagedInterchangeQuestion
    row.answer='False'
    await expect(commitStagedCatalogue(IMPORT,BANK)).rejects.toThrow('differs from this preview')
    expect(mocks.calls).toHaveLength(0)
    row.answer='True';mocks.tables.question_group_questions.pop()
    await expect(commitStagedCatalogue(IMPORT,BANK)).rejects.toThrow('Ordered group members differ')
  })
})
