import type { PresetBrowserGroup, PresetBrowserQuestion } from '../lib/presetBankRepository'
import { useI18n } from '../lib/i18n'
import { QUESTION_BANK_STRINGS } from './QuestionBanks.strings'
export default function PublishedPresetGroups({groups,questions}:{groups:PresetBrowserGroup[];questions:PresetBrowserQuestion[]}) {
  const s=QUESTION_BANK_STRINGS[useI18n().language]
  const byId=new Map(questions.map(question=>[question.id,question]))
  return <section className="bank-focus" aria-label={s.publishedGroups}><h3>{s.passagesTitle}</h3>
    {groups.length===0?<p>{s.noGroups}</p>:groups.map(group=><details key={group.id}>
      <summary dir="auto">{group.title||group.instructions||group.type.replaceAll('-',' ')}</summary>
      {group.instructions&&<p dir="auto">{group.instructions}</p>}
      {group.passage&&<p className="structured-question-content" dir="auto">{group.passage}</p>}
      {group.arabicInstruction&&<p lang="ar" dir="rtl">{group.arabicInstruction}</p>}
      <ol>{group.questionIds.map(id=><li key={id} dir="auto">{byId.get(id)?.prompt}</li>)}</ol>
    </details>)}
  </section>
}
