import { useState } from 'react'
import { assignPresetQuestionIdeas, type CurationTarget } from '../lib/presetCurationRepository'
import { teacherErrorMessage } from '../lib/safeErrorDetails'

export default function PresetIdeaAssignment({target,reason,onAssigned}:{target:CurationTarget;reason:string;onAssigned:()=>void}){
  const [idea,setIdea]=useState(target.ideaKey??''),[busy,setBusy]=useState(false),[error,setError]=useState('')
  async function assign(){setBusy(true);setError('')
    try{await assignPresetQuestionIdeas([{revisionId:target.revisionId,ideaKey:idea}],reason);onAssigned()}
    catch(e){setError(teacherErrorMessage(e, 'Idea mapping failed. Reload before retrying.'));setBusy(false)}
  }
  return <fieldset disabled={busy}><legend>Question variety</legend>
    <p>Variants of the same idea use the same name within a unit, such as asking-age. Answers may repeat. Different ideas remain separate.</p>
    {target.ideaKey&&<p>Current idea: {target.ideaKey}</p>}
    {error&&<p role="alert">{error}</p>}
    <label>Tested idea<input name="preset-question-idea" autoComplete="off" value={idea} maxLength={120}
      pattern="[a-z0-9][a-z0-9._-]{0,119}" onChange={e=>setIdea(e.target.value)}/></label>
    <button type="button" disabled={!reason.trim()||!/^[a-z0-9][a-z0-9._-]{0,119}$/.test(idea)} onClick={()=>void assign()}>Save reviewed idea</button>
    <p>Unmapped ideas remain unavailable for new preset selection. One reviewed batch can assign many revisions.</p>
  </fieldset>
}
