import { useState } from 'react'
import { assignPresetQuestionIdeas, type CurationTarget } from '../lib/presetCurationRepository'
import { localizeAppMessage } from '../lib/appMessages'
import { useI18n } from '../lib/i18n'
import { teacherErrorMessage } from '../lib/safeErrorDetails'
import { PRESET_REVIEW_STRINGS } from './PresetReview.strings'

export default function PresetIdeaAssignment({target,reason,onAssigned}:{target:CurationTarget;reason:string;onAssigned:()=>void}){
  const { language } = useI18n(), s = PRESET_REVIEW_STRINGS[language].idea
  const [idea,setIdea]=useState(target.ideaKey??''),[busy,setBusy]=useState(false),[error,setError]=useState('')
  async function assign(){setBusy(true);setError('')
    try{await assignPresetQuestionIdeas([{revisionId:target.revisionId,ideaKey:idea}],reason);onAssigned()}
    catch(e){setError(teacherErrorMessage(e, PRESET_REVIEW_STRINGS.en.idea.failed));setBusy(false)}
  }
  return <fieldset disabled={busy}><legend>{s.legend}</legend>
    <p>{s.introLead} <code dir="ltr">asking-age</code>{s.introRest}</p>
    {target.ideaKey&&<p>{s.current} <bdi>{target.ideaKey}</bdi></p>}
    {error&&<p role="alert">{localizeAppMessage(language, error)}</p>}
    <label>{s.tested}<input name="preset-question-idea" autoComplete="off" value={idea} maxLength={120} dir="ltr"
      pattern="[a-z0-9][a-z0-9._-]{0,119}" onChange={e=>setIdea(e.target.value)}/></label>
    <button type="button" disabled={!reason.trim()||!/^[a-z0-9][a-z0-9._-]{0,119}$/.test(idea)} onClick={()=>void assign()}>{s.save}</button>
    <p>{s.unmapped}</p>
  </fieldset>
}
