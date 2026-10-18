import {parseCompoundSnapshot,type CompoundSnapshot} from '../domain/compoundStructure'
import {provenanceApprovalProblems} from '../domain/presetCuration'
import type {DomainQuestion} from '../domain/questionDomain'
import type {ExamSettings} from '../types/exam'
import type {Json} from '../types/database'
import {isValidUuid} from './questions'
import {parseEligibleSimplePreset,type EligibleSimplePreset} from './simplePresetRepository'
import {supabase} from './supabase'
import {getFirstValidationError,validateExamSettings} from './validateExamSettings'
import {createCompoundDocumentBlobs} from './compoundWorkflow'
import {prepareExamDocumentPair,type PreparedExamDocumentPair} from './documentDelivery'
import {conflictsWithSelection} from './selectQuestions'
import { accountLimitError } from './accountLimits'

export type EligiblePresetGroup={id:string;revision:number;instruction:string;attemptCount:number;members:EligibleSimplePreset[]}
export type SavedPresetGroupExam={id:string;ownerId:string;sealed:true;savedAt:string;settings:ExamSettings;group:EligiblePresetGroup;totalMarks:number}
function object(value:unknown):Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid grouped preset readback.')
  return value as Record<string,unknown>
}
function uuid(value:unknown):string{if(typeof value!=='string'||!isValidUuid(value))throw new Error('Invalid grouped preset identity.');return value}
export function parseEligiblePresetGroup(value:unknown):EligiblePresetGroup{
  const g=object(value)
  if(!Number.isSafeInteger(g.revision)||(g.revision as number)<1||typeof g.instruction!=='string'||!g.instruction.trim()||g.instruction.length>1000||
    !Array.isArray(g.members)||g.members.length<1||g.members.length>50||!Number.isSafeInteger(g.attemptCount)||
    (g.attemptCount as number)<1||(g.attemptCount as number)>g.members.length)throw new Error('Group instruction, complete members and attempt rule are required.')
  const members=g.members.map(parseEligibleSimplePreset)
  if(members.some((m,index)=>conflictsWithSelection({...m.question,selectionKeys:m.selectionKeys},
    members.slice(0,index).map(p=>({...p.question,selectionKeys:p.selectionKeys})))))throw new Error('Group repeats a question idea or wording within its unit.')
  if(new Set(members.map(m=>m.question.id)).size!==members.length||new Set(members.map(m=>m.revisionId)).size!==members.length||
    members.some(m=>provenanceApprovalProblems(m.provenance).length))throw new Error('Group members require distinct approved revisions and complete provenance.')
  return {id:uuid(g.id),revision:g.revision as number,instruction:g.instruction,attemptCount:g.attemptCount as number,members}
}
function checkedSettings(value:unknown,count:number):ExamSettings{
  const s=object(value)
  for(const key of ['schoolName','examTitle','teacherName'])if(typeof s[key]!=='string')throw new Error('Paper identity is missing.')
  if(s.grade!==6||s.unit!==1||s.questionCount!==count)throw new Error('Capture the complete Grade 6 Unit 1 generation unit.')
  const result={schoolName:s.schoolName as string,examTitle:s.examTitle as string,teacherName:s.teacherName as string,
    grade:6,unit:1,marksPerQuestion:s.marksPerQuestion as number,questionCount:count,selectionSeed:s.selectionSeed as number}
  const error=getFirstValidationError(validateExamSettings(result,count));if(error)throw new Error(error)
  return result
}
export function parseSavedPresetGroupExam(value:unknown):SavedPresetGroupExam{
  const s=object(value),group=parseEligiblePresetGroup(s.group),settings=checkedSettings(s.settings,group.members.length)
  const marks=group.members[0].question.marks
  if(s.sealed!==true||typeof s.savedAt!=='string'||!s.savedAt||settings.marksPerQuestion!==marks||
    group.members.some(m=>m.question.marks!==marks)||s.totalMarks!==marks*group.attemptCount)throw new Error('Group scoring or seal differs from its captured attempt rule.')
  const saved:SavedPresetGroupExam={id:uuid(s.id),ownerId:uuid(s.ownerId),sealed:true,savedAt:s.savedAt,settings,group,totalMarks:s.totalMarks as number}
  groupedPresetRenderSnapshot(saved)
  return saved
}
/** A renderer projection has teacher-local context; revision ownership remains in the protected database children. */
function rendererQuestion(member:EligibleSimplePreset,ownerId:string,bankId:string):DomainQuestion{
  const q=member.question,base={id:q.id,ownerId,bankId,externalId:`Preset ${q.id}`,unit:q.unit,lesson:q.lesson,
    difficulty:q.difficulty,prompt:q.prompt,marks:null,isActive:true,revision:member.revision,schemaVersion:1 as const}
  if(q.type==='multiple-choice')return {...base,type:q.type,content:{type:q.type,schemaVersion:1,options:q.options},
    answer:{type:q.type,schemaVersion:1,correctOptionLabel:q.correctAnswer.label}}
  if(q.type==='binary')return {...base,type:q.type,content:{type:q.type,schemaVersion:1,labelMode:q.labelMode},answer:{type:q.type,schemaVersion:1,isTrue:q.isTrue}}
  if(q.type!=='short-answer')throw new Error('Unsupported grouped renderer type.')
  return {...base,type:q.type,content:{type:q.type,schemaVersion:1,answerLines:q.answerLines},
    answer:{type:q.type,schemaVersion:1,canonicalAnswer:q.canonicalAnswer,approvedVariants:q.approvedVariants,caseSensitive:q.caseSensitive}}
}
export function groupedPresetRenderSnapshot(saved:SavedPresetGroupExam):CompoundSnapshot{
  const {group,ownerId}=saved
  return parseCompoundSnapshot({schemaVersion:2,ownerId,bankId:group.id,bankIds:[group.id],selectionSeed:saved.settings.selectionSeed,
    totalMarks:saved.totalMarks,branches:[{id:group.id,mainQuestionNumber:1,branchLabel:null,kind:'questions',instruction:group.instruction,
      arabicInstruction:null,marks:saved.totalMarks,attemptCount:group.attemptCount,
      items:group.members.map((member,index)=>({label:String(index+1),question:rendererQuestion(member,ownerId,group.id)})),
      pointMarks:Object.fromEntries(group.members.map(member=>[member.question.id,member.question.marks]))}]})
}
function fail(code?:string):never{
  throw new Error(code==='40001'?'This complete group changed or was withdrawn. Reload and review again.':
    code==='23505'?'This request identity belongs to different paper contents. Start a new review.':'Grouped preset storage rejected the request. Reopen before retrying.')
}
export async function getEligiblePresetGroups():Promise<EligiblePresetGroup[]>{
  const rows:EligiblePresetGroup[]=[];let after:string|null=null
  for(let page=0;page<100;page++){
    const {data,error}=await supabase.rpc('get_eligible_simple_preset_groups',{p_after:after,p_limit:100});if(error)fail(error.code)
    if(!Array.isArray(data)||data.length>100)throw new Error('Invalid preset group page.')
    for(const value of data){const g=parseEligiblePresetGroup(value);if(after&&g.id<=after)throw new Error('Group pagination did not advance.');after=g.id;rows.push(g)}
    if(data.length<100)return rows
  }
  throw new Error('Preset group pool exceeds the supported bound.')
}
export async function finalizePresetGroupExam(requestId:string,settings:ExamSettings,group:EligiblePresetGroup,marks:number,ownerId:string):Promise<SavedPresetGroupExam>{
  uuid(requestId);uuid(ownerId);const reviewed=parseEligiblePresetGroup(group)
  const checked=checkedSettings({...settings,marksPerQuestion:marks,questionCount:reviewed.members.length},reviewed.members.length)
  const {data,error}=await supabase.rpc('finalize_simple_preset_group',{p_request_id:requestId,p_settings:checked as unknown as Json,
    p_group_id:reviewed.id,p_group_revision:reviewed.revision,p_marks:marks});if(error){const limit=accountLimitError(error);if(limit)throw limit;fail(error.code)}
  const saved=parseSavedPresetGroupExam(data)
  if(saved.ownerId!==ownerId||saved.group.id!==reviewed.id||saved.group.revision!==reviewed.revision||
    JSON.stringify(saved.settings)!==JSON.stringify(checked)||saved.group.instruction!==reviewed.instruction||saved.group.attemptCount!==reviewed.attemptCount||
    saved.group.members.some((m,i)=>m.revisionId!==reviewed.members[i].revisionId||m.curationId!==reviewed.members[i].curationId||
      m.reviewVersion!==reviewed.members[i].reviewVersion||m.revision!==reviewed.members[i].revision||
      m.reviewer!==reviewed.members[i].reviewer||m.approvedAt!==reviewed.members[i].approvedAt||
      m.publisher!==reviewed.members[i].publisher||m.publishedAt!==reviewed.members[i].publishedAt||
      JSON.stringify(m.selectionKeys)!==JSON.stringify(reviewed.members[i].selectionKeys)||
      JSON.stringify(m.question)!==JSON.stringify({...reviewed.members[i].question,marks})||
      Object.keys(m.provenance).some(key=>JSON.stringify(m.provenance[key as keyof typeof m.provenance])!==
        JSON.stringify(reviewed.members[i].provenance[key as keyof typeof m.provenance]))))throw new Error('Captured group differs from the reviewed source revision or teacher request.')
  return saved
}
export async function getPresetGroupExams(ownerId:string):Promise<SavedPresetGroupExam[]>{
  uuid(ownerId);const {data,error}=await supabase.rpc('get_simple_preset_group_exams',{});if(error)fail(error.code)
  if(!Array.isArray(data))throw new Error('Invalid saved group papers.')
  const rows=data.map(parseSavedPresetGroupExam);if(rows.some(s=>s.ownerId!==ownerId))throw new Error('Saved paper belongs to another teacher.');return rows
}
export async function createGroupedPresetDocumentBlobs<T extends Blob|ArrayBuffer>(saved:SavedPresetGroupExam,examTemplate:T,keyTemplate:T){
  const checked=parseSavedPresetGroupExam(saved)
  return createCompoundDocumentBlobs(groupedPresetRenderSnapshot(checked),checked.settings,'Answer questions as instructed.',examTemplate,keyTemplate)
}
export async function prepareGroupedPresetDocuments(saved:SavedPresetGroupExam):Promise<PreparedExamDocumentPair>{
  const templates=await Promise.all(['exam','answer-key'].map(async kind=>{const response=await fetch(`/templates/iraqi-mainstream-phase-nine-${kind}-v1.docx`)
    if(!response.ok)throw new Error('Saved-version document template unavailable. Retry this captured paper.');return response.arrayBuffer()}))
  const pair=await createGroupedPresetDocumentBlobs(saved,templates[0],templates[1]);return prepareExamDocumentPair(1,pair.exam,pair.answerKey)
}
