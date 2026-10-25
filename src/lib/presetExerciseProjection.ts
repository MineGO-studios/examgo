import { assertDomainQuestion, isUuid, type DomainQuestion, type QuestionType } from '../domain/questionDomain'
import { assignAttemptMarks, passagePointIds, questionPointIds } from '../domain/markAllocation'
import { parseCompoundSnapshot, type CompoundBranch, type CompoundSnapshot } from '../domain/compoundStructure'
import { parsePresetProvenance, provenanceApprovalProblems, type PresetProvenance } from '../domain/presetCuration'
import { parsePresetPointIdeas, presetPointSelectionKeys, type PresetPointIdeas } from './presetPointIdeas'
import { conflictsWithSelection } from './selectQuestions'

type ExerciseKind = 'questions' | 'matching' | 'completion' | 'alternatives' | 'passage'
export type PresetExerciseMember = {
  revisionId: string; curationId: string; revision: number; reviewVersion: number
  reviewer: string; approvedAt: string; publisher: string; publishedAt: string
  provenance: PresetProvenance; question: DomainQuestion; selectionKeys: string[]; pointIdeas: PresetPointIdeas | null
}
export type PresetExercise = {
  schemaVersion: 1; id: string; revision: number; kind: ExerciseKind; instruction: string
  title: string | null; arabicInstruction: string | null; passage: string | null; displayedPointCount: number; attemptCount: number
  members: PresetExerciseMember[]
}

function object(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
    Object.keys(value).some(key => !allowed.includes(key))) throw new Error('Unsupported public preset exercise fields.')
  return value as Record<string, unknown>
}
function text(value: unknown, cap: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > cap) throw new Error('Required preset source text is missing or excessive.')
  return value
}
function uuid(value: unknown): string {
  if (typeof value !== 'string' || !isUuid(value)) throw new Error('Exact preset source identity is required.')
  return value
}
function integer(value: unknown, cap: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > cap) throw new Error('Invalid preset source count or version.')
  return value as number
}

const publicContent: Record<QuestionType, string[]> = {
  'multiple-choice': ['options'], binary: ['labelMode'], 'short-answer': ['answerLines'],
  completion: ['text', 'blankIds', 'wordBank', 'wordBankOrder', 'allowWordReuse', 'requireAllWordsUsed'],
  matching: ['left', 'right'], 'odd-word': ['words'], 'word-relationship': ['words'],
  rewrite: ['instruction'], 'extended-writing': ['minimumWords', 'maximumWords'],
}
const publicAnswer: Record<QuestionType, string[]> = {
  'multiple-choice': ['correctOptionLabel'], binary: ['isTrue'],
  'short-answer': ['canonicalAnswer', 'approvedVariants', 'caseSensitive'], completion: ['answers'],
  matching: ['pairs'], 'odd-word': ['oddWord'], 'word-relationship': ['acceptedAnswers'],
  rewrite: ['acceptedAnswers'], 'extended-writing': ['rubricCriteria', 'modelAnswer', 'manualMarkingNote'],
}

/** Contract for the protected read projection, not proof of server capture availability.
 * Publisher ownership, raw source fields and private notes never enter the renderer context.
 */
export function parsePresetExercise(value: unknown, rendererOwnerId: string): PresetExercise {
  uuid(rendererOwnerId)
  const e = object(value, ['schemaVersion', 'id', 'revision', 'kind', 'instruction', 'title', 'arabicInstruction',
    'passage', 'displayedPointCount', 'attemptCount', 'members'])
  const id = uuid(e.id), revision = integer(e.revision, 2147483647)
  if (e.schemaVersion !== 1 || !['questions', 'matching', 'completion', 'alternatives', 'passage'].includes(String(e.kind)) ||
    !Array.isArray(e.members) || e.members.length < 1 || e.members.length > 100) throw new Error('A complete supported source exercise is required.')
  const kind = e.kind as ExerciseKind, instruction = text(e.instruction, 1000)
  const title = e.title === null ? null : text(e.title, 200)
  const arabicInstruction = e.arabicInstruction === null ? null : text(e.arabicInstruction, 1000)
  const passage = e.passage === null ? null : text(e.passage, 5000)
  if ((kind === 'passage') !== (passage !== null)) throw new Error('Only a complete passage exercise may carry passage text.')
  const members = e.members.map((value): PresetExerciseMember => {
    const m = object(value, ['revisionId', 'curationId', 'revision', 'reviewVersion', 'reviewer', 'approvedAt',
      'publisher', 'publishedAt', 'provenance', 'question', 'selectionKeys', 'pointIdeas'])
    const revisionId = uuid(m.revisionId), questionRevision = integer(m.revision, 2147483647)
    const q = object(m.question, ['id', 'schemaVersion', 'type', 'unit', 'lesson', 'difficulty', 'prompt', 'content', 'answer'])
    if (typeof q.type !== 'string' || !Object.hasOwn(publicContent, q.type)) throw new Error('Unsupported preset question type.')
    const type = q.type as QuestionType
    const content = object(q.content, ['type', 'schemaVersion', ...publicContent[type]])
    const answer = object(q.answer, ['type', 'schemaVersion', ...publicAnswer[type]])
    for (const [items, keys] of [[content.options, ['label', 'text']], [content.left, ['id', 'text']],
      [content.right, ['id', 'text']], [answer.pairs, ['leftId', 'rightId']]] as const) {
      if (Array.isArray(items)) items.forEach(item => object(item, keys))
    }
    const question = { ...q, ownerId: rendererOwnerId, bankId: id, externalId: `Preset ${uuid(q.id)}`,
      marks: null, isActive: true, revision: questionRevision } as DomainQuestion
    assertDomainQuestion(question)
    if (question.unit < 1 || question.unit > 4) throw new Error('Initial preset exercises support only Units 1-4.')
    const provenance = parsePresetProvenance(m.provenance)
    if (provenanceApprovalProblems(provenance).length) throw new Error('Preset source has unresolved approval evidence.')
    if (!Array.isArray(m.selectionKeys) || m.selectionKeys.some(key => typeof key !== 'string' ||
      !/^(idea:[a-z0-9][a-z0-9._-]{0,119}|wording:[a-f0-9]{32}|family:[a-f0-9]{32})$/.test(key)) ||
      m.selectionKeys.length > 20 || new Set(m.selectionKeys).size !== m.selectionKeys.length) throw new Error('Reviewed source identities are required.')
    const selectionKeys = m.selectionKeys as string[], contextKeys = selectionKeys.filter(key => !key.startsWith('idea:'))
    if (contextKeys.filter(key => key.startsWith('wording:')).length !== 1) throw new Error('Exact source wording identity is required.')
    const complex = question.type === 'matching' || question.type === 'completion' && question.content.blankIds.length > 1
    const pointIdeas = complex ? parsePresetPointIdeas(question, revisionId, m.pointIdeas) : null
    if (complex && JSON.stringify(presetPointSelectionKeys(question, revisionId, pointIdeas, contextKeys)) !== JSON.stringify(selectionKeys) ||
      !complex && (m.pointIdeas !== null || selectionKeys.filter(key => key.startsWith('idea:')).length !== 1)) {
      throw new Error('Selection identities must agree with every reviewed source point.')
    }
    const approvedAt = text(m.approvedAt, 100), publishedAt = text(m.publishedAt, 100)
    if (!Number.isFinite(Date.parse(approvedAt)) || !Number.isFinite(Date.parse(publishedAt))) throw new Error('Dated approval and publication are required.')
    return { revisionId, curationId: uuid(m.curationId), revision: questionRevision, reviewVersion: integer(m.reviewVersion, 2147483647),
      reviewer: text(m.reviewer, 200), approvedAt, publisher: text(m.publisher, 200), publishedAt, provenance, question, selectionKeys, pointIdeas }
  })
  if (new Set(members.map(m => m.revisionId)).size !== members.length || new Set(members.map(m => m.question.id)).size !== members.length ||
    members.some((m, i) => conflictsWithSelection({ ...m.question, selectionKeys: m.selectionKeys },
      members.slice(0, i).map(previous => ({ ...previous.question, selectionKeys: previous.selectionKeys }))))) {
    throw new Error('Keep source members whole without repeated canonical or reviewed identities.')
  }
  const displayedPointCount = integer(e.displayedPointCount, 200), attemptCount = integer(e.attemptCount, 200)
  const points = members.flatMap(m => questionPointIds(m.question))
  if (points.length !== displayedPointCount || attemptCount > displayedPointCount ||
    kind === 'matching' && (members.length !== 1 || members[0].question.type !== 'matching') ||
    kind === 'completion' && members.some(m => m.question.type !== 'completion') ||
    !['matching', 'completion'].includes(kind) && members.some(m => questionPointIds(m.question).length !== 1 || m.question.type === 'matching' || m.question.type === 'completion') ||
    kind === 'alternatives' && (members.length !== 2 || attemptCount !== 1)) {
    throw new Error('Source type, displayed points and attempt rule must agree without splitting or trimming.')
  }
  return structuredClone({ schemaVersion: 1, id, revision, kind, instruction, title, arabicInstruction, passage,
    displayedPointCount, attemptCount, members })
}

/** One complete source exercise through the existing production renderer contract.
 * This is not server finalization or the Phase 14 general paper composer.
 */
export function presetExerciseRenderSnapshot(value: unknown, rendererOwnerId: string,
  selectionSeed: number, totalMarks: number): CompoundSnapshot {
  const exercise = parsePresetExercise(value, rendererOwnerId)
  const items = exercise.members.map((member, index) => ({
    label: exercise.kind === 'alternatives' ? ['A', 'B'][index] : String(index + 1), question: member.question,
  }))
  const points = exercise.kind === 'passage' ? passagePointIds(exercise.id, items.map(item => item.question.id))
    : items.flatMap(item => questionPointIds(item.question))
  const scoring = assignAttemptMarks(points, totalMarks, exercise.attemptCount, { mode: 'equal' })
  const branch: CompoundBranch = { id: exercise.id, mainQuestionNumber: 1, branchLabel: null,
    kind: exercise.kind, instruction: exercise.instruction, arabicInstruction: exercise.arabicInstruction,
    marks: totalMarks, attemptCount: exercise.attemptCount, items,
    pointMarks: Object.fromEntries(scoring.pointMarks.map(point => [point.pointId, point.marks])) }
  if (exercise.kind === 'passage') branch.passageGroup = { id: exercise.id, ownerId: rendererOwnerId,
    bankId: exercise.id, revision: exercise.revision, schemaVersion: 1, title: exercise.title,
    instruction: exercise.instruction, arabicInstruction: exercise.arabicInstruction, passage: exercise.passage!,
    attemptCount: exercise.attemptCount, expectedMarks: null,
    children: items.map((item, index) => ({ position: index + 1, question: item.question })) }
  if (exercise.kind === 'completion' && items.length > 1) branch.completionGroup = {
    id: exercise.id, ownerId: rendererOwnerId, bankId: exercise.id, revision: exercise.revision, schemaVersion: 1,
    title: exercise.title, instruction: exercise.instruction, attemptCount: exercise.attemptCount, expectedMarks: null,
    content: { type: 'branch', schemaVersion: 1 }, childIds: items.map(item => item.question.id),
  }
  return parseCompoundSnapshot({ schemaVersion: 2, ownerId: rendererOwnerId, bankId: exercise.id,
    bankIds: [exercise.id], selectionSeed, totalMarks, branches: [branch] })
}
