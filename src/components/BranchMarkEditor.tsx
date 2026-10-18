import { useState } from 'react'
import { compoundBranchPointIds, type CompoundBranch } from '../domain/compoundStructure'
import { assignAttemptMarks, questionPointIds, type MarkDistribution } from '../domain/markAllocation'
import type { PhaseNineBranch } from '../lib/phaseNineWorkflow'
import { teacherErrorMessage } from '../lib/safeErrorDetails'

interface Props {
  branch: CompoundBranch | PhaseNineBranch
  disabled: boolean
  onApply: (total: number, distribution: MarkDistribution) => void
  onPendingChange: (pending: boolean) => void
  onCancel?: () => void
}

export default function BranchMarkEditor({ branch, disabled, onApply, onPendingChange, onCancel }: Props) {
  const points = 'layout' in branch ? branch.items.flatMap((item) => questionPointIds(item.question)) : compoundBranchPointIds(branch)
  const initialMarks = branch.pointMarks ?? Object.fromEntries(assignAttemptMarks(points, branch.marks,
    branch.attemptCount, { mode: 'equal' }).pointMarks.map(({ pointId, marks }) => [pointId, marks]))
  const [total, setTotal] = useState(String(branch.marks))
  const [mode, setMode] = useState<'equal' | 'custom'>(new Set(Object.values(initialMarks)).size > 1 ? 'custom' : 'equal')
  const [values, setValues] = useState(Object.fromEntries(points.map((id) => [id, String(initialMarks[id])])))
  const [error, setError] = useState('')
  const question = branch.items[0].question
  const labels = question.type === 'matching' ? question.content.left.map((pair) => pair.text)
    : question.type === 'completion' ? branch.items.flatMap((item) => item.question.type === 'completion' ? item.question.content.text.split(/\r?\n/) : [])
      : branch.items.map((item) => item.question.prompt)
  return <fieldset className="structured-fields" disabled={disabled}>
    <legend>Marks for Q{branch.mainQuestionNumber}{branch.branchLabel ? `/${branch.branchLabel}` : ''}</legend>
    <label>Question total<input type="number" min={1} max={1000} step={1} value={total}
      onChange={(event) => { setTotal(event.target.value); setError(''); onPendingChange(true) }} /></label>
    {points.length > 1 && <>
      <p>{points.length} displayed points; answer {branch.attemptCount}.
        {branch.attemptCount < points.length ? ' Optional points must have equal whole marks.' : ' Point marks must add up to the question total.'}</p>
      <label>Split marks<select value={mode} onChange={(event) => { setMode(event.target.value as 'equal' | 'custom'); setError(''); onPendingChange(true) }}>
        <option value="equal">Divide equally</option><option value="custom">Assign each point</option>
      </select></label>
      {mode === 'custom' && points.map((id, index) => <label key={id}>
        Point {index + 1}: {labels[index]?.slice(0, 140)}
        <input type="number" min={1} max={1000} step={1} value={values[id] ?? ''}
          onChange={(event) => { setValues({ ...values, [id]: event.target.value }); setError(''); onPendingChange(true) }} />
      </label>)}
    </>}
    {error && <p role="alert">{error}</p>}
    <button type="button" className="button-secondary" onClick={() => {
      const distribution: MarkDistribution = mode === 'equal' ? { mode: 'equal' }
        : { mode: 'custom', marksByPoint: Object.fromEntries(points.map((id) => [id, Number(values[id])])) }
      try { assignAttemptMarks(points, Number(total), branch.attemptCount, distribution); onApply(Number(total), distribution); onPendingChange(false); setError('') }
      catch (failure) { setError(teacherErrorMessage(failure, 'Review the whole-mark split.')) }
    }}>Apply question marks</button>
    {onCancel && <button type="button" className="button-secondary" onClick={onCancel}>Cancel mark changes</button>}
  </fieldset>
}
