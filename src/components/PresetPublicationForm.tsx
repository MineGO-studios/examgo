import {useState} from 'react'
import {provenanceApprovalProblems,type PresetProvenance} from '../domain/presetCuration'
import {publishPresetRevision,type CurationRecord} from '../lib/presetCurationRepository'
import { localizeAppMessage } from '../lib/appMessages'
import { useI18n } from '../lib/i18n'
import { teacherErrorMessage } from '../lib/safeErrorDetails'
import { PRESET_REVIEW_STRINGS } from './PresetReview.strings'

/** Public text is explicitly authored; restricted source notes are never copied. */
export default function PresetPublicationForm({record,reason,onPublished}:{record:CurationRecord;reason:string;onPublished:()=>void}){
  const { language } = useI18n(), s = PRESET_REVIEW_STRINGS[language].publication
  const [provenance,setProvenance]=useState<PresetProvenance>(()=>({...record.provenance,
    sourceReference:'',corpusScope:''}))
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  const fields=['sourceReference','corpusScope'] as const
  async function publish(){setBusy(true);setError('')
    try{await publishPresetRevision(record,provenance,reason);onPublished()}
    catch(e){setError(teacherErrorMessage(e, PRESET_REVIEW_STRINGS.en.publication.failed));setBusy(false)}
  }
  return <details><summary>{s.summary}</summary>
    <p>{s.intro}</p>
    <p>{s.counts}</p>
    {error&&<p role="alert">{localizeAppMessage(language, error)}</p>}
    <fieldset disabled={busy}><legend>{s.legend}</legend>
      {fields.map((key)=><label key={key}>{s[key]}<textarea name={`publication-${key}`} autoComplete="off" dir="auto"
        maxLength={key==='sourceReference'?500:2000} value={provenance[key]} onChange={e=>setProvenance({...provenance,[key]:e.target.value})}/></label>)}
      <button type="button" disabled={!reason.trim()||provenanceApprovalProblems(provenance).length>0} onClick={()=>void publish()}>{s.publish}</button>
    </fieldset>
  </details>
}
