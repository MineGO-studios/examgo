import type { PresetBrowserGroup, PresetBrowserQuestion } from '../lib/presetBankRepository'
export default function PublishedPresetGroups({groups,questions}:{groups:PresetBrowserGroup[];questions:PresetBrowserQuestion[]}) {
  const byId=new Map(questions.map(question=>[question.id,question]))
  return <section className="bank-focus" aria-label="Published passages and exercises"><h3>Passages and exercises</h3>
    {groups.length===0?<p>No published passages or linked exercises are available in this bank.</p>:groups.map(group=><details key={group.id}>
      <summary>{group.title||group.instructions||group.type.replaceAll('-',' ')}</summary>
      {group.instructions&&<p dir="auto">{group.instructions}</p>}
      {group.passage&&<p className="structured-question-content" dir="auto">{group.passage}</p>}
      {group.arabicInstruction&&<p lang="ar" dir="rtl">{group.arabicInstruction}</p>}
      <ol>{group.questionIds.map(id=><li key={id} dir="auto">{byId.get(id)?.prompt}</li>)}</ol>
    </details>)}
  </section>
}
