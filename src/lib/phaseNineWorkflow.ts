import { preparePaperTemplate } from './paperTemplateFormat'
import {
  MANUAL_MARKING_NOTE,
  validateDomainQuestion,
  type DomainQuestion,
} from '../domain/questionDomain'
import type { ExamSettings } from '../types/exam'
import { validateDocumentText } from './documentText'
import { selectQuestions } from './selectQuestions'
import { canonicalQuestionCandidates } from './canonicalQuestionCandidates'
import { assignAttemptMarks, questionPointIds, type MarkDistribution } from '../domain/markAllocation'

export const PHASE_NINE_STRUCTURE_VERSION = 1 as const

export type PhaseNineQuestion = Extract<
  DomainQuestion,
  {
    type:
      | 'completion'
      | 'odd-word'
      | 'word-relationship'
      | 'rewrite'
      | 'extended-writing'
  }
>

export type PhaseNineBranchKind =
  | 'completion'
  | 'odd-word'
  | 'word-relationship'
  | 'rewrite'
  | 'writing-alternatives'

export type PhaseNineBranchLayout =
  | 'vertical'
  | 'source-two-column'
  | 'writing-alternatives'

export type PhaseNineBranchItem = {
  visibleLabel: string
  question: PhaseNineQuestion
  arabicPrompt?: string
}

export type PhaseNineBranch = {
  id: string
  mainQuestionNumber: number
  branchLabel: string | null
  kind: PhaseNineBranchKind
  instruction: string
  arabicInstruction?: string
  marks: number
  attemptCount: number
  layout: PhaseNineBranchLayout
  items: PhaseNineBranchItem[]
  /** Version 2 scoring belongs to this paper, never to the canonical revision. */
  pointMarks?: Record<string, number>
}

export type PhaseNineExamStructure = {
  schemaVersion: 1 | 2
  branches: PhaseNineBranch[]
}

export type PhaseNineExamSnapshot = {
  schemaVersion: 1 | 2
  selectionSeed: number
  totalMarks: number
  structure: PhaseNineExamStructure
}

export type PhaseNineBranchBlueprint = Omit<
  PhaseNineBranch,
  'items'
> & {
  questionType: PhaseNineQuestion['type']
  questionCount: number
  visibleLabels: string[]
  arabicPrompts?: string[]
}

export type PhaseNineReview = {
  snapshot: PhaseNineExamSnapshot
  lockedQuestionIds: string[]
}

export type PhaseNineStudentBranch = {
  Heading: string
  ArabicInstruction: string
  Marks: number
  WordBank: string
  Body: string
  AlternativeA: string
  AlternativeAArabic: string
  AlternativeB: string
  AlternativeBArabic: string
  AnswerSpace: string
}

export type PhaseNineAnswerRow = {
  Q: string
  Part: string
  Rule: string
  Point: string
  Answer: string
  Mark: number
  Total: number
}

type PhaseNineIssue = {
  path: string
  message: string
}

const PHASE_NINE_TYPES = new Set<PhaseNineQuestion['type']>([
  'completion',
  'odd-word',
  'word-relationship',
  'rewrite',
  'extended-writing',
])

function branchQuestionType(kind: PhaseNineBranchKind): PhaseNineQuestion['type'] {
  return kind === 'writing-alternatives' ? 'extended-writing' : kind
}

function displayedPointCount(branch: PhaseNineBranch): number {
  if (branch.kind === 'completion') {
    const question = branch.items[0]?.question
    return question?.type === 'completion'
      ? question.content.blankIds.length
      : 0
  }

  return branch.items.length
}

export function phaseNineBranchPointIds(branch: PhaseNineBranch): string[] {
  return branch.items.flatMap((item) => questionPointIds(item.question))
}

export function assignPhaseNineBranchMarks(review: PhaseNineReview, branchId: string,
  total: number, distribution: MarkDistribution): PhaseNineReview {
  if (review.snapshot.schemaVersion !== 2) throw new Error('Exam-owned marks require a new paper.')
  const structure = structuredClone(review.snapshot.structure)
  const branch = structure.branches.find((candidate) => candidate.id === branchId)
  if (!branch) throw new Error('The selected branch is no longer in this paper.')
  const allocation = assignAttemptMarks(phaseNineBranchPointIds(branch), total, branch.attemptCount, distribution)
  branch.marks = total
  branch.pointMarks = Object.fromEntries(allocation.pointMarks.map(({ pointId, marks }) => [pointId, marks]))
  return { ...review, snapshot: createPhaseNineSnapshot(structure, review.snapshot.selectionSeed) }
}

function branchKey(branch: PhaseNineBranch): string {
  return `${branch.mainQuestionNumber}:${branch.branchLabel ?? ''}`
}

function addIssue(
  issues: PhaseNineIssue[],
  path: string,
  message: string,
): void {
  issues.push({ path, message })
}

export function validatePhaseNineStructure(
  structure: PhaseNineExamStructure,
): PhaseNineIssue[] {
  const issues: PhaseNineIssue[] = []
  if (!structure || typeof structure !== 'object') {
    return [{ path: 'structure', message: 'A Phase 9 structure object is required.' }]
  }
  if (structure.schemaVersion !== 1 && structure.schemaVersion !== 2) {
    addIssue(issues, 'schemaVersion', 'Phase 9 structure version is unsupported.')
  }
  if (!Array.isArray(structure.branches) || structure.branches.length < 1) {
    addIssue(issues, 'branches', 'At least one ministerial branch is required.')
    return issues
  }

  const branchIds = new Set<string>()
  const branchKeys = new Set<string>()
  const questionIds = new Set<string>()
  const examOwnedMarks = structure.schemaVersion === 2

  structure.branches.forEach((branch, branchIndex) => {
    const path = `branches[${branchIndex}]`
    if (!branch || typeof branch !== 'object') {
      addIssue(issues, path, 'A branch object is required.')
      return
    }
    if (typeof branch.id !== 'string' || !branch.id.trim() || branchIds.has(branch.id)) {
      addIssue(issues, `${path}.id`, 'Branch ids must be non-empty and unique.')
    }
    branchIds.add(branch.id)

    const key = branchKey(branch)
    if (branchKeys.has(key)) {
      addIssue(
        issues,
        path,
        'A main-question number and branch label may appear only once.',
      )
    }
    branchKeys.add(key)

    if (
      !Number.isSafeInteger(branch.mainQuestionNumber) ||
      branch.mainQuestionNumber < 1 ||
      branch.mainQuestionNumber > 99
    ) {
      addIssue(
        issues,
        `${path}.mainQuestionNumber`,
        'Main-question number must be between 1 and 99.',
      )
    }
    if (branch.branchLabel !== null && (typeof branch.branchLabel !== 'string' || !branch.branchLabel.trim())) {
      addIssue(issues, `${path}.branchLabel`, 'A supplied branch label cannot be empty.')
    }
    if (typeof branch.instruction !== 'string' || !branch.instruction.trim()) {
      addIssue(issues, `${path}.instruction`, 'A source-supplied instruction is required.')
    }
    if (!['completion', 'odd-word', 'word-relationship', 'rewrite', 'writing-alternatives'].includes(branch.kind)) {
      addIssue(issues, `${path}.kind`, 'Unsupported Phase 9 branch kind.')
    }
    if (!['vertical', 'source-two-column', 'writing-alternatives'].includes(branch.layout)) {
      addIssue(issues, `${path}.layout`, 'Unsupported Phase 9 branch layout.')
    }
    if (
      !Number.isSafeInteger(branch.marks) ||
      branch.marks < 1 ||
      branch.marks > (examOwnedMarks ? 1000 : 100)
    ) {
      addIssue(issues, `${path}.marks`, 'Branch marks must be between 1 and 100.')
    }
    if (!Array.isArray(branch.items) || branch.items.length < 1) {
      addIssue(issues, `${path}.items`, 'A branch must contain at least one question.')
      return
    }

    const expectedType = branchQuestionType(branch.kind)
    const labels = new Set<string>()
    let invalidQuestion = false
    branch.items.forEach((item, itemIndex) => {
      const itemPath = `${path}.items[${itemIndex}]`
      if (!item || typeof item !== 'object' || !item.question || typeof item.question !== 'object') {
        addIssue(issues, itemPath, 'A branch item and question object are required.')
        invalidQuestion = true
        return
      }
      if (typeof item.visibleLabel !== 'string' || !item.visibleLabel.trim()) {
        addIssue(issues, `${itemPath}.visibleLabel`, 'Every item needs its visible source label.')
      } else if (labels.has(item.visibleLabel)) {
        addIssue(issues, `${itemPath}.visibleLabel`, 'Visible labels must be unique inside a branch.')
      }
      labels.add(item.visibleLabel)

      if (questionIds.has(item.question.id)) {
        addIssue(issues, `${itemPath}.question.id`, 'A question cannot appear twice in one paper structure.')
      }
      questionIds.add(item.question.id)

      if (!PHASE_NINE_TYPES.has(item.question.type)) {
        addIssue(issues, `${itemPath}.question.type`, 'Only approved Phase 9 question types are allowed.')
      } else if (item.question.type !== expectedType) {
        addIssue(issues, `${itemPath}.question.type`, `This branch requires ${expectedType} questions.`)
      }

      const questionValidation = validateDomainQuestion(item.question)
      if (!questionValidation.success) {
        invalidQuestion = true
        const first = questionValidation.issues[0]
        addIssue(
          issues,
          `${itemPath}.question.${first.path}`,
          first.message,
        )
      }
    })
    if (invalidQuestion) return

    const displayed = displayedPointCount(branch)
    if (
      !Number.isSafeInteger(branch.attemptCount) ||
      branch.attemptCount < 1 ||
      branch.attemptCount > displayed
    ) {
      addIssue(
        issues,
        `${path}.attemptCount`,
        'Attempt count must be at least one and no greater than the displayed point count.',
      )
    }

    if (branch.kind === 'completion') {
      if (branch.items.length !== 1) {
        addIssue(issues, `${path}.items`, 'A completion branch stores one ordered completion set.')
      }
      if (branch.layout !== 'vertical') {
        addIssue(issues, `${path}.layout`, 'Completion uses the approved vertical word-bank layout.')
      }
      if (!examOwnedMarks && branch.items[0]?.question.marks !== branch.marks) {
        addIssue(issues, `${path}.marks`, 'Completion marks must match the stored completion set.')
      }
      const question = branch.items[0].question
      if (question.type === 'completion') {
        const lines = question.content.text.split(/\r?\n/)
        const ids = question.content.blankIds
        // The approved Phase 9 form is one displayed item/blank per ordered line.
        // Keep the broader domain's inline multi-blank forms outside this renderer.
        if (lines.length !== ids.length || lines.some((line) => !line.trim())) {
          addIssue(issues, `${path}.items`, 'Displayed completion items must match the ordered blank identities exactly, without empty lines.')
        }
        if (lines.some((line) => (line.match(/\.{3,}|_{3,}|…+/g) ?? []).length !== 1)) {
          addIssue(issues, `${path}.items`, 'Each displayed completion item must contain exactly one visible blank.')
        }
        // The editor's generated blank-N identities encode displayed positions.
        // Opaque legacy identities remain valid in their explicitly supplied order.
        if (ids.every((id) => /^blank-\d+$/.test(id)) && ids.some((id, index) => id !== `blank-${index + 1}`)) {
          addIssue(issues, `${path}.items`, 'Completion blank identities are misaligned with their displayed item positions.')
        }
        if (!examOwnedMarks && branch.marks % branch.attemptCount !== 0) {
          addIssue(issues, `${path}.marks`, 'Completion marks must divide into whole marks per attempted blank.')
        }
      }
    }

    if (branch.kind === 'rewrite') {
      if (branch.items.length !== 1 || branch.attemptCount !== 1) {
        addIssue(issues, `${path}.items`, 'Rewrite contains one required prompt.')
      }
      const rewrite = branch.items[0]?.question
      if (
        rewrite?.type === 'rewrite' &&
        rewrite.content.instruction !== branch.instruction
      ) {
        addIssue(issues, `${path}.instruction`, 'Rewrite instruction must match the approved question wording.')
      }
      if (!examOwnedMarks && rewrite?.marks !== branch.marks) {
        addIssue(issues, `${path}.marks`, 'Rewrite marks must be applied exactly once.')
      }
    }

    if (branch.kind === 'writing-alternatives') {
      if (branch.items.length !== 2 || branch.attemptCount !== 1) {
        addIssue(issues, `${path}.items`, 'An A-or-B writing container requires exactly two alternatives and a choose-one rule.')
      }
      if (branch.layout !== 'writing-alternatives') {
        addIssue(issues, `${path}.layout`, 'Writing alternatives require the ministerial alternatives layout.')
      }
      if (!examOwnedMarks && branch.items.some((item) => item.question.marks !== branch.marks)) {
        addIssue(issues, `${path}.marks`, 'Each writing alternative must carry the branch marks without double-counting them.')
      }
    }

    if (branch.kind === 'odd-word' || branch.kind === 'word-relationship') {
      const marksPerAttempt = branch.items[0]?.question.marks ?? 0
      if (
        !examOwnedMarks && (branch.items.some((item) => item.question.marks !== marksPerAttempt) ||
        marksPerAttempt * branch.attemptCount !== branch.marks)
      ) {
        addIssue(
          issues,
          `${path}.marks`,
          'Candidate marks multiplied by the required attempt count must equal the branch marks.',
        )
      }
      if (
        branch.kind === 'word-relationship' &&
        branch.layout === 'source-two-column' &&
        branch.items.length % 2 !== 0
      ) {
        addIssue(issues, `${path}.layout`, 'The source two-column relationship layout requires an even candidate count.')
      }
    }
    if (examOwnedMarks) {
      if (!branch.pointMarks || typeof branch.pointMarks !== 'object' || Array.isArray(branch.pointMarks)) {
        addIssue(issues, `${path}.pointMarks`, 'Assign exam marks to every displayed point.')
      } else {
        try { assignAttemptMarks(phaseNineBranchPointIds(branch), branch.marks, branch.attemptCount,
          { mode: 'custom', marksByPoint: branch.pointMarks }) }
        catch (error) { addIssue(issues, `${path}.pointMarks`, error instanceof Error ? error.message : 'Invalid point marks.') }
      }
    } else if (branch.pointMarks !== undefined) {
      addIssue(issues, `${path}.pointMarks`, 'Exam-owned point marks require structure version 2.')
    }
  })

  if (examOwnedMarks && structure.branches.reduce((sum, branch) => sum + branch.marks, 0) > 1000) {
    addIssue(issues, 'branches', 'Exam total must not exceed 1000 whole marks.')
  }

  return issues
}

export function assertPhaseNineStructure(
  structure: PhaseNineExamStructure,
): void {
  const [first] = validatePhaseNineStructure(structure)
  if (first) {
    throw new Error(`Invalid Phase 9 structure at ${first.path}: ${first.message}`)
  }
}

export function createPhaseNineSnapshot(
  structure: PhaseNineExamStructure,
  selectionSeed: number,
): PhaseNineExamSnapshot {
  assertPhaseNineStructure(structure)
  if (
    !Number.isSafeInteger(selectionSeed) ||
    selectionSeed < 0 ||
    selectionSeed > 4_294_967_295
  ) {
    throw new Error('Selection seed is outside the supported range.')
  }

  return {
    schemaVersion: structure.schemaVersion,
    selectionSeed,
    totalMarks: structure.branches.reduce(
      (total, branch) => total + branch.marks,
      0,
    ),
    structure: structuredClone(structure),
  }
}

export function serializePhaseNineSnapshot(
  snapshot: PhaseNineExamSnapshot,
): string {
  if (snapshot.schemaVersion !== snapshot.structure.schemaVersion) {
    throw new Error('Saved Phase 9 snapshot version is unsupported.')
  }
  const validated = createPhaseNineSnapshot(
    snapshot.structure,
    snapshot.selectionSeed,
  )
  if (validated.totalMarks !== snapshot.totalMarks) {
    throw new Error('Snapshot total marks do not match its ministerial branches.')
  }
  return JSON.stringify(validated)
}

export function parsePhaseNineSnapshot(value: string): PhaseNineExamSnapshot {
  let candidate: PhaseNineExamSnapshot
  try {
    candidate = JSON.parse(value) as PhaseNineExamSnapshot
  } catch {
    throw new Error('Saved Phase 9 snapshot is not valid JSON.')
  }
  if (!candidate || typeof candidate !== 'object') {
    throw new Error('Saved Phase 9 snapshot must be an object.')
  }
  const validated = createPhaseNineSnapshot(
    candidate.structure,
    candidate.selectionSeed,
  )
  if (candidate.schemaVersion !== candidate.structure.schemaVersion) {
    throw new Error('Saved Phase 9 snapshot version is unsupported.')
  }
  if (candidate.totalMarks !== validated.totalMarks) {
    throw new Error('Saved Phase 9 snapshot has inconsistent total marks.')
  }
  return validated
}

export function selectPhaseNineBranch(
  questions: readonly PhaseNineQuestion[],
  blueprint: PhaseNineBranchBlueprint,
  selectionSeed: number,
  structureVersion: 1 | 2 = 1,
): PhaseNineBranch {
  if (blueprint.visibleLabels.length !== blueprint.questionCount) {
    throw new Error('Every selected question requires one visible source label.')
  }
  if (
    blueprint.arabicPrompts !== undefined &&
    blueprint.arabicPrompts.length !== blueprint.questionCount
  ) {
    throw new Error('Arabic alternative prompts must align with selected questions.')
  }
  const candidates = canonicalQuestionCandidates(questions)
  if (new Set(candidates.map((question) => question.unit)).size > 1) {
    throw new Error('Filter to one unit before selecting a source-specific branch.')
  }
  const selected = selectQuestions(candidates, {
    unit: candidates[0]?.unit ?? 0,
    type: blueprint.questionType,
    count: blueprint.questionCount,
    seed: selectionSeed,
  })
  const branch: PhaseNineBranch = {
    ...(structureVersion === 1 ? blueprint : {
      id: blueprint.id, mainQuestionNumber: blueprint.mainQuestionNumber, branchLabel: blueprint.branchLabel,
      kind: blueprint.kind, instruction: blueprint.instruction, arabicInstruction: blueprint.arabicInstruction,
      marks: blueprint.marks, attemptCount: blueprint.attemptCount, layout: blueprint.layout,
    }),
    items: selected.map((question, index) => ({
      visibleLabel: blueprint.visibleLabels[index],
      question,
      ...(blueprint.arabicPrompts?.[index]
        ? { arabicPrompt: blueprint.arabicPrompts[index] }
        : {}),
    })),
  }
  if (structureVersion === 2) {
    branch.pointMarks = Object.fromEntries(assignAttemptMarks(phaseNineBranchPointIds(branch), branch.marks,
      branch.attemptCount, { mode: 'equal' }).pointMarks.map(({ pointId, marks }) => [pointId, marks]))
  }
  assertPhaseNineStructure({
    schemaVersion: structureVersion,
    branches: [branch],
  })
  return branch
}

export function createPhaseNineReview(
  snapshot: PhaseNineExamSnapshot,
): PhaseNineReview {
  const persisted = parsePhaseNineSnapshot(serializePhaseNineSnapshot(snapshot))
  return { snapshot: persisted, lockedQuestionIds: [] }
}

export function togglePhaseNineQuestionLock(
  review: PhaseNineReview,
  questionId: string,
): PhaseNineReview {
  const ids = new Set(
    review.snapshot.structure.branches.flatMap((branch) =>
      branch.items.map((item) => item.question.id),
    ),
  )
  if (!ids.has(questionId)) {
    throw new Error('The selected question is no longer in the structured preview.')
  }
  const locked = new Set(review.lockedQuestionIds)
  if (locked.has(questionId)) locked.delete(questionId)
  else locked.add(questionId)
  return { ...review, lockedQuestionIds: [...locked] }
}

export function replacePhaseNineQuestion(
  review: PhaseNineReview,
  questionId: string,
  questionPool: readonly PhaseNineQuestion[],
): PhaseNineReview {
  if (review.lockedQuestionIds.includes(questionId)) {
    throw new Error('Unlock this question before replacing it.')
  }
  const selectedIds = new Set(
    review.snapshot.structure.branches.flatMap((branch) =>
      branch.items.map((item) => item.question.id),
    ),
  )
  let target: PhaseNineQuestion | undefined
  for (const branch of review.snapshot.structure.branches) {
    target = branch.items.find((item) => item.question.id === questionId)?.question
    if (target) break
  }
  if (!target) {
    throw new Error('The selected question is no longer in the structured preview.')
  }

  const replacementSnapshot = (replacement: PhaseNineQuestion) => {
    const structure = structuredClone(review.snapshot.structure)
    for (const branch of structure.branches) {
      const item = branch.items.find((candidate) => candidate.question.id === questionId)
      if (!item) continue
      const oldPoints = phaseNineBranchPointIds(branch)
      const oldMarks = branch.pointMarks
      item.question = replacement
      if (review.snapshot.schemaVersion === 2 && oldMarks) {
        branch.pointMarks = Object.fromEntries(phaseNineBranchPointIds(branch).map((id, index) => [id, oldMarks[oldPoints[index]]]))
      }
    }
    return createPhaseNineSnapshot(structure, review.snapshot.selectionSeed)
  }
  const candidates = canonicalQuestionCandidates(questionPool).filter(
    (question) =>
      !selectedIds.has(question.id) &&
      question.type === target?.type &&
      question.unit === target.unit &&
      (review.snapshot.schemaVersion === 2 || question.marks === target.marks) &&
      (question.type !== 'completion' || target.type !== 'completion' ||
        question.content.blankIds.length === target.content.blankIds.length),
  ).filter((question) => {
    try { replacementSnapshot(question); return true }
    catch { return false } // A valid domain question may not fit this source-specific exercise.
  })
  const [replacement] = selectQuestions(candidates, {
    unit: target.unit,
    type: target.type,
    count: 1,
    seed: review.snapshot.selectionSeed + selectedIds.size,
  })
  return {
    snapshot: replacementSnapshot(replacement),
    lockedQuestionIds: review.lockedQuestionIds.filter(
      (id) => id !== questionId,
    ),
  }
}

function sourceHeading(branch: PhaseNineBranch): string {
  const branchLabel = branch.branchLabel ? ` ${branch.branchLabel}` : ''
  return `Q${branch.mainQuestionNumber}${branchLabel})- ${branch.instruction}`
}

function completionPoints(question: Extract<PhaseNineQuestion, { type: 'completion' }>) {
  const lines = question.content.text.split(/\r?\n/)
  return question.content.blankIds.map((blankId, index) => ({
    number: index + 1,
    text: lines[index],
    answer: question.answer.answers[blankId],
  }))
}

function branchBody(branch: PhaseNineBranch): string {
  switch (branch.kind) {
    case 'completion': {
      const question = branch.items[0].question
      if (question.type !== 'completion') return ''
      return completionPoints(question).map((point) => `${point.number}. ${point.text}`).join('\n')
    }
    case 'odd-word':
      return branch.items
        .map((item) => {
          const question = item.question
          return question.type === 'odd-word'
            ? `${item.visibleLabel}. ${question.content.words.join(' / ')}`
            : ''
        })
        .join('\n')
    case 'word-relationship': {
      const lines = branch.items.map(
        (item) => `${item.visibleLabel}. ${item.question.prompt}`,
      )
      if (branch.layout !== 'source-two-column') return lines.join('\n')
      const half = lines.length / 2
      return lines
        .slice(0, half)
        .map((line, index) => `${line}\t${lines[index + half]}`)
        .join('\n')
    }
    case 'rewrite':
      return branch.items[0].question.prompt
    case 'writing-alternatives':
      return ''
  }
}

function wordBank(branch: PhaseNineBranch): string {
  const question = branch.items[0]?.question
  return branch.kind === 'completion' && question?.type === 'completion'
    ? `{${question.content.wordBank.join(',  ')}}`
    : ''
}

function writingAlternative(
  branch: PhaseNineBranch,
  index: number,
): { prompt: string; arabic: string } {
  const item = branch.items[index]
  if (!item || item.question.type !== 'extended-writing') {
    return { prompt: '', arabic: '' }
  }
  return {
    prompt: `${item.visibleLabel}- ${item.question.prompt}`,
    arabic: item.arabicPrompt ?? '',
  }
}

function answerSpace(branch: PhaseNineBranch): string {
  if (branch.kind === 'rewrite') {
    return '____________________________________________________________'
  }
  return ''
}

function answerRule(branch: PhaseNineBranch): string {
  const displayed = displayedPointCount(branch)
  if (branch.kind === 'writing-alternatives') {
    return 'Choose A or B'
  }
  if (branch.attemptCount < displayed) {
    return `Answer ${branch.attemptCount} of ${displayed}`
  }
  return displayed === 1 ? 'Answer 1' : `Answer all ${displayed}`
}

function answerRowBase(branch: PhaseNineBranch) {
  return {
    Q: String(branch.mainQuestionNumber),
    Part: branch.branchLabel ?? '—',
    Rule: answerRule(branch),
    Mark: branch.marks / branch.attemptCount,
    Total: branch.marks,
  }
}

function answerRows(branch: PhaseNineBranch): PhaseNineAnswerRow[] {
  const base = answerRowBase(branch)
  const markFor = (pointId: string) => branch.pointMarks?.[pointId] ?? base.Mark
  switch (branch.kind) {
    case 'completion': {
      const question = branch.items[0].question
      if (question.type !== 'completion') return []
      return completionPoints(question).map((point) => ({
        ...base,
        Mark: markFor(`${question.id}:blank:${question.content.blankIds[point.number - 1]}`),
        Point: String(point.number),
        Answer: point.answer,
      }))
    }
    case 'odd-word':
      return branch.items.map((item) => ({
        ...base,
        Mark: markFor(item.question.id),
        Point: item.visibleLabel,
        Answer: item.question.type === 'odd-word'
          ? item.question.answer.oddWord
          : '',
      }))
    case 'word-relationship':
      return branch.items.map((item) => ({
        ...base,
        Mark: markFor(item.question.id),
        Point: item.visibleLabel,
        Answer: item.question.type === 'word-relationship'
          ? item.question.answer.acceptedAnswers.join(' / ')
          : '',
      }))
    case 'rewrite': {
      const question = branch.items[0].question
      return [{
        ...base,
        Mark: markFor(question.id),
        Point: 'Main',
        Answer:
          question.type === 'rewrite'
            ? question.answer.acceptedAnswers.join(' / ')
            : '',
      }]
    }
    case 'writing-alternatives':
      return branch.items.map((item) => {
        const question = item.question
        const answer =
          question.type === 'extended-writing'
            ? question.answer.modelAnswer ||
              question.answer.rubricCriteria?.join('; ') ||
              question.answer.manualMarkingNote ||
              MANUAL_MARKING_NOTE
            : ''
        return {
          ...base,
          Mark: markFor(question.id),
          Point: item.visibleLabel,
          Answer: answer,
        }
      })
  }
}

function teacherFooter(settings: ExamSettings): string {
  return settings.teacherName?.trim() || '____________________'
}

function projectPhaseNineExamData(
  snapshot: PhaseNineExamSnapshot,
  settings: ExamSettings,
  generalInstruction: string,
) {
  if (!generalInstruction.trim()) {
    throw new Error('A source-supplied general instruction is required.')
  }
  return {
    ExamTitle: settings.examTitle.trim(),
    SchoolName: settings.schoolName.trim(),
    Grade: String(settings.grade),
    TeacherName: teacherFooter(settings),
    GeneralInstruction: generalInstruction.trim(),
    Branches: snapshot.structure.branches.map((branch) => {
      const a = writingAlternative(branch, 0)
      const b = writingAlternative(branch, 1)
      return {
        Heading: sourceHeading(branch),
        ArabicInstruction: branch.arabicInstruction?.trim() ?? '',
        Marks: branch.marks,
        WordBank: wordBank(branch),
        Body: branchBody(branch),
        AlternativeA: a.prompt,
        AlternativeAArabic: a.arabic,
        AlternativeB: b.prompt,
        AlternativeBArabic: b.arabic,
        AnswerSpace: answerSpace(branch),
      } satisfies PhaseNineStudentBranch
    }),
  }
}

function projectPhaseNineAnswerKeyData(
  snapshot: PhaseNineExamSnapshot,
  settings: ExamSettings,
) {
  return {
    ExamTitle: settings.examTitle.trim(),
    SchoolName: settings.schoolName.trim(),
    Grade: String(settings.grade),
    TeacherName: teacherFooter(settings),
    Answers: snapshot.structure.branches.flatMap(answerRows),
  }
}

export function buildPhaseNineExamData(snapshot: PhaseNineExamSnapshot, settings: ExamSettings, generalInstruction: string) {
  return projectPhaseNineExamData(parsePhaseNineSnapshot(JSON.stringify(snapshot)), settings, generalInstruction)
}

export function buildPhaseNineAnswerKeyData(snapshot: PhaseNineExamSnapshot, settings: ExamSettings) {
  return projectPhaseNineAnswerKeyData(parsePhaseNineSnapshot(JSON.stringify(snapshot)), settings)
}

type TemplateBinary = Blob | ArrayBuffer

export type AnswerMergeGroup = {
  start: number
  length: number
  mergeAnswer: boolean
  /** Keep exam-owned point marks visible on every row. Historical output defaults to merged marks. */
  mergeMarks?: boolean
}

function answerMergeGroups(
  snapshot: PhaseNineExamSnapshot,
): AnswerMergeGroup[] {
  let start = 0
  return snapshot.structure.branches.map((branch) => {
    const rows = answerRows(branch)
    const group = {
      start,
      length: rows.length,
      mergeAnswer:
        branch.kind === 'writing-alternatives' &&
        rows.length > 1 &&
        rows.every((row) => row.Answer === rows[0].Answer),
      ...(snapshot.schemaVersion === 2 ? { mergeMarks: false } : {}),
    }
    start += rows.length
    return group
  })
}

function elementChildren(element: Element, localName: string): Element[] {
  return Array.from(element.childNodes).filter(
    (node): node is Element => node.nodeType === 1 && (node as Element).localName === localName,
  )
}

export async function mergeStructuredAnswerCells<T extends TemplateBinary>(
  answerKey: T,
  groups: AnswerMergeGroup[],
): Promise<T> {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(answerKey)
  const documentFile = zip.file('word/document.xml')
  if (!documentFile) {
    throw new Error('The answer-key DOCX is missing word/document.xml.')
  }

  const namespace =
    'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
  const document = new DOMParser().parseFromString(
    await documentFile.async('string'),
    'application/xml',
  )
  if (document.getElementsByTagName('parsererror').length > 0) {
    throw new Error('The answer-key document XML could not be parsed.')
  }

  const tables = Array.from(document.getElementsByTagNameNS(namespace, 'tbl'))
  const answerTable = tables.find((table) => {
    const header = elementChildren(table, 'tr')[0]
    return header && elementChildren(header, 'tc').map((cell) => cell.textContent).join('|') === 'Q|Part|Rule|Point|Answer|Mark|Total'
  })
  if (!answerTable) {
    throw new Error('The answer-key template is missing its structured answer table.')
  }
  const rows = elementChildren(answerTable, 'tr')
  const answerRowsXml = rows.slice(1)
  const expectedRows = groups.reduce((sum, group) => sum + group.length, 0)
  if (answerRowsXml.length !== expectedRows) {
    throw new Error('The answer-key row count does not match the structured snapshot.')
  }
  if (answerRowsXml.some((row) => elementChildren(row, 'tc').length !== 7)) {
    throw new Error('The answer-key table must have exactly seven cells per answer row.')
  }

  const mergeColumn = (
    group: AnswerMergeGroup,
    columnIndex: number,
  ) => {
    if (group.length < 2) return
    for (let offset = 0; offset < group.length; offset += 1) {
      const row = answerRowsXml[group.start + offset]
      const cells = elementChildren(row, 'tc')
      const cell = cells[columnIndex]
      const properties = elementChildren(cell, 'tcPr')[0]
      if (!properties) {
        throw new Error('An answer-key cell is missing its properties.')
      }
      const merge = document.createElementNS(namespace, 'w:vMerge')
      if (offset === 0) {
        merge.setAttributeNS(namespace, 'w:val', 'restart')
      } else {
        for (const text of Array.from(
          cell.getElementsByTagNameNS(namespace, 't'),
        )) {
          text.textContent = ''
        }
      }
      properties.appendChild(merge)
    }
  }

  for (const group of groups) {
    for (const column of [0, 1, 2, 6]) {
      mergeColumn(group, column)
    }
    if (group.mergeMarks !== false) mergeColumn(group, 5)
    if (group.mergeAnswer) mergeColumn(group, 4)
  }

  zip.file('word/document.xml', new XMLSerializer().serializeToString(document))
  const options = {
    type: answerKey instanceof Blob ? 'blob' : 'arraybuffer',
    compression: 'DEFLATE',
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  } as const
  return (await zip.generateAsync(options)) as T
}

export async function createPhaseNineDocumentBlobs<
  T extends TemplateBinary,
>(
  snapshot: PhaseNineExamSnapshot,
  settings: ExamSettings,
  generalInstruction: string,
  examTemplate: T,
  answerKeyTemplate: T,
): Promise<{ exam: T; answerKey: T }> {
  // Validate and copy once, before the first await, so both files and merge
  // boundaries describe the same aggregate even if the caller later edits it.
  const validated = parsePhaseNineSnapshot(JSON.stringify(snapshot))
  const examData = projectPhaseNineExamData(validated, settings, generalInstruction)
  const keyData = projectPhaseNineAnswerKeyData(validated, settings)
  validateDocumentText(examData)
  validateDocumentText(keyData)
  const mergeGroups = answerMergeGroups(validated)
  const { TemplateHandler } = await import('easy-template-x')
  const [exam, rawAnswerKey] = await Promise.all([
    new TemplateHandler().process(
      await preparePaperTemplate(examTemplate, 'student'),
      examData,
    ),
    new TemplateHandler().process(
      await preparePaperTemplate(answerKeyTemplate, 'key'),
      keyData,
    ),
  ])
  const answerKey = await mergeStructuredAnswerCells(
    rawAnswerKey,
    mergeGroups,
  )
  return { exam, answerKey }
}
