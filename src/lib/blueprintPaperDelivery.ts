import { createCompoundDocumentBlobs } from './compoundWorkflow'
import { prepareExamDocumentPair, type PreparedExamDocumentPair } from './documentDelivery'
import { blueprintPaperSettings, parseBlueprintPaperIntent, type BlueprintPaperIntent } from './examBlueprintPaper'
import { assessBlueprintFit } from './examBlueprintFit'
import type { SavedBlueprintPaper } from './blueprintPaperRepository'

/** A recorded two-page exception, or (calibrated v2 estimate only) content within the verified one-page volume. */
export function blueprintDownloadAllowed(value: BlueprintPaperIntent) {
  const paper = parseBlueprintPaperIntent(value)
  return paper.layout.decision === 'unchanged-two-page' ||
    paper.layout.estimateVersion === 2 && assessBlueprintFit(paper).estimatedPages === 1
}

/** The same captured source/marks supply both production documents; no live bank read. */
export async function renderBlueprintPaper(saved: SavedBlueprintPaper): Promise<PreparedExamDocumentPair> {
  const paper = parseBlueprintPaperIntent(saved.intent)
  if (!blueprintDownloadAllowed(paper)) throw new Error('This paper is larger than the verified one-page volume. Edit it, or record the unchanged two-page layout exception before downloading.')
  const templates = await Promise.all(['exam', 'answer-key'].map(async kind => {
    const response = await fetch(`/templates/iraqi-mainstream-phase-nine-${kind}-v${paper.rendererVersion}.docx`)
    if (!response.ok) throw new Error('A saved-version document template could not load. Retry this immutable paper.')
    return response.arrayBuffer()
  }))
  const settings = blueprintPaperSettings(paper)
  const units = [...new Set(paper.snapshot.branches.flatMap(b => b.items.map(i => i.question.unit)))].sort((a, b) => a - b)
  const pair = await createCompoundDocumentBlobs(paper.snapshot, settings, paper.intent.generalInstruction, templates[0], templates[1], units)
  return prepareExamDocumentPair(settings.unit, pair.exam, pair.answerKey)
}
