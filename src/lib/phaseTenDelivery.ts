import { createCompoundDocumentBlobs } from './compoundWorkflow'
import { prepareExamDocumentPair, type PreparedExamDocumentPair } from './documentDelivery'
import type { SavedPhaseTenCandidate } from './phaseTenCandidateRepository'
import { parsePhaseTenTeacherIntent, type PhaseTenTeacherIntent } from './phaseTenTeacherWorkflow'

export async function renderPhaseTenCandidate(intentValue: PhaseTenTeacherIntent): Promise<PreparedExamDocumentPair> {
  const intent = parsePhaseTenTeacherIntent(intentValue)
  const templates = await Promise.all(['exam', 'answer-key'].map(async (kind) => {
    const response = await fetch(`/templates/iraqi-mainstream-phase-nine-${kind}-v${intent.rendererVersion}.docx`)
    if (!response.ok) throw new Error('A saved-version document template could not be loaded. Retry rendering this captured paper.')
    return response.arrayBuffer()
  }))
  const pair = await createCompoundDocumentBlobs(intent.snapshot, intent.settings, intent.generalInstruction,
    templates[0], templates[1], intent.coverageUnits)
  return prepareExamDocumentPair(intent.settings.unit, pair.exam, pair.answerKey)
}

export async function renderFinalizedPhaseTenCandidate(saved: SavedPhaseTenCandidate): Promise<PreparedExamDocumentPair> {
  if (!saved.finalized) throw new Error('Save and finalize this candidate paper before downloading.')
  return renderPhaseTenCandidate(saved.intent)
}
