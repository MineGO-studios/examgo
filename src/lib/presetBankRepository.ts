import type { Json } from '../types/database'
import type { BankBrowserQuestion } from './questionBankBrowse'
import { supabase } from './supabase'
import { isValidUuid } from './questions'

export interface PresetBank { id: string; name: string; grade: number; subject: string; publishedCount: number }
export interface PresetBankQuestion { id: string; revisionId: string; prompt: string; unit: number; lesson: string; type: string; difficulty: string }
export const PRESET_PAGE_SIZE = 50

function records(value: unknown, allowed: string[], max: number): Record<string, unknown>[] {
  if (!Array.isArray(value) || value.length>max) throw new Error('Invalid preset catalogue response.')
  const ids = new Set<string>()
  return value.map(item => {
    if (!item || typeof item!=='object' || Array.isArray(item)) throw new Error('Invalid preset catalogue row.')
    const row = item as Record<string, unknown>
    if (Object.keys(row).some(key=>!allowed.includes(key)) || typeof row.id!=='string' || !isValidUuid(row.id) || ids.has(row.id)) throw new Error('Invalid preset catalogue fields or identity.')
    ids.add(row.id)
    return row
  })
}
const text = (value: unknown, max: number): value is string => typeof value==='string' && value.trim().length>0 && value.length<=max
const integer = (value: unknown, min: number, max: number): value is number => Number.isSafeInteger(value) && (value as number)>=min && (value as number)<=max
function failure(code?: string): never {
  throw new Error(code==='42501' ? 'Sign in to browse preset banks.' : 'Preset banks could not be loaded. Retry shortly.')
}

export async function getPresetBanks(): Promise<PresetBank[]> {
  const result: PresetBank[] = []
  let after: string | null = null
  for (;;) {
    const {data,error} = await supabase.rpc('get_preset_banks', {p_after:after,p_limit:100})
    if (error) failure(error.code)
    const page = records(data,['id','name','grade','subject','publishedCount'],100)
    for (const row of page) {
      if (!text(row.name,100) || !text(row.subject,60) || !integer(row.grade,1,12) || !integer(row.publishedCount,1,Number.MAX_SAFE_INTEGER) || (after!==null && String(row.id)<=after)) throw new Error('Invalid preset bank.')
      after=row.id as string
      result.push(row as unknown as PresetBank)
    }
    if (page.length<100) return result
  }
}

export async function getPresetBankQuestions(bankId: string, after: string | null = null, search = ''): Promise<PresetBankQuestion[]> {
  if (!isValidUuid(bankId) || (after!==null && !isValidUuid(after)) || search.length>200) throw new Error('Invalid preset bank request.')
  const {data,error} = await supabase.rpc('get_preset_bank_questions', {p_bank_id:bankId,p_after:after,p_limit:PRESET_PAGE_SIZE,p_search:search})
  if (error) failure(error.code)
  const rows=records(data,['id','revisionId','prompt','unit','lesson','type','difficulty'],PRESET_PAGE_SIZE)
  let cursor=after
  for (const row of rows) {
    if (typeof row.revisionId!=='string' || !isValidUuid(row.revisionId) || !text(row.prompt,5000) || !text(row.lesson,100) || !text(row.type,60) || !['easy','medium','hard'].includes(String(row.difficulty)) || !integer(row.unit,1,20) || (cursor!==null && String(row.id)<=cursor)) throw new Error('Invalid published question.')
    cursor=row.id as string
  }
  return rows as unknown as PresetBankQuestion[]
}

export interface PresetBrowserQuestion extends BankBrowserQuestion { revisionId:string; linked:boolean }
export interface PresetBrowserGroup { id:string; revision:number; type:string; title:string|null; instructions:string|null; passage:string|null; arabicInstruction:string|null; attemptCount:number|null; questionIds:string[] }

/** Load one bank completely before deriving unit totals or applying the shared local filters. */
export async function getPresetBankBrowser(bankId:string):Promise<{questions:PresetBrowserQuestion[];groups:PresetBrowserGroup[]}> {
  if(!isValidUuid(bankId))throw new Error('Invalid preset bank request.')
  const questions:PresetBrowserQuestion[]=[],groups=new Map<string,PresetBrowserGroup>()
  let after:string|null=null,version:string|null=null
  for(;;){
    const {data,error}=await supabase.rpc('get_preset_bank_browser',{p_bank_id:bankId,p_after:after,p_limit:500})
    if(error)failure(error.code)
    if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).some(key=>!['version','questions','groups'].includes(key)))throw new Error('Invalid preset browser response.')
    const result=data as {version?:unknown;questions?:unknown;groups?:unknown}
    if(typeof result.version!=='string'||!/^[a-f0-9]{32}$/.test(result.version)||(version!==null&&version!==result.version))throw new Error('This preset bank changed. Reload the bank and try again.')
    version=result.version
    const rows=records(result.questions,['id','revisionId','prompt','unit','lesson','type','difficulty','externalId','linked','content','answer'],500)
    for(const row of rows){
      if(typeof row.revisionId!=='string'||!isValidUuid(row.revisionId)||!text(row.prompt,5000)||!text(row.lesson,100)||!text(row.type,60)||!integer(row.unit,1,20)||!['easy','medium','hard'].includes(String(row.difficulty))||typeof row.linked!=='boolean'||!text(row.externalId,80)||(after!==null&&String(row.id)<=after))throw new Error('Invalid preset browser question.')
      const content=row.content,answer=row.answer
      if(!content||typeof content!=='object'||Array.isArray(content)||Object.keys(content).some(key=>!['labelMode','options'].includes(key))||!answer||typeof answer!=='object'||Array.isArray(answer)||Object.keys(answer).some(key=>!['correctOptionLabel','isTrue','canonicalAnswer','oddWord','answers','pairs'].includes(key)))throw new Error('Invalid preset answer preview.')
      const c=content as Record<string,Json>,a=answer as Record<string,Json>
      questions.push({id:row.id as string,revisionId:row.revisionId,prompt:row.prompt,unit:row.unit,lesson:row.lesson,question_type:row.type,
        difficulty:row.difficulty as PresetBrowserQuestion['difficulty'],external_id:row.externalId,is_active:true,linked:row.linked,
        content:content as Json,answer:answer as Json,options:c.options??null,correct_option_label:typeof a.correctOptionLabel==='string'?a.correctOptionLabel:null})
      after=row.id as string
    }
    const groupRows=records(result.groups,['id','revision','type','title','instructions','passage','arabicInstruction','attemptCount','questionIds'],5000)
    for(const row of groupRows){
      if(!integer(row.revision,1,Number.MAX_SAFE_INTEGER)||!text(row.type,60)||!['title','instructions','passage','arabicInstruction'].every(key=>row[key]===null||typeof row[key]==='string')||!Array.isArray(row.questionIds)||row.questionIds.length===0||row.questionIds.some(id=>typeof id!=='string'||!isValidUuid(id))||new Set(row.questionIds).size!==row.questionIds.length||(row.attemptCount!==null&&!integer(row.attemptCount,1,1000)))throw new Error('Invalid published exercise.')
      const group=row as unknown as PresetBrowserGroup
      const previous=groups.get(group.id)
      if(previous&&JSON.stringify(previous)!==JSON.stringify(group))throw new Error('Published exercise changed. Reload the bank.')
      groups.set(group.id,group)
    }
    if(rows.length<500)break
  }
  const ids=new Set(questions.map(q=>q.id))
  if([...groups.values()].some(group=>group.questionIds.some(id=>!ids.has(id))))throw new Error('Published exercise is incomplete. Reload the bank.')
  return {questions,groups:[...groups.values()]}
}
