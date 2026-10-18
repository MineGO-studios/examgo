import { parseCompoundSnapshot, type CompoundSnapshot } from '../domain/compoundStructure'
import { canonicalJson } from './canonicalQuestionCandidates'
import { selectBlueprintPaper, type BlueprintPool } from './examBlueprint'
import { parseExamBlueprintIntent, type ExamBlueprintIntent } from './examBlueprintWorkflow'
import type { ExamSettings } from '../types/exam'

export const BLUEPRINT_PAPER_PROFILE_ID = 'exam-blueprint-paper-v1' as const
export type BlueprintLayoutDecision = 'review-required' | 'unchanged-two-page'
/** v1: uncalibrated 60-line content budget (historical papers). v2: verified-fixture calibrated section estimate. */
export const CURRENT_LAYOUT_ESTIMATE_VERSION = 2 as const

/** One immutable review supplies student, key and downloads. Layout review is a separate observation. */
export interface BlueprintPaperIntent {
  schemaVersion: 1
  profileId: typeof BLUEPRINT_PAPER_PROFILE_ID
  rendererVersion: 1
  intent: ExamBlueprintIntent
  snapshot: CompoundSnapshot
  layout: { schemaVersion: 1; status: 'NEEDS_REVIEW'; estimateVersion: 1 | 2; decision: BlueprintLayoutDecision }
}

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)

export function blueprintPaperSettings(value: BlueprintPaperIntent): ExamSettings {
  return { ...value.intent.settings, unit: value.snapshot.branches[0].items[0].question.unit, marksPerQuestion: 1,
    questionCount: value.snapshot.branches.reduce((sum, branch) => sum + branch.items.length, 0), selectionSeed: value.snapshot.selectionSeed }
}

export function parseBlueprintPaperIntent(value: unknown): BlueprintPaperIntent {
  if (!record(value) || value.schemaVersion !== 1 || value.profileId !== BLUEPRINT_PAPER_PROFILE_ID || value.rendererVersion !== 1 ||
    Object.keys(value).some(key => !['schemaVersion', 'profileId', 'rendererVersion', 'intent', 'snapshot', 'layout'].includes(key))) {
    throw new Error('This generated paper uses an unsupported saved format.')
  }
  const intent = parseExamBlueprintIntent(value.intent), snapshot = parseCompoundSnapshot(value.snapshot)
  const layout = value.layout
  if (!record(layout) || Object.keys(layout).length !== 4 || layout.schemaVersion !== 1 || ![1, 2].includes(layout.estimateVersion as number) ||
    layout.status !== 'NEEDS_REVIEW' || !['review-required', 'unchanged-two-page'].includes(layout.decision as string)) {
    throw new Error('Record an explicit layout review decision; browser content does not prove Word pagination.')
  }
  if (intent.blueprint.branches.some(branch => !branch.reviewedQuestionRevisions || !branch.orderedQuestionIds?.length ||
    (branch.kind === 'passage' || branch.kind === 'completion' && branch.quantity > 1) && !branch.reviewedGroup)) {
    throw new Error('Save the complete current review with its chosen source versions before finalizing.')
  }
  const questions = snapshot.branches.flatMap(branch => branch.items.map(item => item.question))
  const passages = snapshot.branches.flatMap(branch => branch.passageGroup ? [branch.passageGroup] : [])
  const completionGroups = snapshot.branches.flatMap(branch => branch.completionGroup ? [branch.completionGroup] : [])
  const grouped = new Set([...passages.flatMap(group => group.children.map(child => child.question.id)), ...completionGroups.flatMap(group => group.childIds)])
  const capturedPool: BlueprintPool = { bankIds: intent.blueprint.bankIds, questions, passages, completionGroups,
    standaloneQuestionIds: questions.filter(q => !grouped.has(q.id)).map(q => q.id) }
  if (canonicalJson(selectBlueprintPaper(intent.blueprint, capturedPool)) !== canonicalJson(snapshot)) {
    throw new Error('The generated paper differs from its saved blueprint, chosen source versions, order or marks.')
  }
  return structuredClone({ schemaVersion: 1, profileId: BLUEPRINT_PAPER_PROFILE_ID, rendererVersion: 1,
    intent, snapshot, layout: layout as unknown as BlueprintPaperIntent['layout'] })
}

export function createBlueprintPaperIntent(intent: ExamBlueprintIntent, snapshot: CompoundSnapshot, decision: BlueprintLayoutDecision): BlueprintPaperIntent {
  return parseBlueprintPaperIntent({ schemaVersion: 1, profileId: BLUEPRINT_PAPER_PROFILE_ID, rendererVersion: 1,
    intent, snapshot, layout: { schemaVersion: 1, status: 'NEEDS_REVIEW', estimateVersion: CURRENT_LAYOUT_ESTIMATE_VERSION, decision } })
}
