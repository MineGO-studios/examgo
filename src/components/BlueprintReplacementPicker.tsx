import { useEffect, useMemo, useState } from 'react'
import type { CompoundSnapshot } from '../domain/compoundStructure'
import type { BlueprintPool, ExamBlueprint } from '../lib/examBlueprint'
import { getBlueprintReplacementChoices, replaceBlueprintQuestion } from '../lib/examBlueprintReview'
import { projectCompoundPaper } from '../lib/compoundWorkflow'
import type { ExamSettings } from '../types/exam'
import { teacherErrorMessage } from '../lib/safeErrorDetails'

interface Props {
  blueprint: ExamBlueprint
  snapshot: CompoundSnapshot
  pool: BlueprintPool
  branchId: string
  questionId: string | null
  settings: ExamSettings
  generalInstruction: string
  disabled: boolean
  onChoose: (id: string) => void
  onCancel: () => void
}

export default function BlueprintReplacementPicker(props: Props) {
  const [search, setSearch] = useState(''), [page, setPage] = useState(0)
  type Checks = Record<string, { text: string } | { error: string }>
  const supply = useMemo(() => {
    try { return { choices: getBlueprintReplacementChoices(props.blueprint, props.snapshot, props.pool, props.branchId, props.questionId), error: '' } }
    catch (error) { return { choices: [], error: teacherErrorMessage(error, 'Reload the banks and review this section again.') } }
  }, [props.blueprint, props.snapshot, props.pool, props.branchId, props.questionId])
  const filtered = useMemo(() => supply.choices.filter(choice => !search.trim() ||
    [choice.passage, choice.instruction, ...choice.questions.map(q => `${q.prompt} Unit ${q.unit} ${q.lesson} ${q.type} ${q.difficulty}`)]
      .join(' ').toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())), [supply, search])
  const shown = useMemo(() => filtered.slice(page * 25, (page + 1) * 25), [filtered, page])
  const request = useMemo(() => ({ shown, blueprint: props.blueprint, snapshot: props.snapshot, pool: props.pool,
    branchId: props.branchId, questionId: props.questionId, settings: props.settings, generalInstruction: props.generalInstruction }),
  [shown, props.blueprint, props.snapshot, props.pool, props.branchId, props.questionId, props.settings, props.generalInstruction])
  const [result, setResult] = useState<{ request: typeof request; checks: Checks; finished: boolean } | null>(null)
  const checks = result?.request === request ? result.checks : {}
  const checking = result?.request !== request || !result.finished
  useEffect(() => {
    let active = true
    void (async () => {
      await Promise.resolve()
      const next: Checks = {}
      for (let index = 0; index < request.shown.length; index++) {
        if (!active) return
        const choice = request.shown[index]
        try {
          const trial = replaceBlueprintQuestion(request.blueprint, request.snapshot, request.pool, request.branchId, request.questionId, choice.id)
          const units = [...new Set(trial.snapshot.branches.flatMap(b => b.items.map(i => i.question.unit)))].sort()
          const projected = projectCompoundPaper(trial.snapshot, { ...request.settings, unit: units[0] }, request.generalInstruction, units)
          const branch = projected.exam.Branches[trial.snapshot.branches.findIndex(b => b.id === request.branchId)]
          next[choice.id] = { text: [branch.Heading, branch.ArabicInstruction, branch.WordBank, branch.Body, branch.AlternativeA, branch.AlternativeB, branch.AnswerSpace].filter(Boolean).join('\n') }
        } catch (error) { next[choice.id] = { error: teacherErrorMessage(error, 'This candidate cannot preserve the section rules.') } }
        if (!active) return
        if ((index + 1) % 5 === 0) { setResult({ request, checks: { ...next }, finished: false }); await new Promise(resolve => setTimeout(resolve, 0)) }
      }
      if (active) setResult({ request, checks: next, finished: true })
    })()
    return () => { active = false }
  }, [request])
  const branch = props.snapshot.branches.find(b => b.id === props.branchId)!
  return <section className="blueprint-replacements" aria-label="Choose a replacement">
    <h3>Replace in Q{branch.mainQuestionNumber}{branch.branchLabel ? '/' + branch.branchLabel : ''}</h3>
    <p>Only a checked, valid choice can replace this selection. Complete groups stay together. Your paper stays unchanged until you choose.</p>
    <label>Search replacement candidates<input type="search" value={search} disabled={props.disabled} onChange={event => { setSearch(event.target.value); setPage(0) }} /></label>
    {supply.error && <p role="alert">{supply.error}</p>}
    {checking && <p role="status">Checking this page against the complete paper…</p>}
    {shown.map((choice, index) => {
      const check = checks[choice.id]
      return <article className="blueprint-candidate" aria-label={`Replacement option ${page * 25 + index + 1}`} key={choice.id}>
        <p dir="auto">{choice.questions[0].prompt}</p>
        <p className="field-help">{choice.questions.length} {choice.questions.length > 1 ? 'linked questions' : 'question'} · Units {[...new Set(choice.questions.map(q => q.unit))].join(', ')} · {choice.questions[0].type.replaceAll('-', ' ')} · {choice.questions[0].difficulty}</p>
        {check && 'text' in check && <details><summary>Review complete candidate in this section</summary>
          {choice.instruction && <p dir="auto">Source instruction: {choice.instruction}</p>}
          <p className="structured-question-content" dir="auto">{check.text}</p>
        </details>}
        {check && 'error' in check && <p className="field-help">Unavailable: {check.error}</p>}
        <button type="button" disabled={props.disabled || !check || 'error' in check} onClick={() => props.onChoose(choice.id)}>Use replacement {page * 25 + index + 1}</button>
      </article>
    })}
    {!shown.length && <p>No replacement matches this search and section. Change the search or branch filters, or add complete eligible questions. Your paper is unchanged.</p>}
    <div className="recovery-actions"><button type="button" disabled={props.disabled || page === 0} onClick={() => setPage(n => n - 1)}>Previous replacements</button>
      <span>Page {page + 1}</span><button type="button" disabled={props.disabled || (page + 1) * 25 >= filtered.length} onClick={() => setPage(n => n + 1)}>Next replacements</button>
      <button type="button" disabled={props.disabled} onClick={props.onCancel}>Keep current selection</button></div>
  </section>
}
