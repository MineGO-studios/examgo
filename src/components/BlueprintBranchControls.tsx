import type { CompoundBranch } from '../domain/compoundStructure'
import type { MarkDistribution } from '../domain/markAllocation'
import type { BlueprintBranch } from '../lib/examBlueprint'
import BranchMarkEditor from './BranchMarkEditor'

interface Props {
  branch: CompoundBranch
  plan: BlueprintBranch
  disabled: boolean
  marksDisabled: boolean
  canRemoveSection: boolean
  markReset: number
  onMove: (id: string, direction: -1 | 1) => void
  onReplace: (id: string | null) => void
  onRemove: (id: string | null) => void
  onLock: (id: string | null) => void
  onMarks: (total: number, distribution: MarkDistribution) => void
  onPendingMarks: (pending: boolean) => void
  onCancelMarks: () => void
}

export default function BlueprintBranchControls(props: Props) {
  const { branch, plan } = props
  const slot = `Q${branch.mainQuestionNumber}${branch.branchLabel ? '/' + branch.branchLabel : ''}`
  const grouped = branch.kind === 'passage' || branch.kind === 'completion' && branch.items.length > 1
  const units = grouped ? [{ id: null, label: branch.kind === 'passage' ? 'Complete passage' : 'Complete completion exercise', items: branch.items }]
    : branch.items.map(item => ({ id: item.question.id, label: `Question ${item.label}: ${item.question.prompt.slice(0, 140)}`, items: [item] }))
  const canMove = branch.kind === 'questions' || branch.kind === 'alternatives'
  const optional = branch.kind === 'questions' && branch.answerRule?.kind === 'points' && branch.attemptCount < branch.items.length
  return <details className="blueprint-branch-tools"><summary>Edit {slot}: questions and marks</summary>
    <p className="field-help">Edits keep these chosen questions in this order. Save the blueprint to reuse the selection.</p>
    {units.map((unit, index) => {
      const locked = unit.items.every(item => plan.lockedQuestionIds.includes(item.question.id))
      const protectedSelection = unit.items.some(item => plan.lockedQuestionIds.includes(item.question.id) || plan.includedQuestionIds.includes(item.question.id))
      return <fieldset disabled={props.disabled} key={unit.id ?? 'group'}>
        <legend>{unit.label}</legend>
        <div className="recovery-actions">
          <button type="button" onClick={() => props.onLock(unit.id)}>{locked ? 'Unlock' : 'Lock'} {grouped ? 'complete group' : `question ${index + 1}`}</button>
          <button type="button" disabled={protectedSelection} onClick={() => props.onReplace(unit.id)}>Replace {grouped ? 'complete group' : `question ${index + 1}`}</button>
          {canMove && unit.id && <>
            <button type="button" disabled={index === 0} onClick={() => props.onMove(unit.id!, -1)}>Move question {index + 1} up</button>
            <button type="button" disabled={index === units.length - 1} onClick={() => props.onMove(unit.id!, 1)}>Move question {index + 1} down</button>
          </>}
          {optional && unit.id && <button type="button" disabled={protectedSelection} onClick={() => props.onRemove(unit.id)}>Remove optional question {index + 1}</button>}
        </div>
        {protectedSelection && <p className="field-help">Unlock or clear Include before replacing or removing this selection.</p>}
        {grouped && <p className="field-help">Linked questions stay together in their original source order.</p>}
      </fieldset>
    })}
    <button type="button" className="button-secondary" disabled={props.disabled || !props.canRemoveSection ||
      branch.items.some(item => plan.includedQuestionIds.includes(item.question.id) || plan.lockedQuestionIds.includes(item.question.id))}
      onClick={() => props.onRemove(null)}>Remove this section</button>
    <BranchMarkEditor key={`${branch.id}:${props.markReset}:${JSON.stringify(branch.pointMarks)}`} branch={branch} disabled={props.marksDisabled}
      onApply={props.onMarks} onPendingChange={props.onPendingMarks} onCancel={props.onCancelMarks} />
  </details>
}
