import {useEffect,useState,type ChangeEvent} from 'react'
import {listStagedImportsForBank,type StagedImportSummary} from '../lib/questionImportRepository'
import {readBackPresetProvenance} from '../lib/presetCurationRepository'
import {supabase} from '../lib/supabase'
import { teacherErrorMessage } from '../lib/safeErrorDetails'
import {packPresetProvenanceBatches,prepareCataloguePresetProvenance,previewPresetProvenanceImport,stagePresetProvenanceBatch,
  verifyPresetProvenanceReadback,type PresetImportPreview} from '../lib/presetProvenanceImport'
const errorText=(e:unknown)=>teacherErrorMessage(e, 'Governed intake failed. Reopen before retrying.')
function download(value:unknown,name:string){
  const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}))
  const anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.click()
  window.setTimeout(()=>URL.revokeObjectURL(url),1000)
}
export default function PresetProvenanceImport({bankId,onStaged}:{bankId:string;onStaged:()=>void}){
  const [imports,setImports]=useState<StagedImportSummary[]>([]),[selected,setSelected]=useState('')
  const [preview,setPreview]=useState<PresetImportPreview|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const [reason,setReason]=useState(''),[report,setReport]=useState<unknown>(null)
  const [batches,setBatches]=useState<{id:string;entries:PresetImportPreview['document']['entries']}[]>([])
  useEffect(()=>{let active=true;void listStagedImportsForBank(bankId).then(rows=>{if(active){setImports(rows);setSelected(rows[0]?.id??'')}})
    .catch((e:unknown)=>{if(active)setError(errorText(e))});return()=>{active=false}},[bankId])
  function setDocument(text:string){
    const next=previewPresetProvenanceImport(text);setPreview(next);setReport(null)
    setBatches(packPresetProvenanceBatches(next.document.entries).map(entries=>({id:crypto.randomUUID(),entries})))
  }
  async function prepare(){setBusy(true);setError('')
    try{setDocument(JSON.stringify(await prepareCataloguePresetProvenance(bankId,selected)))}catch(e){setError(errorText(e))}finally{setBusy(false)}
  }
  async function file(event:ChangeEvent<HTMLInputElement>){const chosen=event.target.files?.[0];if(!chosen)return;setError('');setPreview(null)
    try{if(!chosen.name.toLowerCase().endsWith('.json')||chosen.size>32*1024*1024)throw new Error('Choose a versioned provenance JSON file up to 32 MiB.')
      setDocument(await chosen.text())}catch(e){setError(errorText(e))}
  }
  async function stage(){if(!preview)return;setBusy(true);setError('')
    const results=[]
    try{const {data:auth,error:authError}=await supabase.auth.getUser()
      if(authError||!auth.user)throw new Error('Sign in again before governed intake.')
      for(const batch of batches)results.push(await stagePresetProvenanceBatch(batch.id,preview.document,batch.entries,reason))
      const readback=await readBackPresetProvenance(bankId,preview.document.entries.map(entry=>entry.id))
      verifyPresetProvenanceReadback(preview.document.entries,readback)
      setReport({date:new Date().toISOString(),environment:import.meta.env.VITE_SUPABASE_URL,bankId,ownerId:auth.user.id,importId:preview.document.importId,
        sourceSha256:preview.document.sourceSha256,schemaVersion:1,mappingVersion:1,
        created:results.reduce((n,r)=>n+r.created,0),skipped:results.reduce((n,r)=>n+r.skipped,0),updated:0,rejected:0,
        incomplete:preview.incomplete,batches:results,approval:'No approval or publication performed',readback:`${preview.document.entries.length} exact provenance records and protected batch receipts confirmed`})
      onStaged()
    }catch(e){setError(errorText(e));setReport({completedBatches:results,status:'Partial; retry the same batch identities. No approval or publication performed.'})}
    finally{setBusy(false)}
  }
  return <details><summary>Governed catalogue provenance intake</summary>
    <p>Reuses original private staging and exact canonical conversion receipts. Source review flags remain evidence. This intake records draft provenance; approval and publication require separate reviewer decisions.</p>
    {error&&<p role="alert">{error}</p>}{busy&&<p role="status">Preparing or staging governed provenance…</p>}
    <fieldset disabled={busy}><legend>Prepare exact saved release</legend>
      <label>Source import<select name="preset-source-import" value={selected} onChange={e=>{setSelected(e.target.value);setPreview(null)}}>
        {imports.map(i=><option key={i.id} value={i.id}>{i.sourceNamespace} — {i.stagedRows}/{i.expectedRows} source rows</option>)}</select></label>
      <button type="button" disabled={!selected} onClick={()=>void prepare()}>Prepare catalogue provenance template</button>
      <label>Versioned provenance JSON<input name="preset-provenance-file" type="file" accept=".json,application/json" onChange={e=>void file(e)}/></label>
    </fieldset>
    {preview&&<><p>{preview.document.entries.length} valid exact revisions; {preview.duplicates.length} duplicate rows; {preview.rejected.length} rejected rows; {preview.incomplete.length} rows with missing educational evidence.</p>
      <p>Release SHA-256: {preview.document.sourceSha256}. Source import: {preview.document.importId}.</p>
      <button type="button" onClick={()=>download(preview.document,'examgo-preset-provenance-template.json')}>Download editable provenance template</button>
      <button type="button" onClick={()=>download(preview,'examgo-preset-provenance-preview.json')}>Download full preview report</button>
      <details><summary>View versioned provenance JSON</summary>
        <label>Editable template contents<textarea name="preset-template-contents" readOnly value={JSON.stringify(preview.document,null,2)}/></label>
      </details>
      <label>Draft intake reason<textarea name="preset-intake-reason" maxLength={2000} value={reason} onChange={e=>setReason(e.target.value)}/></label>
      <button type="button" disabled={busy||!reason.trim()||preview.rejected.length>0||preview.duplicates.length>0}
        onClick={()=>void stage()}>Stage draft provenance</button>
    </>}
    {report!==null&&<><p role="status">Governed intake report is available. Inspect totals and batch readback.</p>
      <button type="button" onClick={()=>download(report,'examgo-governed-intake-report.json')}>Download governed intake report</button>
      <details><summary>Inspect governed intake report</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(report,null,2)}</pre></details></>}
  </details>
}
