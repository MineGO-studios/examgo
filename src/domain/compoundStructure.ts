import { isUuid, validateDomainQuestion, type DomainQuestion } from './questionDomain'
import { validatePassageGroup, type PassageGroup } from './passageGroup'
import { assignAttemptMarks, passagePointIds, questionPointIds } from './markAllocation'
import type { Json } from '../types/database'

/** Exact source group metadata for an exercise whose blanks have separate canonical identities. */
export interface CompletionGroup {
  id: string
  ownerId: string
  bankId: string
  revision: number
  schemaVersion: 1
  title: string | null
  instruction: string
  attemptCount: number
  expectedMarks: number | null
  content: Json
  childIds: string[]
}

export interface CompoundItem {
  label: string
  question: DomainQuestion
}

export interface CompoundBranch {
  id: string
  mainQuestionNumber: number
  branchLabel: 'A' | 'B' | null
  kind: 'passage' | 'questions' | 'matching' | 'completion' | 'alternatives'
  instruction: string
  arabicInstruction: string | null
  marks: number
  attemptCount: number
  items: CompoundItem[]
  passageGroup?: PassageGroup
  completionGroup?: CompletionGroup
  /** Version 2 exam-owned scoring; canonical revision marks remain unchanged. */
  pointMarks?: Record<string, number>
  /** General blueprints record the teacher's answer rule separately from source metadata. */
  answerRule?: { kind: 'points'; pointsToAnswer: number } | { kind: 'task' } | { kind: 'choose-one' }
}

export interface CompoundSnapshot {
  schemaVersion: 1 | 2
  ownerId: string
  bankId: string
  /** Selected collections, separate from each question's canonical source bank. Required in version 2. */
  bankIds?: string[]
  selectionSeed: number
  totalMarks: number
  branches: CompoundBranch[]
}

export function compoundBranchPointIds(branch: CompoundBranch): string[] {
  return branch.kind === 'passage' && branch.passageGroup
    ? passagePointIds(branch.passageGroup.id, branch.items.map((item) => item.question.id))
    : branch.items.flatMap((item) => questionPointIds(item.question))
}

function requireValid(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export function parseCompoundSnapshot(value: unknown): CompoundSnapshot {
  requireValid(value && typeof value === 'object' && !Array.isArray(value), 'A compound snapshot is required.')
  const snapshot = value as CompoundSnapshot
  requireValid(snapshot.schemaVersion === 1 || snapshot.schemaVersion === 2, 'Compound snapshot version is unsupported.')
  const examOwnedMarks = snapshot.schemaVersion === 2
  if (examOwnedMarks) requireValid(Array.isArray(snapshot.bankIds) && snapshot.bankIds.length >= 1 && snapshot.bankIds.length <= 20 &&
    snapshot.bankIds[0] === snapshot.bankId && snapshot.bankIds.every(isUuid) &&
    new Set(snapshot.bankIds).size === snapshot.bankIds.length, 'Select one to 20 distinct bank identities with the primary bank first.')
  if (examOwnedMarks) requireValid(Number.isSafeInteger(snapshot.totalMarks) && snapshot.totalMarks >= 1 && snapshot.totalMarks <= 1000, 'Exam total must be a whole number from 1 to 1000.')
  requireValid(isUuid(snapshot.ownerId) && isUuid(snapshot.bankId), 'Compound owner and bank identities are invalid.')
  requireValid(Number.isSafeInteger(snapshot.selectionSeed) && snapshot.selectionSeed >= 0 && snapshot.selectionSeed <= 0xffffffff, 'Compound seed is invalid.')
  requireValid(Array.isArray(snapshot.branches) && snapshot.branches.length > 0 && snapshot.branches.length <= 20, 'Compound branches are missing or excessive.')
  const branchIds = new Set<string>(); const labels = new Set<string>(); const questionIds = new Set<string>()
  let previousNumber = 0; let previousLabel = ''
  let total = 0
  snapshot.branches.forEach((branch, branchIndex) => {
    requireValid(branch && typeof branch === 'object', `Branch ${branchIndex + 1} is missing.`)
    requireValid(typeof branch.id === 'string' && branch.id.trim() && !branchIds.has(branch.id), 'Branch identities must be unique.')
    branchIds.add(branch.id)
    requireValid(Number.isSafeInteger(branch.mainQuestionNumber) && branch.mainQuestionNumber >= 1 && branch.mainQuestionNumber <= 99, 'Main-question number is invalid.')
    requireValid(branch.branchLabel === null || branch.branchLabel === 'A' || branch.branchLabel === 'B', 'Branch label is invalid.')
    const key = `${branch.mainQuestionNumber}:${branch.branchLabel ?? ''}`
    requireValid(!labels.has(key), 'Main-question and branch labels must be unique.')
    labels.add(key)
    requireValid(branch.mainQuestionNumber > previousNumber || (branch.mainQuestionNumber === previousNumber && previousLabel === 'A' && branch.branchLabel === 'B'), 'Main questions and branches must follow source order.')
    previousNumber = branch.mainQuestionNumber; previousLabel = branch.branchLabel ?? ''
    requireValid(['passage', 'questions', 'matching', 'completion', 'alternatives'].includes(branch.kind), 'Branch kind is unsupported.')
    requireValid(typeof branch.instruction === 'string' && branch.instruction.trim() && branch.instruction.length <= 1000, 'A printed branch instruction is required.')
    requireValid(branch.arabicInstruction === null || (typeof branch.arabicInstruction === 'string' && branch.arabicInstruction.trim() && branch.arabicInstruction.length <= 1000), 'Arabic branch instruction is invalid.')
    requireValid(Number.isSafeInteger(branch.marks) && branch.marks >= 1 && branch.marks <= 1000, 'Branch marks are invalid.')
    requireValid(Array.isArray(branch.items) && branch.items.length >= 1 && branch.items.length <= 100, 'A branch needs ordered questions.')
    requireValid(Number.isSafeInteger(branch.attemptCount) && branch.attemptCount >= 1, 'Branch attempt count is invalid.')
    if (branch.answerRule !== undefined) {
      requireValid(examOwnedMarks && branch.answerRule !== null && typeof branch.answerRule === 'object', 'Teacher answer rules require version 2 scoring.')
      const rule = branch.answerRule
      requireValid(rule.kind === 'points' || rule.kind === 'task' || rule.kind === 'choose-one', 'Teacher answer rule is unsupported.')
      if (rule.kind === 'points') requireValid(Number.isSafeInteger(rule.pointsToAnswer) && rule.pointsToAnswer === branch.attemptCount &&
        branch.items.every(({ question }) => question.type !== 'extended-writing' && !(question.type === 'rewrite' && /punctuation/i.test(question.content.instruction))),
        'Points to answer must match the exam scoring count.')
      else if (rule.kind === 'choose-one') requireValid(branch.kind === 'alternatives' && branch.attemptCount === 1 && branch.items.every(({ question }) => question.type === 'extended-writing'),
        'Choose one requires writing alternatives.')
      else requireValid(branch.kind === 'questions' && branch.attemptCount === 1 && branch.items.length === 1 &&
        branch.items.every(({ question }) => question.type === 'extended-writing' || question.type === 'rewrite' && /punctuation/i.test(question.content.instruction)),
      'Only a single writing or punctuation task omits Points to answer.')
      if (branch.kind === 'passage') requireValid(branch.items.every(({ question }) => questionPointIds(question).length === 1),
        'A passage question must have one answerable point; nested sets need a separate branch.')
    }
    const itemLabels = new Set<string>()
    let itemMarks = 0; let firstMark = 0
    branch.items.forEach((item, index) => {
      requireValid(item && typeof item.label === 'string' && item.label.trim() && !itemLabels.has(item.label), 'Branch point labels must be unique.')
      itemLabels.add(item.label)
      const question = item.question
      const result = validateDomainQuestion(question)
      requireValid(result.success, `Branch question ${index + 1} is invalid: ${result.success ? '' : result.issues[0].message}`)
      requireValid(question.ownerId === snapshot.ownerId && (examOwnedMarks || question.bankId === snapshot.bankId) && question.isActive, 'Branch question is outside the active owned bank.')
      requireValid(!questionIds.has(question.id), 'One canonical question cannot appear twice.')
      questionIds.add(question.id)
      if (!examOwnedMarks) {
        requireValid(question.marks !== null, 'Branch question needs exam-assigned marks.')
        itemMarks += question.marks; firstMark ||= question.marks
      }
    })
    if (branch.answerRule?.kind === 'choose-one') requireValid(new Set(branch.items.map(({ question }) =>
      question.prompt.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase())).size === 2,
    'Writing alternatives require two distinct printed prompts.')
    if (branch.kind === 'passage') {
      const passage = branch.passageGroup
      requireValid(passage !== undefined, 'Passage branch is missing its saved group.')
      const result = validatePassageGroup(passage, { examOwnedMarks })
      requireValid(result.success, `Passage group is invalid: ${result.success ? '' : result.issues[0].message}`)
      requireValid(passage.ownerId === snapshot.ownerId && (examOwnedMarks || passage.bankId === snapshot.bankId) &&
        (branch.answerRule !== undefined || passage.instruction === branch.instruction && passage.attemptCount === branch.attemptCount) &&
        (examOwnedMarks || passage.expectedMarks === branch.marks), 'Passage branch disagrees with its group.')
      requireValid(passage.children.length === branch.items.length && passage.children.every((child, index) =>
        child.question.id === branch.items[index].question.id &&
        child.question.revision === branch.items[index].question.revision &&
        JSON.stringify(child.question) === JSON.stringify(branch.items[index].question)),
      'Passage child content, identities or revisions changed.')
    } else requireValid(branch.passageGroup === undefined, 'Only passage branches may have a passage group.')
    if (branch.kind === 'completion') {
      requireValid((examOwnedMarks || branch.items.length === 1) && branch.items.every((item) => item.question.type === 'completion'), 'Completion branch requires ordered completion questions.')
      let displayed = 0
      const first = branch.items[0].question
      for (const { question: completion } of branch.items) if (completion.type === 'completion' && first.type === 'completion') {
        const lines = completion.content.text.split(/\r?\n/)
        requireValid(lines.length === completion.content.blankIds.length && lines.every((line) => (line.match(/\.{3,}|_{3,}|…+/g) ?? []).length === 1), 'Completion lines and blank identities disagree.')
        displayed += lines.length
        requireValid(JSON.stringify(completion.content.wordBank) === JSON.stringify(first.content.wordBank) &&
          completion.content.wordBankOrder === first.content.wordBankOrder && completion.content.allowWordReuse === first.content.allowWordReuse &&
          completion.content.requireAllWordsUsed === first.content.requireAllWordsUsed, 'Completion points must preserve one shared word bank and its rules.')
      }
      requireValid(branch.attemptCount <= displayed && (examOwnedMarks || branch.marks === first.marks && branch.marks % branch.attemptCount === 0), 'Completion attempt rule and marks are invalid.')
      if (branch.items.length > 1) {
        const group = branch.completionGroup
        requireValid(examOwnedMarks && group && isUuid(group.id) && isUuid(group.bankId) && group.ownerId === snapshot.ownerId &&
          group.schemaVersion === 1 && Number.isSafeInteger(group.revision) && group.revision >= 1 &&
          (branch.answerRule !== undefined || group.instruction === branch.instruction && group.attemptCount === branch.attemptCount) &&
          (group.title === null || typeof group.title === 'string' && group.title.length <= 200) &&
          (group.expectedMarks === null || Number.isSafeInteger(group.expectedMarks) && group.expectedMarks >= 1 && group.expectedMarks <= 1000) &&
          group.content !== null && typeof group.content === 'object' && !Array.isArray(group.content) &&
          Array.isArray(group.childIds) && group.childIds.length === branch.items.length &&
          group.childIds.every((id, index) => id === branch.items[index].question.id) &&
          branch.items.every((item) => item.question.bankId === group.bankId && item.question.type === 'completion' && item.question.content.blankIds.length === 1),
        'Completion exercise must capture its exact owned group and ordered single-blank identities.')
      } else requireValid(branch.completionGroup === undefined, 'A single completion set must not capture a separate child group.')
    } else if (branch.kind === 'matching') {
      requireValid(branch.items.length === 1 && branch.items[0].question.type === 'matching', 'Matching branch requires one matching set.')
      const matching = branch.items[0].question
      if (matching.type === 'matching') {
        requireValid(branch.attemptCount <= matching.content.left.length && (examOwnedMarks || branch.marks === matching.marks && branch.marks % branch.attemptCount === 0), 'Matching attempt rule and marks are invalid.')
      }
    } else {
      requireValid(branch.items.every((item) => item.question.type !== 'matching'), 'Matching questions need a matching branch.')
      if (examOwnedMarks) requireValid(branch.items.every((item) => item.question.type !== 'completion'), 'Completion questions need a completion branch.')
      requireValid(branch.attemptCount <= branch.items.length, 'Attempt count exceeds displayed questions.')
      if (!examOwnedMarks && branch.attemptCount < branch.items.length) {
        requireValid(branch.items.every((item) => item.question.marks === firstMark) && firstMark * branch.attemptCount === branch.marks, 'Optional children must carry equal attempted marks.')
      } else if (!examOwnedMarks) requireValid(itemMarks === branch.marks, 'Branch marks differ from required children.')
      if (branch.kind === 'alternatives') requireValid(branch.items.length === 2 && branch.attemptCount === 1 && branch.items.map((item) => item.label).join(',') === 'A,B', 'Alternatives must offer A or B with a choose-one rule.')
    }
    if (branch.kind !== 'completion') requireValid(branch.completionGroup === undefined, 'Only completion exercises may capture a completion group.')
    if (examOwnedMarks) {
      requireValid(branch.pointMarks && typeof branch.pointMarks === 'object' && !Array.isArray(branch.pointMarks), 'Assign exam marks to every displayed point.')
      assignAttemptMarks(compoundBranchPointIds(branch), branch.marks, branch.attemptCount,
        { mode: 'custom', marksByPoint: branch.pointMarks })
    } else requireValid(branch.pointMarks === undefined, 'Exam-owned point marks require compound snapshot version 2.')
    total += branch.marks
  })
  requireValid(snapshot.totalMarks === total, 'Compound total differs from attempt-aware branch marks.')
  return structuredClone(snapshot)
}
