import { useEffect, useRef, useState, type FormEvent } from 'react'
import { canTransitionCuration, CURATION_STATES, describeSourceTrust, provenanceApprovalProblems,
  type CurationState, type PresetProvenance } from '../domain/presetCuration'
import { getPresetCurationView, savePresetProvenance, transitionPresetCuration,
  type CurationRecord, type CurationView } from '../lib/presetCurationRepository'
import PresetPublicationForm from './PresetPublicationForm'
import PresetProvenanceImport from './PresetProvenanceImport'
import SourceReference from './SourceReference'
import PresetIdeaAssignment from './PresetIdeaAssignment'
import { teacherErrorMessage } from '../lib/safeErrorDetails'

const EMPTY: PresetProvenance = { schemaVersion: 2, sourceReference: '', corpusScope: '',
  ministerialOccurrences: null, missingEvidence: [] }
const TEXT_FIELDS = [['sourceReference','Neutral, traceable source reference'], ['corpusScope','Assessed corpus scope']] as const

function errorMessage(error: unknown) { return teacherErrorMessage(error, 'Preset review failed. Reload and retry.') }
function EvidenceValues({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span>Not supplied</span>
  if (Array.isArray(value)) return <ol>{value.map((item,index)=><li key={index}><EvidenceValues value={item} /></li>)}</ol>
  if (typeof value === 'object') return <dl>{Object.entries(value).filter(([key])=>key!=='schemaVersion' && key!=='type').map(([key,item])=><div key={key}>
    <dt>{key.replace(/([A-Z])/g,' $1')}</dt><dd><EvidenceValues value={item} /></dd></div>)}</dl>
  return <span style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{String(value)}</span>
}

const SEARCH_DELAY_MS = 300

/**
 * Loads one searched page at a time (MIN-49): 25 records, 100 picker questions, the bank record and the
 * selected question. Large banks no longer build every record and eligibility check in one response.
 */
export default function PresetCurationDetails({ bankId }: { bankId: string }) {
  const [open,setOpen] = useState(false), [view,setView] = useState<CurationView | null>(null)
  const [reload,setReload] = useState(0), [error,setError] = useState(''), [busy,setBusy] = useState(false)
  const [selected,setSelected] = useState('bank'), [filter,setFilter] = useState(''), [query,setQuery] = useState('')
  const [draft,setDraft] = useState<PresetProvenance>(EMPTY), [notes,setNotes] = useState(''), [reason,setReason] = useState('')
  const [editing,setEditing] = useState<CurationRecord | null>(null), [loadedKey,setLoadedKey] = useState('')
  // Set when the draft form should be refilled from the next readback (open, reload or a new selection).
  const syncDraft = useRef(true)
  const key = `${bankId}|${reload}|${query}|${selected}`
  const loading = open && loadedKey !== key
  useEffect(()=>{
    const timer=setTimeout(()=>setQuery(filter),SEARCH_DELAY_MS)
    return ()=>clearTimeout(timer)
  },[filter])
  useEffect(()=>{
    if(!open) return
    let active=true
    void getPresetCurationView(bankId,{search:query,revisionId:selected==='bank'?null:selected}).then((data)=>{ if(active) {
      setView(data)
      if(syncDraft.current){
        syncDraft.current=false
        const record=selected==='bank'?data.bankRecord:data.selectedRecord
        setEditing(record);setDraft(record?.provenance??EMPTY);setNotes(record?.privateNotes??'')
      }
    } })
      .catch((error: unknown)=>{ if(active) {setView(null);setError(errorMessage(error))} })
      .finally(()=>{if(active){setBusy(false);setLoadedKey(key)}})
    return ()=>{active=false}
  },[bankId,open,query,selected,key])
  function refresh() { setError('');setBusy(true);syncDraft.current=true;setSelected('bank');setReload((n)=>n+1) }
  const target = selected!=='bank'&&view?.selectedTarget?.revisionId===selected?view.selectedTarget:undefined
  const visibleTargets = view?(target?[target,...view.targets.filter((t)=>t.revisionId!==target.revisionId)].slice(0,100):view.targets):[]
  function changeTarget(value: string) {
    setReason('')
    if(value===selected){
      const record=value==='bank'?view?.bankRecord??null:view?.selectedRecord??null
      setEditing(record);setDraft(record?.provenance??EMPTY);setNotes(record?.privateNotes??'')
      return
    }
    syncDraft.current=true;setSelected(value)
  }
  async function save(event: FormEvent) {
    event.preventDefault();setError('');setBusy(true)
    try {
      await savePresetProvenance({id:editing?.id??crypto.randomUUID(),bankId:target?.bankId??bankId,
        revisionId:target?.revisionId??null,expectedVersion:editing?.version??0,provenance:draft,privateNotes:notes,reason})
      setEditing(null);setSelected('bank');setDraft(EMPTY);setNotes('');setReason('');refresh()
    } catch(error) {setError(errorMessage(error));setBusy(false)}
  }
  async function transition(record: CurationRecord,next: CurationState) {
    setError('');setBusy(true)
    try { await transitionPresetCuration(record,next,reason);setReason('');refresh() }
    catch(error) {setError(errorMessage(error));setBusy(false)}
  }
  return <details className="csv-import preset-curation" open={open} onToggle={(event)=>{
    const next=event.currentTarget.open
    if(next&&!open){setError('');setBusy(true)}
    setOpen(next)
  }}>
    <summary>Preset trust, provenance and review</summary>
    <p>Private bank activity and source review flags do not grant preset approval. Approval and all-user publication are separate decisions.</p>
    {(busy||loading)&&<p role="status">Loading or saving preset review…</p>}
    {error&&<p role="alert">{error}</p>}
    <button type="button" disabled={busy} onClick={refresh}>Reload preset details</button>
    {view&&<>
      <p>{view.reviewer?`Authorized reviewer: ${view.reviewer}`:'Preset decisions are restricted to the assigned MineGO reviewer.'}</p>
      {view.reviewer&&<PresetProvenanceImport bankId={bankId} onStaged={refresh}/>}
      {!query&&view.recordCount===0&&<p>No governed provenance is recorded for this bank. Source reference and educational approval remain unverified.</p>}
      <p>Ministerial repetition counts describe the assessed corpus. They do not predict future exams.</p>
      <label>Find a question or record<input name="curation-search" autoComplete="off" type="search" maxLength={200} value={filter} onChange={(event)=>setFilter(event.target.value)} /></label>
      {view.reviewer&&<form onSubmit={(event)=>void save(event)}>
        <fieldset disabled={busy||loading}>
          <legend>Record source evidence</legend>
          <label>Evidence applies to<select name="curation-target" value={selected} onChange={(event)=>changeTarget(event.target.value)}>
            <option value="bank">This bank</option>
            {selected!=='bank'&&!target&&<option value={selected}>Loading the selected question…</option>}
            {visibleTargets.map((t)=><option key={t.revisionId} value={t.revisionId}>{t.externalId} — Unit {t.unit}, {t.lesson}: {t.prompt.slice(0,80)} (revision {t.revision})</option>)}
          </select></label>
          <p>Question picker shows {Math.min(view.targets.length,100)} of {view.targetCount} matching questions. Use search to narrow the list.</p>
          {target&&<div><h4>Exact source revision</h4><p>{target.prompt}</p><EvidenceValues value={target.content}/><h4>Source answer</h4><EvidenceValues value={target.answer}/></div>}
          {TEXT_FIELDS.map(([key,label])=><label key={key}>{label}<textarea name={`curation-${key}`} autoComplete="off" value={draft[key]} maxLength={key==='sourceReference'?500:2000}
            onChange={(event)=>setDraft({...draft,[key]:event.target.value})}/></label>)}
          <label>Verified ministerial occurrences<input type="number" min={0} max={100000} value={draft.ministerialOccurrences??''}
            onChange={(event)=>setDraft({...draft,ministerialOccurrences:event.target.value===''?null:Number(event.target.value)})}/></label>
          <label>Missing evidence (one item per line)<textarea value={draft.missingEvidence.join('\n')} maxLength={10000}
            onChange={(event)=>setDraft({...draft,missingEvidence:event.target.value.split('\n').filter((line)=>line.trim())})}/></label>
          <label>Private source notes (reviewers only)<textarea value={notes} maxLength={10000} onChange={(event)=>setNotes(event.target.value)}/></label>
          <button type="submit" disabled={!!editing&&editing.state!=='draft'}>Save draft provenance</button>
        </fieldset>
      </form>}
      {view.reviewer&&<label>Reason for this save or review decision<textarea value={reason} maxLength={2000} onChange={(event)=>setReason(event.target.value)}/></label>}
      {view.reviewer&&target&&<PresetIdeaAssignment key={target.revisionId} target={target} reason={reason} onAssigned={refresh}/>}
      <div>{view.records.map((record)=><details key={record.id}>
        <summary>{record.revisionId?record.prompt:'Bank provenance'} — {record.state}, review version {record.version}</summary>
        <p>{describeSourceTrust(record.provenance)}. Publication: {record.published?'published':'not published'}.</p>
        {record.publication&&<p>Publisher: {record.publication.publisher}. Current eligibility: {record.publication.eligible?'eligible':'unavailable for new selection'}.</p>}
        {record.sourceRevision!==record.currentRevision&&record.revisionId&&<p role="alert">Source revision changed. This review applies only to revision {record.sourceRevision}.</p>}
        <dl>{TEXT_FIELDS.map(([key,label])=><div key={key}><dt>{label}</dt><dd>{key==='sourceReference'?<SourceReference value={record.provenance[key]||'Not supplied'}/>:record.provenance[key]||'Not supplied'}</dd></div>)}</dl>
        <p>Approval: {record.approvedAt?`${record.reviewer}, ${record.approvedAt}`:'No application approval'}.</p>
        <p>Ministerial occurrences: {record.provenance.ministerialOccurrences??'Not assessed'}. Corpus: {record.provenance.corpusScope||'Not supplied'}.</p>
        {provenanceApprovalProblems(record.provenance).length>0&&<ul>{provenanceApprovalProblems(record.provenance).map((problem,index)=><li key={index}>{problem}</li>)}</ul>}
        {view.reviewer&&<>
          {record.state==='approved'&&record.revisionId&&!record.published&&<PresetPublicationForm key={`${record.id}:${record.version}`} record={record} reason={reason} onPublished={refresh}/>}
          {record.state==='draft'&&<button type="button" disabled={busy} onClick={()=>changeTarget(record.revisionId??'bank')}>Edit provenance</button>}
          {CURATION_STATES.filter((state)=>canTransitionCuration(record.state,state)).map((state)=><button key={state} type="button"
            disabled={busy||!reason.trim()||(state==='approved'&&provenanceApprovalProblems(record.provenance).length>0)}
            onClick={()=>void transition(record,state)}>{state==='in-review'?'Start review':state==='approved'?'Approve exact revision':state==='draft'?'Return to draft':state==='withdrawn'?'Withdraw':'Mark superseded'}</button>)}
        </>}
        <details><summary>Revision and review history</summary><ol>{record.history.map((h)=><li key={h.version}>
          {h.state} — {h.actor}, {h.createdAt}: {h.reason}<details><summary>Evidence at this decision</summary><EvidenceValues value={h.provenance}/>
          {h.privateNotes!==null&&<p>Private notes: {h.privateNotes}</p>}</details></li>)}</ol></details>
      </details>)}</div>
      <p>Record list shows {view.records.length} of {view.recordCount} matching records. Use search to narrow the list. Publication and current eligibility are separate from source activity and approval; grouped content requires every member to be eligible.</p>
    </>}
  </details>
}
