import { parsePresetProvenance, type PresetProvenance } from '../domain/presetCuration'
import type { Json } from '../types/database'
import type { ExamSettings } from '../types/exam'
import type { ExamQuestion, QuestionOption } from '../types/question'
import { isValidUuid } from './questions'
import { supabase } from './supabase'
import { validateExamSettings, getFirstValidationError } from './validateExamSettings'
import { createValidatedSimpleExamSnapshot } from './generateExam'
import { accountLimitError } from './accountLimits'

export type PresetSelection = { revisionId: string; curationId: string; reviewVersion: number; marks: number; isLocked: boolean }
export type EligibleSimplePreset = Omit<PresetSelection,'marks'|'isLocked'> & { revision: number; reviewer: string;
  approvedAt: string; publisher: string; publishedAt: string; provenance: PresetProvenance; question: ExamQuestion; selectionKeys?: string[] }
export type CapturedPresetItem = PresetSelection & { question: ExamQuestion; provenance: PresetProvenance }
export type SavedSimplePresetExam = { id: string; ownerId: string; sealed: true; savedAt: string; settings: ExamSettings;
  items: CapturedPresetItem[]; totalMarks: number }
function object(value: unknown): Record<string,unknown> {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid preset readback.')
  return value as Record<string,unknown>
}
function uuid(value: unknown): string {
  if(typeof value!=='string'||!isValidUuid(value))throw new Error('Invalid preset identity.')
  return value
}
function text(value: unknown,cap: number): string {
  if(typeof value!=='string'||!value.trim()||value.length>cap)throw new Error('Invalid preset text.')
  return value
}
function integer(value: unknown,min=1,max=2147483647): number {
  if(!Number.isSafeInteger(value)||(value as number)<min||(value as number)>max)throw new Error('Invalid preset number.')
  return value as number
}
function option(value: unknown): QuestionOption {
  const o=object(value)
  if(Object.keys(o).some(k=>!['label','text'].includes(k)))throw new Error('Unsupported public option fields.')
  return {label:text(o.label,10),text:text(o.text,2000)}
}
export function parseSimplePresetQuestion(value: unknown): ExamQuestion {
  const q=object(value)
  const keys=['id','type','unit','lesson','difficulty','prompt','marks']
  const typeKeys: Record<string,string[]>={
    'multiple-choice':['options','correctAnswer'],binary:['labelMode','isTrue'],
    'short-answer':['answerLines','canonicalAnswer','approvedVariants','caseSensitive']}
  if(typeof q.type!=='string'||!typeKeys[q.type]||Object.keys(q).some(k=>![...keys,...typeKeys[q.type as string]].includes(k)))
    throw new Error('Unsupported public question fields or type.')
  if(!['easy','medium','hard'].includes(String(q.difficulty))||q.unit!==1)throw new Error('Unsupported simple preset coverage.')
  const base={id:uuid(q.id),unit:1,lesson:text(q.lesson,100),difficulty:q.difficulty as ExamQuestion['difficulty'],
    prompt:text(q.prompt,5000),marks:integer(q.marks,1,20)}
  if(q.type==='multiple-choice'){
    if(!Array.isArray(q.options)||q.options.length<2||q.options.length>6)throw new Error('Invalid preset choices.')
    const options=q.options.map(option),correctAnswer=option(q.correctAnswer)
    if(new Set(options.map(o=>o.label)).size!==options.length||!options.some(o=>o.label===correctAnswer.label&&o.text===correctAnswer.text))
      throw new Error('Invalid preset answer.')
    return {...base,type:'multiple-choice',options,correctAnswer}
  }
  if(q.type==='binary'){
    if(!['true-false','yes-no'].includes(String(q.labelMode))||typeof q.isTrue!=='boolean')throw new Error('Invalid binary preset.')
    return {...base,type:'binary',labelMode:q.labelMode as 'true-false'|'yes-no',isTrue:q.isTrue}
  }
  if(!Array.isArray(q.approvedVariants)||q.approvedVariants.length>20||typeof q.caseSensitive!=='boolean')throw new Error('Invalid preset answer variants.')
  return {...base,type:'short-answer',answerLines:integer(q.answerLines,1,10),canonicalAnswer:text(q.canonicalAnswer,5000),
    approvedVariants:q.approvedVariants.map(v=>text(v,5000)),caseSensitive:q.caseSensitive}
}
function selection(value: unknown): PresetSelection {
  const s=object(value)
  if(typeof s.isLocked!=='boolean')throw new Error('Invalid preset lock.')
  return {revisionId:uuid(s.revisionId),curationId:uuid(s.curationId),reviewVersion:integer(s.reviewVersion),
    marks:integer(s.marks,1,20),isLocked:s.isLocked}
}
function settings(value: unknown,count: number): ExamSettings {
  const s=object(value) as unknown as ExamSettings
  const error=getFirstValidationError(validateExamSettings(s,count))
  if(error||s.questionCount!==count)throw new Error(error??'Saved preset quantity differs from the paper.')
  return {schoolName:s.schoolName,examTitle:s.examTitle,teacherName:s.teacherName??'',grade:s.grade,unit:s.unit,
    marksPerQuestion:s.marksPerQuestion,questionCount:s.questionCount,selectionSeed:s.selectionSeed}
}
export function parseSavedSimplePresetExam(value: unknown): SavedSimplePresetExam {
  const s=object(value)
  if(s.sealed!==true||!Array.isArray(s.items)||s.items.length<1||s.items.length>50)throw new Error('Preset snapshot is incomplete or unsealed.')
  const items=s.items.map((value):CapturedPresetItem=>{
    const item=object(value),selected=selection(item),question=parseSimplePresetQuestion(item.question)
    if(question.marks!==selected.marks)throw new Error('Captured preset marks disagree.')
    return {...selected,question,provenance:parsePresetProvenance(item.provenance)}
  })
  if(new Set(items.map(i=>i.revisionId)).size!==items.length)throw new Error('Duplicate captured revisions.')
  const checkedSettings=settings(s.settings,items.length)
  const snapshot=createValidatedSimpleExamSnapshot(checkedSettings,items.map(i=>i.question))
  if(snapshot.totalMarks!==s.totalMarks)throw new Error('Captured preset total differs.')
  return {id:uuid(s.id),ownerId:uuid(s.ownerId),sealed:true,savedAt:text(s.savedAt,100),settings:checkedSettings,
    items,totalMarks:snapshot.totalMarks}
}
function fail(code?:string):never {
  if(code==='40001')throw new Error('A selected preset changed or was withdrawn. Reload available presets and review again.')
  if(code==='42501')throw new Error('Sign in with the teacher account that owns this paper.')
  if(code==='23505')throw new Error('This save request belongs to different paper contents. Start a new review.')
  throw new Error('Preset storage is unavailable or rejected this request. Reload and review before retrying.')
}
export function parseEligibleSimplePreset(value:unknown):EligibleSimplePreset{
  const r=object(value),question=parseSimplePresetQuestion(r.question)
  if(r.selectionKeys!==undefined&&(!Array.isArray(r.selectionKeys)||r.selectionKeys.length<1||r.selectionKeys.length>20||
    r.selectionKeys.some(key=>typeof key!=='string'||!key.trim()||key.length>200)))throw new Error('Invalid preset idea identity.')
  return {revisionId:uuid(r.revisionId),curationId:uuid(r.curationId),reviewVersion:integer(r.reviewVersion),
    revision:integer(r.revision),reviewer:text(r.reviewer,200),approvedAt:text(r.approvedAt,100),publisher:text(r.publisher,200),
    publishedAt:text(r.publishedAt,100),question,provenance:parsePresetProvenance(r.provenance),
    ...(r.selectionKeys===undefined?{}:{selectionKeys:r.selectionKeys as string[]})}
}
export async function getEligibleSimplePresets():Promise<EligibleSimplePreset[]> {
  const rows:EligibleSimplePreset[]=[];let after:string|null=null
  for(let page=0;page<100;page++){
    const {data,error}=await supabase.rpc('get_eligible_simple_presets',{p_after:after,p_limit:100})
    if(error){const limit=accountLimitError(error);if(limit)throw limit;fail(error.code)}
    if(!Array.isArray(data)||data.length>100)throw new Error('Invalid preset page.')
    for(const value of data){const r=object(value);const question=parseSimplePresetQuestion(r.question)
      if(after&&question.id<=after)throw new Error('Preset pagination did not advance.')
      after=question.id
      rows.push(parseEligibleSimplePreset(r))
    }
    if(data.length<100)return rows
  }
  throw new Error('Preset pool exceeds the supported 10,000-question bound.')
}
export async function finalizeSimplePresetExam(requestId:string,examSettings:ExamSettings,selections:PresetSelection[],ownerId:string):Promise<SavedSimplePresetExam>{
  uuid(requestId);uuid(ownerId)
  if(selections.length<1||selections.length>50)throw new Error('Select one to 50 presets.')
  const checked=selections.map(selection),checkedSettings=settings(examSettings,selections.length)
  const {data,error}=await supabase.rpc('finalize_simple_preset_exam',{p_request_id:requestId,p_settings:checkedSettings as unknown as Json,
    p_selections:checked as unknown as Json})
  if(error){const limit=accountLimitError(error);if(limit)throw limit;fail(error.code)}
  const saved=parseSavedSimplePresetExam(data)
  if(saved.ownerId!==ownerId||JSON.stringify(saved.settings)!==JSON.stringify(checkedSettings)||
    saved.items.some((item,index)=>JSON.stringify(selection(item))!==JSON.stringify(checked[index])))
    throw new Error('Finalized preset readback differs from the reviewed teacher request.')
  return saved
}
export async function getSimplePresetExams(ownerId:string):Promise<SavedSimplePresetExam[]>{
  uuid(ownerId)
  const {data,error}=await supabase.rpc('get_simple_preset_exams',{})
  if(error){const limit=accountLimitError(error);if(limit)throw limit;fail(error.code)}
  if(!Array.isArray(data))throw new Error('Invalid saved preset list.')
  const rows=data.map(parseSavedSimplePresetExam)
  if(rows.some(s=>s.ownerId!==ownerId))throw new Error('Saved paper belongs to a different teacher.')
  return rows
}
