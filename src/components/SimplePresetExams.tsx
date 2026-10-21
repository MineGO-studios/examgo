import {useEffect,useState} from 'react'
import {describeSourceTrust} from '../domain/presetCuration'
import {finalizeSimplePresetExam,getEligibleSimplePresets,getSimplePresetExams,
  type EligibleSimplePreset,type SavedSimplePresetExam} from '../lib/simplePresetRepository'
import {prepareExamQuestions,prepareReviewedExamDocuments} from '../lib/generateExam'
import {createQuestionReview,replaceQuestionInReview,toggleQuestionLock,type ReviewedQuestion} from '../lib/reviewQuestions'
import {downloadPreparedDocument,requestBrowserDownload,type PreparedExamDocumentPair} from '../lib/documentDelivery'
import {DEFAULT_EXAM_SETTINGS,DEFAULT_EXAM_QUESTION_FILTERS,SIMPLE_QUESTION_TYPES,type ExamSettings} from '../types/exam'
import GroupedPresetExams from './GroupedPresetExams'
import SourceReference from './SourceReference'
import PresetCoverageSummary from './PresetCoverageSummary'
import { teacherErrorMessage } from '../lib/safeErrorDetails'
import { Stepper } from './controls'
import { PaperStamp } from './CouponProgress'
import PaperProgress from './PaperProgress'

const typeNames={'multiple-choice':'Multiple choice',binary:'True/False or Yes/No','short-answer':'Short answer'}
const errorText=(e:unknown)=>teacherErrorMessage(e, 'Preset request failed. Reload and review again.')
/** `exercise` is the "Use an approved exercise" shape; `standalone` is the shared-questions source under "Pick questions by type". */
export default function SimplePresetExams({ownerId,section}:{ownerId:string;section:'exercise'|'standalone'}){
  const [pool,setPool]=useState<EligibleSimplePreset[]>([]),[history,setHistory]=useState<SavedSimplePresetExam[]>([])
  const [settings,setSettings]=useState<ExamSettings>({...DEFAULT_EXAM_SETTINGS,questionCount:1,
    questionQuantities:{'multiple-choice':1,binary:0,'short-answer':0}})
  const [review,setReview]=useState<ReviewedQuestion[]|null>(null),[saved,setSaved]=useState<SavedSimplePresetExam|null>(null)
  const [documents,setDocuments]=useState<PreparedExamDocumentPair|null>(null),[requestId,setRequestId]=useState(()=>crypto.randomUUID())
  const [busy,setBusy]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState(''),[reload,setReload]=useState(0)
  useEffect(()=>{let active=true
    void Promise.all([getEligibleSimplePresets(),getSimplePresetExams(ownerId)]).then(([p,h])=>{
      if(active){setPool(p);setHistory(h)}
    }).catch((e:unknown)=>{if(active)setError(errorText(e))}).finally(()=>{if(active)setBusy(false)})
    return()=>{active=false}
  },[ownerId,reload])
  function resetCapture(){setSaved(null);setDocuments(null);setRequestId(crypto.randomUUID());setMessage('');setError('')}
  function changeSettings(next:ExamSettings){setSettings(next);setReview(null);resetCapture()}
  function preview(){resetCapture()
    try{setReview(createQuestionReview(prepareExamQuestions(settings,pool.map(p=>({...p.question,selectionKeys:p.selectionKeys,marks:settings.marksPerQuestion})))))}
    catch(e){setReview(null);setError(errorText(e))}
  }
  async function finalize(){if(!review)return;setBusy(true);setError('')
    try{
      const selections=review.map(({question,locked})=>{
        const source=pool.find(p=>p.question.id===question.id)
        if(!source)throw new Error('Selected preset is missing. Reload and review again.')
        return {revisionId:source.revisionId,curationId:source.curationId,reviewVersion:source.reviewVersion,marks:question.marks,isLocked:locked}
      })
      const captured=await finalizeSimplePresetExam(requestId,{...settings,questionCount:review.length},selections,ownerId)
      setSaved(captured);setHistory(current=>[captured,...current.filter(s=>s.id!==captured.id)])
      setMessage('Finalized in your account. Captured questions, source approval, marks and locks are preserved together.')
    }catch(e){setError(errorText(e))}finally{setBusy(false)}
  }
  async function prepare(){if(!saved)return;setBusy(true);setError('')
    try{setDocuments(await prepareReviewedExamDocuments(saved.settings,saved.items.map(i=>i.question)));setMessage('Student exam and answer key are ready from the same sealed snapshot.')}
    catch(e){setError(errorText(e))}finally{setBusy(false)}
  }
  function openSaved(exam:SavedSimplePresetExam){setSaved(exam);setReview(null);setDocuments(null);setError('');setMessage('Historical paper opened. Later corrections or withdrawals do not alter this snapshot.')}
  const historyList = <><h4>Your finalized papers from shared questions</h4>
    {history.length===0?<p className="field-help">None yet.</p>:<ul>{history.map(exam=><li key={exam.id}>
      {exam.settings.examTitle} — {exam.totalMarks} marks <button type="button" disabled={busy} onClick={()=>openSaved(exam)}>Open saved preset paper</button></li>)}</ul>}</>
  if(section==='exercise')return <section className="preset-page" aria-labelledby="simple-presets-title">
    <h2 id="simple-presets-title">Use an approved exercise</h2>
    <PaperProgress current="setup"/>
    <p>One complete MineGO exercise, kept in source order with its answer rule.</p>
    <PresetCoverageSummary key={ownerId} ownerId={ownerId}/>
    <GroupedPresetExams key={ownerId} ownerId={ownerId}/>
    {error&&<p role="alert">{error}</p>}
    {history.length>0&&<section className="preset-section" aria-label="Finalized papers from shared questions">{historyList}</section>}
  </section>
  return <section className="preset-page" aria-labelledby="simple-presets-title">
    <h2 id="simple-presets-title">Shared MineGO questions</h2>
    <PaperProgress current={documents||saved?'download':review?'review':'setup'}/>
    <p>Pick questions by type from standalone questions reviewed and approved by MineGO.</p>
    {busy&&<p role="status">Loading or saving presets…</p>}{error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
    <section className="preset-section" aria-labelledby="preset-paper-title"><div className="preset-section-header"><h3 id="preset-paper-title">Paper from approved questions</h3>
    <button disabled={busy} type="button" className="button-quiet" onClick={()=>{setBusy(true);setPool([]);setError('');setReload(n=>n+1);setReview(null);resetCapture()}}>Reload available presets</button></div>
    {!busy&&!error&&pool.length===0&&<p className="field-help">No approved questions are available for this paper yet.</p>}
    <fieldset className="plain-fields" disabled={busy}><legend className="visually-hidden">Paper settings</legend>
      {(['schoolName','examTitle','teacherName'] as const).map(key=><label key={key}>{key==='schoolName'?'School name':key==='examTitle'?'Test title':'Teacher name'}
        <input name={`preset-${key}`} autoComplete="off" maxLength={80} value={settings[key]??''} onChange={e=>changeSettings({...settings,[key]:e.target.value})}/></label>)}
      <div className="stepper-group">
        <Stepper label="Marks per question" value={settings.marksPerQuestion} min={1} max={20} onChange={value=>changeSettings({...settings,marksPerQuestion:value})}/>
        {SIMPLE_QUESTION_TYPES.map(type=>{const available=pool.filter(p=>p.question.type===type).length
          const current=settings.questionQuantities?.[type]??0
          return <Stepper key={type} label={typeNames[type]} hint={`${available} available`} value={current} max={Math.max(available,current)}
            onChange={value=>{const quantities={...settings.questionQuantities!,[type]:value}
              changeSettings({...settings,questionQuantities:quantities,questionCount:Object.values(quantities).reduce((a,b)=>a+b,0)})}}/>})}
      </div>
      <details className="more-options"><summary>More options</summary>
        <label className="text-field">Selection number<input name="preset-seed" type="number" min={0} max={4294967295} value={settings.selectionSeed} onChange={e=>changeSettings({...settings,selectionSeed:Number(e.target.value)})}/>
        <small>Keep the same number to get the same questions again.</small></label>
      </details>
      <button type="button" disabled={!pool.length} onClick={preview}>Preview preset paper</button>
    </fieldset>
    {review&&<><h3>Review selected questions</h3><ol>{review.map(({question,locked})=>{
      const source=pool.find(p=>p.question.id===question.id)!
      return <li key={question.id}><p>{question.prompt}</p>
        <p>{question.type==='multiple-choice'?question.options.map(o=>o.text).join(' / '):question.type==='binary'?question.labelMode:'Short answer'}</p>
        <details className="source-details"><summary>Source and approval</summary><p>{describeSourceTrust(source.provenance)}</p>
          <p>Reviewer: {source.reviewer}.</p>
          <p>Reference: <SourceReference value={source.provenance.sourceReference}/>.</p>
          <p>Corpus: {source.provenance.corpusScope||'Not assessed'}. Ministerial occurrences: {source.provenance.ministerialOccurrences??'Not assessed'}.</p>
          <p>Approved and published for use in new papers. Counts describe the assessed corpus; they do not predict future exams.</p>
        </details>
        <label>Question marks<input name={`preset-mark-${question.id}`} type="number" min={1} max={20} disabled={busy||!!saved} value={question.marks}
          onChange={e=>{setReview(review.map(item=>item.question.id===question.id?{...item,question:{...item.question,marks:Number(e.target.value)}}:item));resetCapture()}}/></label>
        <button type="button" disabled={busy||!!saved} aria-pressed={locked} onClick={()=>{setReview(toggleQuestionLock(review,question.id));resetCapture()}}>{locked?'Unlock question':'Lock question'}</button>
        <button type="button" disabled={busy||locked||!!saved} onClick={()=>{try{
          setReview(replaceQuestionInReview(review,question.id,pool.map(p=>({...p.question,selectionKeys:p.selectionKeys,marks:question.marks})),settings,DEFAULT_EXAM_QUESTION_FILTERS));resetCapture()
        }catch(e){setError(errorText(e))}}}>Replace question</button>
      </li>
    })}</ol><p>Total: {review.reduce((n,i)=>n+i.question.marks,0)} marks.</p>
      <button type="button" disabled={busy||!!saved} onClick={()=>void finalize()}>Finalize preset paper</button></>}
    {saved&&<div className="finalized-record"><PaperStamp label="Finalized"/><h3>{saved.settings.examTitle}</h3><p>Sealed paper: {saved.items.length} questions, {saved.totalMarks} marks.</p>
      <ol>{saved.items.map(item=><li key={item.question.id}>{item.question.prompt} — {item.marks} marks{item.isLocked?' (locked)':''}</li>)}</ol>
      <button type="button" disabled={busy} onClick={()=>void prepare()}>Prepare saved documents</button>
      {documents&&(['exam','answerKey'] as const).map(kind=><button key={kind} type="button" onClick={()=>void downloadPreparedDocument(documents[kind],requestBrowserDownload).then(result=>{
        if(result.status==='failed')setError(result.error??'Download failed. Retry this document.')
      })}>Download {kind==='exam'?'student exam':'answer key'}</button>)}
    </div>}
    {historyList}
    </section>
  </section>
}
