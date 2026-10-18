import { useEffect, useState, type FormEvent } from 'react'
import { canTransitionCuration, CURATION_STATES, describeSourceTrust, provenanceApprovalProblems,
  type CurationState, type PresetProvenance } from '../domain/presetCuration'
import { getPresetCuration, savePresetProvenance, transitionPresetCuration,
  type CurationDetails, type CurationRecord } from '../lib/presetCurationRepository'
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

export default function PresetCurationDetails({ bankId }: { bankId: string }) {
  const [open,setOpen] = useState(false), [details,setDetails] = useState<CurationDetails | null>(null)
  const [reload,setReload] = useState(0), [error,setError] = useState(''), [busy,setBusy] = useState(false)
  const [selected,setSelected] = useState('bank'), [filter,setFilter] = useState('')
  const [draft,setDraft] = useState<PresetProvenance>(EMPTY), [notes,setNotes] = useState(''), [reason,setReason] = useState('')
  const [editing,setEditing] = useState<CurationRecord | null>(null)
  useEffect(()=>{
    if(!open) return
    let active=true
    void getPresetCuration(bankId).then((data)=>{ if(active) {
      setDetails(data)
      const record=data.records.find((r)=>r.bankId===bankId&&r.revisionId===null)??null
      setSelected('bank');setEditing(record);setDraft(record?.provenance??EMPTY);setNotes(record?.privateNotes??'')
    } })
      .catch((error: unknown)=>{ if(active) {setDetails(null);setError(errorMessage(error))} })
      .finally(()=>{if(active)setBusy(false)})
    return ()=>{active=false}
  },[bankId,open,reload])
  function refresh() { setError('');setBusy(true);setReload((n)=>n+1) }
  const target = details?.targets.find((target)=>target.revisionId===selected)
  const matchingTargets = details?.targets.filter((t)=>t.revisionId!==selected&&
    `${t.externalId} ${t.prompt}`.toLowerCase().includes(filter.toLowerCase())).slice(0,target?99:100)??[]
  const visibleTargets = target?[target,...matchingTargets]:matchingTargets
  function changeTarget(value: string) {
    setSelected(value);setReason('')
    const record=details?.records.find((record)=>record.revisionId===(value==='bank'?null:value) &&
      (value!=='bank'||record.bankId===bankId))??null
    setEditing(record);setDraft(record?.provenance??EMPTY);setNotes(record?.privateNotes??'')
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
    {busy&&<p role="status">Loading or saving preset review…</p>}
    {error&&<p role="alert">{error}</p>}
    <button type="button" disabled={busy} onClick={refresh}>Reload preset details</button>
    {details&&<>
      <p>{details.reviewer?`Authorized reviewer: ${details.reviewer}`:'Preset decisions are restricted to the assigned MineGO reviewer.'}</p>
      {details.reviewer&&<PresetProvenanceImport bankId={bankId} onStaged={refresh}/>}
      {details.records.length===0&&<p>No governed provenance is recorded for this bank. Source reference and educational approval remain unverified.</p>}
      <p>Ministerial repetition counts describe the assessed corpus. They do not predict future exams.</p>
      <label>Find a question or record<input name="curation-search" autoComplete="off" type="search" value={filter} onChange={(event)=>setFilter(event.target.value)} /></label>
      {details.reviewer&&<form onSubmit={(event)=>void save(event)}>
        <fieldset disabled={busy}>
          <legend>Record source evidence</legend>
          <label>Evidence applies to<select name="curation-target" value={selected} onChange={(event)=>changeTarget(event.target.value)}>
            <option value="bank">This bank</option>
            {visibleTargets.map((t)=><option key={t.revisionId} value={t.revisionId}>{t.externalId} — Unit {t.unit}, {t.lesson}: {t.prompt.slice(0,80)} (revision {t.revision})</option>)}
          </select></label>
          <p>Question picker shows up to 100 matches. Use search to narrow the list.</p>
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
      {details.reviewer&&<label>Reason for this save or review decision<textarea value={reason} maxLength={2000} onChange={(event)=>setReason(event.target.value)}/></label>}
      {details.reviewer&&target&&<PresetIdeaAssignment key={target.revisionId} target={target} reason={reason} onAssigned={refresh}/>}
      <div>{details.records.filter((r)=>`${r.prompt??'Bank'} ${r.provenance.sourceReference}`.toLowerCase().includes(filter.toLowerCase())).slice(0,25).map((record)=><details key={record.id}>
        <summary>{record.revisionId?record.prompt:'Bank provenance'} — {record.state}, review version {record.version}</summary>
        <p>{describeSourceTrust(record.provenance)}. Publication: {record.published?'published':'not published'}.</p>
        {record.publication&&<p>Publisher: {record.publication.publisher}. Current eligibility: {record.publication.eligible?'eligible':'unavailable for new selection'}.</p>}
        {record.sourceRevision!==record.currentRevision&&record.revisionId&&<p role="alert">Source revision changed. This review applies only to revision {record.sourceRevision}.</p>}
        <dl>{TEXT_FIELDS.map(([key,label])=><div key={key}><dt>{label}</dt><dd>{key==='sourceReference'?<SourceReference value={record.provenance[key]||'Not supplied'}/>:record.provenance[key]||'Not supplied'}</dd></div>)}</dl>
        <p>Approval: {record.approvedAt?`${record.reviewer}, ${record.approvedAt}`:'No application approval'}.</p>
        <p>Ministerial occurrences: {record.provenance.ministerialOccurrences??'Not assessed'}. Corpus: {record.provenance.corpusScope||'Not supplied'}.</p>
        {provenanceApprovalProblems(record.provenance).length>0&&<ul>{provenanceApprovalProblems(record.provenance).map((problem,index)=><li key={index}>{problem}</li>)}</ul>}
        {details.reviewer&&<>
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
      <p>Record list shows up to 25 matches. Use search to narrow the list. Publication and current eligibility are separate from source activity and approval; grouped content requires every member to be eligible.</p>
    </>}
  </details>
}
