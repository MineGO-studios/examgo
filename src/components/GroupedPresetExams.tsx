import {useEffect,useState} from 'react'
import { useI18n } from '../lib/i18n'
import { localizeAppMessage } from '../lib/appMessages'
import { PRESET_STRINGS } from './PresetExams.strings'
import {finalizePresetGroupExam,getEligiblePresetGroups,getPresetGroupExams,prepareGroupedPresetDocuments,
  type EligiblePresetGroup,type SavedPresetGroupExam} from '../lib/groupedPresetRepository'
import {DEFAULT_EXAM_SETTINGS} from '../types/exam'
import {downloadPreparedDocument,requestBrowserDownload,type PreparedExamDocumentPair} from '../lib/documentDelivery'
import SourceReference from './SourceReference'
import { PaperStamp } from './CouponProgress'
import { ChoiceChips, Stepper } from './controls'
import { teacherErrorMessage } from '../lib/safeErrorDetails'
const errorText=(e:unknown)=>teacherErrorMessage(e, 'Group preset request failed. Reopen before retrying.')
export default function GroupedPresetExams({ownerId}:{ownerId:string}){
  const { language } = useI18n(), s = PRESET_STRINGS[language], tm = (text: string) => localizeAppMessage(language, text)
  const [groups,setGroups]=useState<EligiblePresetGroup[]>([]),[selected,setSelected]=useState(''),[history,setHistory]=useState<SavedPresetGroupExam[]>([])
  const [settings,setSettings]=useState({...DEFAULT_EXAM_SETTINGS,examTitle:'Approved preset exercise',marksPerQuestion:1})
  const [busy,setBusy]=useState(true),[error,setError]=useState(''),[reload,setReload]=useState(0),[requestId,setRequestId]=useState(()=>crypto.randomUUID())
  const [saved,setSaved]=useState<SavedPresetGroupExam|null>(null),[documents,setDocuments]=useState<PreparedExamDocumentPair|null>(null)
  useEffect(()=>{let active=true
    void Promise.all([getEligiblePresetGroups(),getPresetGroupExams(ownerId)]).then(([pool,papers])=>{if(active){setGroups(pool);setHistory(papers);setSelected(pool[0]?.id??'')}})
      .catch((e:unknown)=>{if(active)setError(errorText(e))}).finally(()=>{if(active)setBusy(false)})
    return()=>{active=false}
  },[ownerId,reload])
  function reset(){setSaved(null);setDocuments(null);setRequestId(crypto.randomUUID());setError('')}
  const group=groups.find(g=>g.id===selected)
  async function finalize(){if(!group)return;setBusy(true);setError('')
    try{const paper=await finalizePresetGroupExam(requestId,settings,group,settings.marksPerQuestion,ownerId)
      setSaved(paper);setHistory(current=>[paper,...current.filter(p=>p.id!==paper.id)])
    }catch(e){setError(errorText(e))}finally{setBusy(false)}
  }
  async function prepare(){if(!saved)return;setBusy(true);setError('')
    try{setDocuments(await prepareGroupedPresetDocuments(saved))}catch(e){setError(errorText(e))}finally{setBusy(false)}
  }
  return <section className="preset-section" aria-labelledby="group-presets-title"><div className="preset-section-header"><h3 id="group-presets-title">{s.exerciseTitle}</h3>
    <button type="button" className="button-quiet" disabled={busy} onClick={()=>{reset();setGroups([]);setSelected('');setBusy(true);setReload(n=>n+1)}}>{s.reloadComplete}</button></div>
    <p className="field-help">{s.exerciseLede}</p>
    {busy&&<p role="status">{s.loadingExercises}</p>}{error&&<p role="alert">{tm(error)}</p>}
    {!busy&&!error&&!groups.length&&<p>{s.noExercises}</p>}
    <fieldset className="plain-fields" disabled={busy||!!saved}><legend className="visually-hidden">{s.exerciseSettings}</legend>
      {groups.length>0&&<ChoiceChips legend={s.publishedExercise} variant="list" value={selected}
        onChange={value=>{setSelected(value);reset()}}
        options={groups.map(g=>({value:g.id,label:g.instruction.slice(0,80),detail:s.studentsAnswer(g.attemptCount,g.members.length)}))}/>}
      {(['schoolName','examTitle','teacherName'] as const).map(key=><label key={key}>{key==='schoolName'?s.exerciseSchool:key==='examTitle'?s.exerciseTitleField:s.exerciseTeacher}
        <input name={`group-preset-${key}`} autoComplete="off" maxLength={80} value={settings[key]??''} onChange={e=>{setSettings({...settings,[key]:e.target.value});reset()}}/></label>)}
      <div className="stepper-group"><Stepper label={s.marksPerPoint} value={settings.marksPerQuestion} min={1} max={20}
        onChange={value=>{setSettings({...settings,marksPerQuestion:value});reset()}}/></div>
      {group&&<><p><bdi>{group.instruction}</bdi> {s.studentsAnswer(group.attemptCount,group.members.length)} · {s.marks(group.attemptCount*settings.marksPerQuestion)}.</p>
        <ol className="preset-items">{group.members.map(m=><li key={m.revisionId}><p dir="auto">{m.question.prompt}</p><details className="source-details"><summary>{s.sourceApproval}</summary>
          <p>{m.provenance.sourceReference.trim() ? s.traceable : s.referenceMissing}.</p>
          <p>{s.approvedShort} {s.reviewer} <bdi>{m.reviewer}</bdi>. {s.publisher} <bdi>{m.publisher}</bdi>.</p>
          <p>{s.reference} <SourceReference value={m.provenance.sourceReference}/>.</p>
          <p>{s.corpus(m.provenance.corpusScope||s.notAssessed, String(m.provenance.ministerialOccurrences??s.notAssessed))} {s.countsNote}</p>
        </details></li>)}</ol>
        <button type="button" onClick={()=>void finalize()}>{s.finalizeExercise}</button></>}
    </fieldset>
    {saved&&<div className="finalized-record"><PaperStamp label="Finalized"/><h4><bdi>{saved.settings.examTitle}</bdi></h4><p>{s.studentsAnswer(saved.group.attemptCount,saved.group.members.length)} · {s.marks(saved.totalMarks)}.</p>
      <ol>{saved.group.members.map(m=><li key={m.revisionId}><bdi>{m.question.prompt}</bdi> — {s.perAttempted(s.marks(m.question.marks))}</li>)}</ol>
      <button type="button" disabled={busy} onClick={()=>void prepare()}>{s.prepareExercise}</button>
      {documents&&(['exam','answerKey'] as const).map(kind=><button key={kind} type="button" onClick={()=>void downloadPreparedDocument(documents[kind],requestBrowserDownload).then(result=>{
        if(result.status==='failed')setError(result.error??'Download failed. Retry this captured document.')
      })}>{kind==='exam'?s.downloadExerciseStudent:s.downloadExerciseKey}</button>)}
    </div>}
    <h4>{s.savedExercises}</h4>{!history.length&&<p className="field-help">{s.none}</p>}
    <ul className="saved-presets">{history.map(paper=><li key={paper.id}><button type="button" className="button-secondary" disabled={busy} onClick={()=>{setSaved(paper);setDocuments(null);setError('')}}><bdi>{paper.settings.examTitle}</bdi> — {s.marks(paper.totalMarks)}, <bdi>{paper.savedAt}</bdi></button></li>)}</ul>
  </section>
}
