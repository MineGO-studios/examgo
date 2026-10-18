import { isUuid, validateExamSnapshot, type DomainQuestion } from '../domain/questionDomain'
import type { ExamSettings } from '../types/exam'
import type { PageTarget } from './pageTarget'
import { canonicalJson, canonicalQuestionCandidates } from './canonicalQuestionCandidates'
import { getFirstValidationError, validateExamSettings } from './validateExamSettings'
import {
  createPhaseNineSnapshot, parsePhaseNineSnapshot, selectPhaseNineBranch,
  type PhaseNineBranchBlueprint, type PhaseNineQuestion, type PhaseNineReview,
} from './phaseNineWorkflow'

export const PHASE_NINE_PROFILE_ID = 'iraqi-phase-nine-source-v1' as const
export const PHASE_NINE_GENERAL_INSTRUCTION = 'Note: Answer all the questions.'

// Approved Q3/A–Q5 excerpt; not a general blueprint editor or a complete Q1–Q5 paper.
export const PHASE_NINE_PROFILE: readonly PhaseNineBranchBlueprint[] = [
  { id: 'q3a', mainQuestionNumber: 3, branchLabel: 'A', kind: 'completion', questionType: 'completion', instruction: 'Use the words in the box to complete the sentences.', arabicInstruction: 'استخدم الكلمات بين الاقواس لاكمال الجمل', marks: 10, attemptCount: 5, layout: 'vertical', questionCount: 1, visibleLabels: ['1–5'] },
  { id: 'q3b', mainQuestionNumber: 3, branchLabel: 'B', kind: 'odd-word', questionType: 'odd-word', instruction: 'B-Write the odd word. (5 only)', arabicInstruction: 'اكتب الكلمة المختلفة. (خمس فقط)', marks: 10, attemptCount: 5, layout: 'vertical', questionCount: 6, visibleLabels: ['1', '2', '3', '4', '5', '6'] },
  { id: 'q4a', mainQuestionNumber: 4, branchLabel: 'A', kind: 'word-relationship', questionType: 'word-relationship', instruction: 'Fill the blanks with the missing words. (5 only).', arabicInstruction: 'املأ الفراغات بالكلمات المفقودة. (خمس فقط)', marks: 10, attemptCount: 5, layout: 'source-two-column', questionCount: 6, visibleLabels: ['1', '2', '3', '4', '5', '6'] },
  { id: 'q4b', mainQuestionNumber: 4, branchLabel: 'B', kind: 'rewrite', questionType: 'rewrite', instruction: 'Rewrite the sentence using capital letters and punctuation marks.', arabicInstruction: 'أعد كتابة الجملة الآتية باستخدام الحروف الكبيرة وعلامات التنقيط.', marks: 10, attemptCount: 1, layout: 'vertical', questionCount: 1, visibleLabels: ['Main'] },
  { id: 'q5', mainQuestionNumber: 5, branchLabel: null, kind: 'writing-alternatives', questionType: 'extended-writing', instruction: 'Writing (Choose either A or B)', arabicInstruction: 'اختر إما A أو B.', marks: 20, attemptCount: 1, layout: 'writing-alternatives', questionCount: 2, visibleLabels: ['A', 'B'] },
]

export interface PhaseNineTeacherIntent {
  schemaVersion: 2 | 3
  profileId: typeof PHASE_NINE_PROFILE_ID
  rendererVersion: 1
  ownerId: string
  bankId: string
  /** Version 3 uses membership readers; canonical revisions keep their original source bank. */
  bankIds?: string[]
  settings: ExamSettings & { teacherName: string }
  filters: { lesson: string; difficulty: '' | 'easy' | 'medium' | 'hard' }
  pageTarget: PageTarget
  generalInstruction: string
  review: PhaseNineReview
}

/** For multiple banks, questions must come from the authorized membership reader. */
export function phaseNinePool(questions: readonly DomainQuestion[], ownerId: string, bankId: string | readonly string[], filters: PhaseNineTeacherIntent['filters']): PhaseNineQuestion[] {
  return canonicalQuestionCandidates(questions).filter((q): q is PhaseNineQuestion =>
    q.ownerId === ownerId && (typeof bankId !== 'string' || q.bankId === bankId) && q.unit === 1 &&
    PHASE_NINE_PROFILE.some((branch) => branch.questionType === q.type) &&
    (!filters.lesson || q.lesson === filters.lesson) && (!filters.difficulty || q.difficulty === filters.difficulty))
}

export function selectPhaseNinePaper(questions: readonly PhaseNineQuestion[], seed: number): PhaseNineReview {
  return selectPaper(questions, seed, 1)
}

export function selectPhaseNineMarkedPaper(questions: readonly PhaseNineQuestion[], seed: number): PhaseNineReview {
  return selectPaper(questions, seed, 2)
}

function selectPaper(questions: readonly PhaseNineQuestion[], seed: number, version: 1 | 2): PhaseNineReview {
  const branches = PHASE_NINE_PROFILE.map((blueprint, index) => {
    const candidates = canonicalQuestionCandidates(questions).filter((q) => {
      if (q.type !== blueprint.questionType) return false
      const marks = blueprint.kind === 'odd-word' || blueprint.kind === 'word-relationship' ? 2 : blueprint.marks
      if (version === 1 && q.marks !== marks) return false
      if (q.type === 'completion' && q.content.blankIds.length !== 5) return false
      if (q.type === 'rewrite' && q.content.instruction !== blueprint.instruction) return false
      try {
        // Check the source-specific content form before it enters seeded selection.
        if (q.type === 'completion') selectPhaseNineBranch([q], blueprint, seed, version)
        return true
      } catch { return false }
    })
    return selectPhaseNineBranch(candidates, blueprint, (seed + index * 1_000_003) >>> 0, version)
  })
  return { snapshot: createPhaseNineSnapshot({ schemaVersion: version, branches }, seed), lockedQuestionIds: [] }
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function parsePhaseNineTeacherIntent(value: unknown): PhaseNineTeacherIntent {
  if (!record(value) || (value.schemaVersion !== 2 && value.schemaVersion !== 3) || value.profileId !== PHASE_NINE_PROFILE_ID || value.rendererVersion !== 1) {
    throw new Error('This saved exam uses an unsupported workflow, profile or renderer version. Keep the saved record and use a compatible ExamGO version.')
  }
  if (typeof value.ownerId !== 'string' || !isUuid(value.ownerId) || typeof value.bankId !== 'string' || !isUuid(value.bankId)) throw new Error('The saved teacher and bank identities are invalid.')
  const examOwnedMarks = value.schemaVersion === 3
  if (examOwnedMarks && (!Array.isArray(value.bankIds) || value.bankIds.length < 1 || value.bankIds.length > 20 ||
    value.bankIds[0] !== value.bankId || value.bankIds.some((id) => typeof id !== 'string' || !isUuid(id)) ||
    new Set(value.bankIds).size !== value.bankIds.length)) throw new Error('Select one to 20 distinct banks, primary bank first.')
  if (!examOwnedMarks && value.bankIds !== undefined) throw new Error('Multiple banks require a new paper.')
  if (!record(value.settings) || !record(value.filters) || !record(value.review)) throw new Error('Saved teacher settings or review are missing.')
  const settings = value.settings
  if (examOwnedMarks && settings.unit !== 1) throw new Error('This fixed exercise profile requires Unit 1.')
  if (['schoolName', 'examTitle', 'teacherName'].some((key) => typeof settings[key] !== 'string')) throw new Error('Saved paper identity and teacher name must be text.')
  const filters = value.filters
  if (typeof filters.lesson !== 'string' || filters.lesson.length > 40 || !['', 'easy', 'medium', 'hard'].includes(filters.difficulty as string)) throw new Error('Saved question filters are invalid.')
  if (!Number.isInteger(value.pageTarget) || (value.pageTarget as number) < 1 || (value.pageTarget as number) > 5) throw new Error('Page target must be between one and five.')
  if (value.generalInstruction !== PHASE_NINE_GENERAL_INSTRUCTION) throw new Error('The source-specific general instruction is unsupported.')
  const snapshot = parsePhaseNineSnapshot(JSON.stringify(value.review.snapshot))
  if (snapshot.schemaVersion !== (examOwnedMarks ? 2 : 1)) throw new Error('Teacher workflow and snapshot scoring versions disagree.')
  if (!Array.isArray(value.review.lockedQuestionIds) || value.review.lockedQuestionIds.some((id) => typeof id !== 'string')) throw new Error('Saved question locks are invalid.')
  const questions = snapshot.structure.branches.flatMap((b) => b.items.map((item) => item.question))
  const settingsError = getFirstValidationError(validateExamSettings(settings as ExamSettings, questions.length))
  if (settingsError) throw new Error(settingsError)
  if (settings.questionCount !== questions.length || settings.selectionSeed !== snapshot.selectionSeed || settings.questionQuantities !== undefined) throw new Error('Saved quantities and seed disagree with the structured paper.')
  if (snapshot.structure.branches.length !== PHASE_NINE_PROFILE.length) throw new Error('The saved paper does not match the approved source profile.')
  snapshot.structure.branches.forEach((branch, index) => {
    const profile = PHASE_NINE_PROFILE[index]
    for (const key of ['id', 'mainQuestionNumber', 'branchLabel', 'kind', 'instruction', 'arabicInstruction', 'marks', 'attemptCount', 'layout'] as const) {
      if ((key !== 'marks' || !examOwnedMarks) && branch[key] !== profile[key]) throw new Error(`Saved branch ${profile.id} disagrees with the approved source profile.`)
    }
    if (branch.items.length !== profile.questionCount || branch.items.some((item, i) => item.visibleLabel !== profile.visibleLabels[i])) throw new Error('Saved source item counts or labels disagree.')
    if (branch.items.some((item) => item.question.type === 'completion' && item.question.content.blankIds.length !== 5)) throw new Error('The approved completion profile requires exactly five displayed blanks.')
    if (branch.items.some((item) => item.arabicPrompt !== undefined)) throw new Error('Per-question Arabic translation is not stored in the question revision; remove it before finalization.')
  })
  const ids = new Set(questions.map((q) => q.id))
  const locks = value.review.lockedQuestionIds as string[]
  if (new Set(locks).size !== locks.length || locks.some((id) => !ids.has(id))) throw new Error('Locks must reference distinct selected questions.')
  if (questions.some((q) => q.ownerId !== value.ownerId || (!examOwnedMarks && q.bankId !== value.bankId) || q.unit !== settings.unit || !q.isActive || (filters.lesson && q.lesson !== filters.lesson) || (filters.difficulty && q.difficulty !== filters.difficulty))) throw new Error('Selected revisions disagree with teacher ownership, bank or filters.')
  if (!examOwnedMarks && questions.some((q) => q.marks === null)) throw new Error('Assign exam marks before finalizing a markless question.')
  if (!examOwnedMarks) {
    const scoring = validateExamSnapshot({
    id: 'validated-intent', ownerId: value.ownerId, schemaVersion: 1, selectionSeed: snapshot.selectionSeed, totalMarks: snapshot.totalMarks,
    questions: questions.map((q, index) => ({ questionId: q.id, questionRevisionId: `${q.id}:${q.revision}`, revision: q.revision, position: index + 1, marks: q.marks!, sourceGroupId: null })),
    attemptGroups: snapshot.structure.branches.map((b) => ({ id: b.id, questionIds: b.items.map((i) => i.question.id), attemptCount: b.kind === 'completion' ? 1 : b.attemptCount })),
    })
    if (!scoring.success) throw new Error(scoring.issues[0].message)
  }
  // Copy at the boundary so asynchronous persistence cannot observe caller edits.
  return JSON.parse(canonicalJson({ ...value, review: { snapshot, lockedQuestionIds: [...locks].sort() } })) as PhaseNineTeacherIntent
}
