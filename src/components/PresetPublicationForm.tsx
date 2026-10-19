import {useState} from 'react'
import {provenanceApprovalProblems,type PresetProvenance} from '../domain/presetCuration'
import {publishPresetRevision,type CurationRecord} from '../lib/presetCurationRepository'
import { teacherErrorMessage } from '../lib/safeErrorDetails'

/** Public text is explicitly authored; restricted source notes are never copied. */
export default function PresetPublicationForm({record,reason,onPublished}:{record:CurationRecord;reason:string;onPublished:()=>void}){
  const [provenance,setProvenance]=useState<PresetProvenance>(()=>({...record.provenance,
    sourceReference:'',corpusScope:''}))
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  const fields=[['sourceReference','Public traceable source reference'],['corpusScope','Public assessed corpus scope']] as const
  async function publish(){setBusy(true);setError('')
    try{await publishPresetRevision(record,provenance,reason);onPublished()}
    catch(e){setError(teacherErrorMessage(e, 'Publication failed. Reload before retrying.'));setBusy(false)}
  }
  return <details><summary>Publish approved exact revision</summary>
    <p>These references and question content become visible to all signed-in teachers. Use neutral traceable references. Keep private source identities in restricted source notes.</p>
    <p>Assessed occurrence counts remain exactly as approved.</p>
    {error&&<p role="alert">{error}</p>}
    <fieldset disabled={busy}><legend>Public source details</legend>
      {fields.map(([key,label])=><label key={key}>{label}<textarea name={`publication-${key}`} autoComplete="off"
        maxLength={key==='sourceReference'?500:2000} value={provenance[key]} onChange={e=>setProvenance({...provenance,[key]:e.target.value})}/></label>)}
      <button type="button" disabled={!reason.trim()||provenanceApprovalProblems(provenance).length>0} onClick={()=>void publish()}>Publish for teacher use</button>
    </fieldset>
  </details>
}
