import type { CompoundSnapshot } from '../domain/compoundStructure'
import type { ExamBlueprintIntent } from '../lib/examBlueprintWorkflow'
import { createBlueprintPaperIntent } from '../lib/examBlueprintPaper'
import { assessBlueprintFit } from '../lib/examBlueprintFit'

export default function BlueprintLayoutReview({ intent, snapshot, approved, disabled, onDecision, onEdit }: {
  intent: ExamBlueprintIntent; snapshot: CompoundSnapshot; approved: boolean; disabled: boolean; onDecision: (approved: boolean) => void; onEdit: () => void
}) {
  const fit = assessBlueprintFit(createBlueprintPaperIntent(intent, snapshot, 'review-required'))
  const withinOnePage = fit.estimatedPages === 1
  return <section className="blueprint-layout-review" aria-label="Document fit review">
    <h3>Document fit · NEEDS_REVIEW</h3>
    <p>Section content estimate: about {fit.estimatedPages} page{fit.estimatedPages === 1 ? '' : 's'}, compared with the largest paper verified to fit one page in Word and LibreOffice. This estimate cannot measure Word or LibreOffice pagination.</p>
    <ul>{fit.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
    <details><summary>Section content estimates</summary><ul>{fit.sections.map(section => <li key={section.branchId}>{section.slot}: {section.displayedPoints} displayed points · answer {section.pointsToAnswer} · {section.marks} marks · about {section.estimatedLines} lines</li>)}</ul></details>
    {withinOnePage
      ? <p>No two-page exception is needed: this content is within the verified one-page volume. Inspect both DOCX files before printing.</p>
      : <>
        <p>Choose one: edit the paper, or keep all content unchanged and record a two-page exception in the generated paper.</p>
        <button type="button" disabled={disabled} onClick={onEdit}>Edit paper before generating</button>
        <label className="checkbox-label"><input type="checkbox" checked={approved} disabled={disabled} onChange={event => onDecision(event.target.checked)} />
          Keep all content unchanged and record my two-page exception. I will inspect both DOCX files before printing; this does not prove two-page fit.</label>
      </>}
  </section>
}
