import { prepareExamDocumentPair, type PreparedExamDocumentPair } from './documentDelivery'
import { createPhaseNineDocumentBlobs } from './phaseNineWorkflow'
import { parsePhaseNineTeacherIntent } from './phaseNineTeacherWorkflow'
import type { SavedPhaseNineWorkflow } from './phaseNineRepository'

export async function renderFinalizedPhaseNine(saved: SavedPhaseNineWorkflow): Promise<PreparedExamDocumentPair> {
  if (!saved.finalized) throw new Error('Save and finalize this paper before downloading.')
  const intent = parsePhaseNineTeacherIntent(saved.intent)
  const templates = await Promise.all(['exam', 'answer-key'].map(async (kind) => {
    const response = await fetch(`/templates/iraqi-mainstream-phase-nine-${kind}-v${intent.rendererVersion}.docx`)
    if (!response.ok) throw new Error('A saved-version document template could not be loaded. Retry rendering this finalized paper.')
    return response.arrayBuffer()
  }))
  const pair = await createPhaseNineDocumentBlobs(intent.review.snapshot, intent.settings, intent.generalInstruction, templates[0], templates[1])
  return prepareExamDocumentPair(intent.settings.unit, pair.exam, pair.answerKey)
}
