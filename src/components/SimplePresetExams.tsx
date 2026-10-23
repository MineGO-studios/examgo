import {useEffect,useState} from 'react'
import { useI18n } from '../lib/i18n'
import { localizeAppMessage } from '../lib/appMessages'
import { PRESET_STRINGS } from './PresetExams.strings'
import {readSelectionSeed} from '../lib/selectionSeed'
import {finalizeSimplePresetExam,getEligibleSimplePresets,getSimplePresetExams,
  type EligibleSimplePreset,type SavedSimplePresetExam} from '../lib/simplePresetRepository'
import {prepareExamQuestions,prepareReviewedExamDocuments} from '../lib/generateExam'
import {createQuestionReview,replaceQuestionInReview,toggleQuestionLock,type ReviewedQuestion} from '../lib/reviewQuestions'
import {downloadPreparedDocument,requestBrowserDownload,type PreparedExamDocumentPair} from '../lib/documentDelivery'
import WordFilePreview from './WordFilePreview'
import {DEFAULT_EXAM_SETTINGS,DEFAULT_EXAM_QUESTION_FILTERS,SIMPLE_QUESTION_TYPES,type ExamSettings} from '../types/exam'
import GroupedPresetExams from './GroupedPresetExams'
import SourceReference from './SourceReference'
import PresetCoverageSummary from './PresetCoverageSummary'
import { teacherErrorMessage } from '../lib/safeErrorDetails'
import { Stepper } from './controls'
import { PaperStamp } from './CouponProgress'
import PaperProgress from './PaperProgress'
import { questionTypeLabel } from '../lib/questionTypeLabels'

const errorText=(e:unknown)=>teacherErrorMessage(e, 'Preset request failed. Reload and review again.')
/** `exercise` is the "Use a preset exam paper made by MineGO" shape; `standalone` is the shared-questions source under "Pick questions by type". */
export default function SimplePresetExams({ownerId,section}:{ownerId:string;section:'exercise'|'standalone'}){
  const { language } = useI18n(), s = PRESET_STRINGS[language], tm = (text: string) => localizeAppMessage(language, text)
  const [pool,setPool]=useState<EligibleSimplePreset[]>([]),[history,setHistory]=useState<SavedSimplePresetExam[]>([])
  const [settings,setSettings]=useState<ExamSettings>(()=>({...DEFAULT_EXAM_SETTINGS,selectionSeed:readSelectionSeed(ownerId),questionCount:1,
    questionQuantities:{'multiple-choice':1,binary:0,'short-answer':0}}))
  const [review,setReview]=useState<ReviewedQuestion[]|null>(null),[saved,setSaved]=useState<SavedSimplePresetExam|null>(null)
  const [documents,setDocuments]=useState<PreparedExamDocumentPair|null>(null),[requestId,setRequestId]=useState(()=>crypto.randomUUID())
  const [busy,setBusy]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState<''|'finalizedMessage'|'readyMessage'|'historicalMessage'>(''),[reload,setReload]=useState(0)
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
      setMessage('finalizedMessage')
    }catch(e){setError(errorText(e))}finally{setBusy(false)}
  }
  async function prepare(){if(!saved)return;setBusy(true);setError('')
    try{setDocuments(await prepareReviewedExamDocuments(saved.settings,saved.items.map(i=>i.question)));setMessage('readyMessage')}
    catch(e){setError(errorText(e))}finally{setBusy(false)}
  }
  function openSaved(exam:SavedSimplePresetExam){setSaved(exam);setReview(null);setDocuments(null);setError('');setMessage('historicalMessage')}
  const historyList = <><h4>{s.historyTitle}</h4>
    {history.length===0?<p className="field-help">{s.none}</p>:<ul>{history.map(exam=><li key={exam.id}>
      <bdi>{exam.settings.examTitle}</bdi> — {s.marks(exam.totalMarks)} <button type="button" disabled={busy} onClick={()=>openSaved(exam)}>{s.openSaved}</button></li>)}</ul>}</>
  if(section==='exercise')return <section className="preset-page" aria-labelledby="simple-presets-title">
    <h2 id="simple-presets-title">{s.presetTitle}</h2>
    <PaperProgress current="setup"/>
    <p>{s.presetLede}</p>
    <PresetCoverageSummary key={ownerId} ownerId={ownerId}/>
    <GroupedPresetExams key={ownerId} ownerId={ownerId}/>
    {error&&<p role="alert">{tm(error)}</p>}
    {history.length>0&&<section className="preset-section" aria-label={s.historyLabel}>{historyList}</section>}
  </section>
  return <section className="preset-page" aria-labelledby="simple-presets-title">
    <h2 id="simple-presets-title">{s.sharedTitle}</h2>
    <PaperProgress current={documents||saved?'download':review?'review':'setup'}/>
    <p>{s.sharedLede}</p>
    {busy&&<p role="status">{s.loadingSaving}</p>}{error&&<p role="alert">{tm(error)}</p>}{message&&<p role="status">{s[message]}</p>}
    <section className="preset-section" aria-labelledby="preset-paper-title"><div className="preset-section-header"><h3 id="preset-paper-title">{s.paperFromApproved}</h3>
    <button disabled={busy} type="button" className="button-quiet" onClick={()=>{setBusy(true);setPool([]);setError('');setReload(n=>n+1);setReview(null);resetCapture()}}>{s.reloadPresets}</button></div>
    {!busy&&!error&&pool.length===0&&<p className="field-help">{s.noApproved}</p>}
    <fieldset className="plain-fields" disabled={busy}><legend className="visually-hidden">{s.paperSettings}</legend>
      {(['schoolName','examTitle','teacherName'] as const).map(key=><label key={key}>{key==='schoolName'?s.school:key==='examTitle'?s.testTitle:s.teacher}
        <input name={`preset-${key}`} autoComplete="off" maxLength={80} value={settings[key]??''} onChange={e=>changeSettings({...settings,[key]:e.target.value})}/></label>)}
      <div className="stepper-group">
        <Stepper label={s.marksPerQuestion} value={settings.marksPerQuestion} min={1} max={20} onChange={value=>changeSettings({...settings,marksPerQuestion:value})}/>
        {SIMPLE_QUESTION_TYPES.map(type=>{const available=pool.filter(p=>p.question.type===type).length
          const current=settings.questionQuantities?.[type]??0
          return <Stepper key={type} label={questionTypeLabel(type,language)} hint={s.available(available)} value={current} max={Math.max(available,current)}
            onChange={value=>{const quantities={...settings.questionQuantities!,[type]:value}
              changeSettings({...settings,questionQuantities:quantities,questionCount:Object.values(quantities).reduce((a,b)=>a+b,0)})}}/>})}
      </div>
      <button type="button" disabled={!pool.length} onClick={preview}>{s.previewPreset}</button>
    </fieldset>
    {review&&<><h3>{s.reviewSelected}</h3><ol>{review.map(({question,locked})=>{
      const source=pool.find(p=>p.question.id===question.id)!
      return <li key={question.id}><p dir="auto">{question.prompt}</p>
        <p>{question.type==='multiple-choice'?question.options.map(o=>o.text).join(' / '):question.type==='binary'?question.labelMode:s.shortAnswer}</p>
        <details className="source-details"><summary>{s.sourceApproval}</summary><p>{(source.provenance.sourceReference.trim() ? s.traceable : s.referenceMissing)}</p>
          <p>{s.reviewer} <bdi>{source.reviewer}</bdi>.</p>
          <p>{s.reference} <SourceReference value={source.provenance.sourceReference}/>.</p>
          <p>{s.corpus(source.provenance.corpusScope||s.notAssessed, String(source.provenance.ministerialOccurrences??s.notAssessed))}</p>
          <p>{s.approvedNote}</p>
        </details>
        <label>{s.questionMarks}<input name={`preset-mark-${question.id}`} type="number" min={1} max={20} disabled={busy||!!saved} value={question.marks}
          onChange={e=>{setReview(review.map(item=>item.question.id===question.id?{...item,question:{...item.question,marks:Number(e.target.value)}}:item));resetCapture()}}/></label>
        <button type="button" disabled={busy||!!saved} aria-pressed={locked} onClick={()=>{setReview(toggleQuestionLock(review,question.id));resetCapture()}}>{locked?s.unlockQuestion:s.lockQuestion}</button>
        <button type="button" disabled={busy||locked||!!saved} onClick={()=>{try{
          setReview(replaceQuestionInReview(review,question.id,pool.map(p=>({...p.question,selectionKeys:p.selectionKeys,marks:question.marks})),settings,DEFAULT_EXAM_QUESTION_FILTERS));resetCapture()
        }catch(e){setError(errorText(e))}}}>{s.replaceQuestion}</button>
      </li>
    })}</ol><p>{s.total(s.marks(review.reduce((n,i)=>n+i.question.marks,0)))}</p>
      <button type="button" disabled={busy||!!saved} onClick={()=>void finalize()}>{s.finalizePreset}</button></>}
    {saved&&<div className="finalized-record"><PaperStamp label="Finalized"/><h3><bdi>{saved.settings.examTitle}</bdi></h3><p>{s.sealed(saved.items.length, s.marks(saved.totalMarks))}</p>
      <ol>{saved.items.map(item=><li key={item.question.id}><bdi>{item.question.prompt}</bdi> — {s.marks(item.marks)}{item.isLocked?s.lockedSuffix:''}</li>)}</ol>
      <button type="button" disabled={busy} onClick={()=>void prepare()}>{s.prepareSaved}</button>
      {documents&&<WordFilePreview documents={documents}/>}
      {documents&&(['exam','answerKey'] as const).map(kind=><button key={kind} type="button" onClick={()=>void downloadPreparedDocument(documents[kind],requestBrowserDownload).then(result=>{
        if(result.status==='failed')setError(result.error??'Download failed. Retry this document.')
      })}>{kind==='exam'?s.downloadStudentExam:s.downloadAnswerKey}</button>)}
    </div>}
    {historyList}
    </section>
  </section>
}
