import {useEffect,useState} from 'react'
import {finalizePresetGroupExam,getEligiblePresetGroups,getPresetGroupExams,prepareGroupedPresetDocuments,
  type EligiblePresetGroup,type SavedPresetGroupExam} from '../lib/groupedPresetRepository'
import {describeSourceTrust} from '../domain/presetCuration'
import {DEFAULT_EXAM_SETTINGS} from '../types/exam'
import {downloadPreparedDocument,requestBrowserDownload,type PreparedExamDocumentPair} from '../lib/documentDelivery'
import SourceReference from './SourceReference'
import { PaperStamp } from './CouponProgress'
import { teacherErrorMessage } from '../lib/safeErrorDetails'
const errorText=(e:unknown)=>teacherErrorMessage(e, 'Group preset request failed. Reopen before retrying.')
export default function GroupedPresetExams({ownerId}:{ownerId:string}){
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
  return <section className="preset-section" aria-labelledby="group-presets-title"><div className="preset-section-header"><h3 id="group-presets-title">Complete preset exercise</h3>
    <button type="button" className="button-quiet" disabled={busy} onClick={()=>{reset();setGroups([]);setSelected('');setBusy(true);setReload(n=>n+1)}}>Reload complete presets</button></div>
    <p className="field-help">One reviewed exercise, kept whole with its instruction and how many students answer.</p>
    {busy&&<p role="status">Loading or saving complete exercises…</p>}{error&&<p role="alert">{error}</p>}
    {!busy&&!error&&!groups.length&&<p>No complete approved published exercises are available for this format.</p>}
    <fieldset className="plain-fields" disabled={busy||!!saved}><legend className="visually-hidden">Complete exercise settings</legend>
      <label>Published exercise<select name="preset-complete-exercise" value={selected} onChange={e=>{setSelected(e.target.value);reset()}}>
        <option value="">Choose a complete exercise</option>{groups.map(g=><option key={g.id} value={g.id}>{g.instruction.slice(0,80)} — {g.members.length} displayed, answer {g.attemptCount}</option>)}
      </select></label>
      {(['schoolName','examTitle','teacherName'] as const).map(key=><label key={key}>{key==='schoolName'?'Exercise school name':key==='examTitle'?'Exercise test title':'Exercise teacher name'}
        <input name={`group-preset-${key}`} autoComplete="off" maxLength={80} value={settings[key]??''} onChange={e=>{setSettings({...settings,[key]:e.target.value});reset()}}/></label>)}
      <label>Marks per attempted point<input name="group-preset-marks" type="number" min={1} max={20} value={settings.marksPerQuestion}
        onChange={e=>{setSettings({...settings,marksPerQuestion:Number(e.target.value)});reset()}}/></label>
      {group&&<><p>{group.instruction} Displayed: {group.members.length}. Answer: {group.attemptCount}. Total: {group.attemptCount*settings.marksPerQuestion} marks.</p>
        <ol className="preset-items">{group.members.map(m=><li key={m.revisionId}><p>{m.question.prompt}</p><details className="source-details"><summary>Source and approval</summary>
          <p>{describeSourceTrust(m.provenance)}. </p>
          <p>Approved and published for use in new papers. Reviewer: {m.reviewer}. Publisher: {m.publisher}.</p>
          <p>Reference: <SourceReference value={m.provenance.sourceReference}/>.</p>
          <p>Corpus: {m.provenance.corpusScope||'Not assessed'}. Ministerial occurrences: {m.provenance.ministerialOccurrences??'Not assessed'}. Counts describe the assessed corpus; they do not predict future exams.</p>
        </details></li>)}</ol>
        <button type="button" onClick={()=>void finalize()}>Finalize complete preset exercise</button></>}
    </fieldset>
    {saved&&<div className="finalized-record"><PaperStamp label="Finalized"/><h4>{saved.settings.examTitle}</h4><p>Sealed exercise: {saved.group.members.length} displayed, answer {saved.group.attemptCount}, {saved.totalMarks} marks.</p>
      <ol>{saved.group.members.map(m=><li key={m.revisionId}>{m.question.prompt} — {m.question.marks} marks per attempted point</li>)}</ol>
      <button type="button" disabled={busy} onClick={()=>void prepare()}>Prepare captured exercise documents</button>
      {documents&&(['exam','answerKey'] as const).map(kind=><button key={kind} type="button" onClick={()=>void downloadPreparedDocument(documents[kind],requestBrowserDownload).then(result=>{
        if(result.status==='failed')setError(result.error??'Download failed. Retry this captured document.')
      })}>Download exercise {kind==='exam'?'student paper':'answer key'}</button>)}
    </div>}
    <h4>Saved exercises</h4>{!history.length&&<p className="field-help">None yet.</p>}
    <ul className="saved-presets">{history.map(paper=><li key={paper.id}><button type="button" className="button-secondary" disabled={busy} onClick={()=>{setSaved(paper);setDocuments(null);setError('')}}>{paper.settings.examTitle} — {paper.totalMarks} marks, {paper.savedAt}</button></li>)}</ul>
  </section>
}
