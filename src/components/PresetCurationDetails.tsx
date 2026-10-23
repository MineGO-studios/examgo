import { useEffect, useRef, useState, type FormEvent } from 'react'
import { canTransitionCuration, CURATION_STATES, provenanceApprovalProblems,
  type CurationState, type PresetProvenance } from '../domain/presetCuration'
import { getPresetCurationView, savePresetProvenance, transitionPresetCuration,
  type CurationRecord, type CurationView } from '../lib/presetCurationRepository'
import PresetPublicationForm from './PresetPublicationForm'
import PresetProvenanceImport from './PresetProvenanceImport'
import SourceReference from './SourceReference'
import PresetIdeaAssignment from './PresetIdeaAssignment'
import { localizeAppMessage } from '../lib/appMessages'
import { useI18n } from '../lib/i18n'
import { formatDate } from '../lib/localize'
import { teacherErrorMessage } from '../lib/safeErrorDetails'
import { PRESET_REVIEW_STRINGS } from './PresetReview.strings'

const EMPTY: PresetProvenance = { schemaVersion: 2, sourceReference: '', corpusScope: '',
  ministerialOccurrences: null, missingEvidence: [] }
const TEXT_FIELDS = ['sourceReference', 'corpusScope'] as const

function errorMessage(error: unknown) { return teacherErrorMessage(error, PRESET_REVIEW_STRINGS.en.curation.failed) }
/** Source records keep their own field names and wording; only the empty marker follows the interface language. */
function EvidenceValues({ value, empty }: { value: unknown; empty: string }) {
  if (value === null || value === undefined) return <span>{empty}</span>
  if (Array.isArray(value)) return <ol>{value.map((item,index)=><li key={index}><EvidenceValues value={item} empty={empty} /></li>)}</ol>
  if (typeof value === 'object') return <dl>{Object.entries(value).filter(([key])=>key!=='schemaVersion' && key!=='type').map(([key,item])=><div key={key}>
    <dt dir="ltr">{key.replace(/([A-Z])/g,' $1')}</dt><dd><EvidenceValues value={item} empty={empty} /></dd></div>)}</dl>
  return <span dir="auto" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{String(value)}</span>
}

const SEARCH_DELAY_MS = 300

/**
 * Loads one searched page at a time (MIN-49): 25 records, 100 picker questions, the bank record and the
 * selected question. Large banks no longer build every record and eligibility check in one response.
 */
export default function PresetCurationDetails({ bankId }: { bankId: string }) {
  const { language } = useI18n(), s = PRESET_REVIEW_STRINGS[language].curation
  const comma = language === 'ar' ? '، ' : ', '
  const when = (value: string) => formatDate(language, value, { dateStyle: 'medium', timeStyle: 'short' })
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
    <summary>{s.summary}</summary>
    <p>{s.intro}</p>
    {(busy||loading)&&<p role="status">{s.busy}</p>}
    {error&&<p role="alert">{localizeAppMessage(language, error)}</p>}
    <button type="button" disabled={busy} onClick={refresh}>{s.reload}</button>
    {view&&<>
      <p>{view.reviewer?<>{s.reviewer} <bdi>{view.reviewer}</bdi></>:s.restricted}</p>
      {view.reviewer&&<PresetProvenanceImport bankId={bankId} onStaged={refresh}/>}
      {!query&&view.recordCount===0&&<p>{s.noRecords}</p>}
      <p>{s.occurrencesNote}</p>
      <label>{s.search}<input name="curation-search" autoComplete="off" type="search" maxLength={200} value={filter} onChange={(event)=>setFilter(event.target.value)} /></label>
      {view.reviewer&&<form onSubmit={(event)=>void save(event)}>
        <fieldset disabled={busy||loading}>
          <legend>{s.recordLegend}</legend>
          <label>{s.appliesTo}<select name="curation-target" value={selected} onChange={(event)=>changeTarget(event.target.value)}>
            <option value="bank">{s.thisBank}</option>
            {selected!=='bank'&&!target&&<option value={selected}>{s.loadingSelected}</option>}
            {visibleTargets.map((t)=><option key={t.revisionId} value={t.revisionId}>{s.targetOption(t.externalId,t.unit,t.lesson,t.prompt.slice(0,80),t.revision)}</option>)}
          </select></label>
          <p>{s.pickerShows(Math.min(view.targets.length,100),view.targetCount)}</p>
          {target&&<div><h4>{s.exactRevision}</h4><p dir="auto">{target.prompt}</p><EvidenceValues value={target.content} empty={s.notSupplied}/><h4>{s.sourceAnswer}</h4><EvidenceValues value={target.answer} empty={s.notSupplied}/></div>}
          {TEXT_FIELDS.map((key)=><label key={key}>{s[key]}<textarea name={`curation-${key}`} autoComplete="off" dir="auto" value={draft[key]} maxLength={key==='sourceReference'?500:2000}
            onChange={(event)=>setDraft({...draft,[key]:event.target.value})}/></label>)}
          <label>{s.occurrences}<input type="number" min={0} max={100000} value={draft.ministerialOccurrences??''}
            onChange={(event)=>setDraft({...draft,ministerialOccurrences:event.target.value===''?null:Number(event.target.value)})}/></label>
          <label>{s.missingEvidence}<textarea dir="auto" value={draft.missingEvidence.join('\n')} maxLength={10000}
            onChange={(event)=>setDraft({...draft,missingEvidence:event.target.value.split('\n').filter((line)=>line.trim())})}/></label>
          <label>{s.privateNotes}<textarea dir="auto" value={notes} maxLength={10000} onChange={(event)=>setNotes(event.target.value)}/></label>
          <button type="submit" disabled={!!editing&&editing.state!=='draft'}>{s.saveDraft}</button>
        </fieldset>
      </form>}
      {view.reviewer&&<label>{s.reason}<textarea dir="auto" value={reason} maxLength={2000} onChange={(event)=>setReason(event.target.value)}/></label>}
      {view.reviewer&&target&&<PresetIdeaAssignment key={target.revisionId} target={target} reason={reason} onAssigned={refresh}/>}
      <div>{view.records.map((record)=><details key={record.id}>
        <summary>{record.revisionId?<bdi>{record.prompt}</bdi>:s.bankProvenance} — {s.recordSummary(s.states[record.state],record.version)}</summary>
        <p>{record.provenance.sourceReference.trim()?s.traceable:s.sourceMissing}. {s.publication(record.published)}</p>
        {record.publication&&<p>{s.publisher} <bdi>{record.publication.publisher}</bdi>. {s.eligibility(record.publication.eligible)}</p>}
        {record.sourceRevision!==record.currentRevision&&record.revisionId&&<p role="alert">{s.revisionChanged(record.sourceRevision)}</p>}
        <dl>{TEXT_FIELDS.map((key)=><div key={key}><dt>{s[key]}</dt><dd>{key==='sourceReference'?<SourceReference value={record.provenance[key]||s.notSupplied}/>:<bdi>{record.provenance[key]||s.notSupplied}</bdi>}</dd></div>)}</dl>
        <p>{s.approval} {record.approvedAt?<><bdi>{record.reviewer}</bdi>{comma}{when(record.approvedAt)}</>:s.noApproval}.</p>
        <p>{s.occurrencesValue} {record.provenance.ministerialOccurrences??s.notAssessed}. {s.corpus} <bdi>{record.provenance.corpusScope||s.notSupplied}</bdi>.</p>
        {provenanceApprovalProblems(record.provenance).length>0&&<ul>{provenanceApprovalProblems(record.provenance).map((problem,index)=><li key={index} dir="auto">{localizeAppMessage(language, problem)}</li>)}</ul>}
        {view.reviewer&&<>
          {record.state==='approved'&&record.revisionId&&!record.published&&<PresetPublicationForm key={`${record.id}:${record.version}`} record={record} reason={reason} onPublished={refresh}/>}
          {record.state==='draft'&&<button type="button" disabled={busy} onClick={()=>changeTarget(record.revisionId??'bank')}>{s.editProvenance}</button>}
          {CURATION_STATES.filter((state)=>canTransitionCuration(record.state,state)).map((state)=><button key={state} type="button"
            disabled={busy||!reason.trim()||(state==='approved'&&provenanceApprovalProblems(record.provenance).length>0)}
            onClick={()=>void transition(record,state)}>{s.actions[state]}</button>)}
        </>}
        <details><summary>{s.history}</summary><ol>{record.history.map((h)=><li key={h.version}>
          {s.states[h.state]} — <bdi>{h.actor}</bdi>{comma}{when(h.createdAt)}: <bdi>{h.reason}</bdi><details><summary>{s.evidenceAtDecision}</summary><EvidenceValues value={h.provenance} empty={s.notSupplied}/>
          {h.privateNotes!==null&&<p>{s.historyNotes} <bdi>{h.privateNotes}</bdi></p>}</details></li>)}</ol></details>
      </details>)}</div>
      <p>{s.recordsShow(view.records.length,view.recordCount)}</p>
    </>}
  </details>
}
