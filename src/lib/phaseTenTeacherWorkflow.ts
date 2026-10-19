import { isUuid } from '../domain/questionDomain'
import type { CompoundSnapshot } from '../domain/compoundStructure'
import type { ExamSettings } from '../types/exam'
import { canonicalJson } from './canonicalQuestionCandidates'
import { EXAM_002_PROFILE_ID } from './fixtures/phaseTenExam002Candidate'
import { parseExam002CandidateSnapshot } from './phaseTenCandidateProfile'
import type { MidyearSelectionControls } from './phaseTenMidyearSelection'
import { getFirstValidationError, validateExamSettings } from './validateExamSettings'

export const PHASE_TEN_CANDIDATE_PROFILE_ID = EXAM_002_PROFILE_ID
export const PHASE_TEN_GENERAL_INSTRUCTION = 'Answer all questions.'
export const PHASE_TEN_MIDYEAR_UNITS = [1, 2, 3, 4] as const

// Candidate-only intent. It must not be exposed as an approved teacher profile
// until source wording, marking and coverage decisions are complete.
export interface PhaseTenTeacherIntent {
  schemaVersion: 1 | 2
  profileId: typeof PHASE_TEN_CANDIDATE_PROFILE_ID
  rendererVersion: 1
  ownerId: string
  bankId: string
  settings: ExamSettings & { teacherName: string }
  generalInstruction: typeof PHASE_TEN_GENERAL_INSTRUCTION
  coverageUnits?: typeof PHASE_TEN_MIDYEAR_UNITS
  selectionControls?: MidyearSelectionControls
  snapshot: CompoundSnapshot
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function parsePhaseTenTeacherIntent(value: unknown): PhaseTenTeacherIntent {
  if (!record(value) || (value.schemaVersion !== 1 && value.schemaVersion !== 2) ||
    value.profileId !== PHASE_TEN_CANDIDATE_PROFILE_ID || value.rendererVersion !== 1) {
    throw new Error('This paper uses an unsupported candidate profile or renderer version.')
  }
  if (typeof value.ownerId !== 'string' || !isUuid(value.ownerId) || typeof value.bankId !== 'string' || !isUuid(value.bankId)) {
    throw new Error('The paper owner or bank identity is invalid.')
  }
  if (!record(value.settings) || typeof value.settings.teacherName !== 'string' || value.generalInstruction !== PHASE_TEN_GENERAL_INSTRUCTION) {
    throw new Error('Paper settings or the source general instruction are invalid.')
  }
  const snapshot = parseExam002CandidateSnapshot(value.snapshot)
  if (snapshot.schemaVersion !== value.schemaVersion) {
    throw new Error('Paper intent and snapshot scoring versions disagree.')
  }
  const midyear = value.coverageUnits !== undefined
  if (midyear && (!Array.isArray(value.coverageUnits) ||
    value.coverageUnits.length !== 4 || value.coverageUnits.some((unit, index) => unit !== PHASE_TEN_MIDYEAR_UNITS[index]))) {
    throw new Error('The mid-year profile must cover exactly Units 1–4.')
  }
  const questions = snapshot.branches.flatMap((branch) => branch.items.map((item) => item.question))
  if (value.selectionControls !== undefined) {
    if (!midyear || !record(value.selectionControls)) throw new Error('Selection controls require the mid-year profile.')
    const controls = value.selectionControls
    const excludedQuestions = controls.excludedQuestionIds ?? []
    const excludedGroups = controls.excludedPassageGroupIds ?? []
    const locks = controls.lockedQuestionIds ?? {}
    if (!Array.isArray(excludedQuestions) || !Array.isArray(excludedGroups) || !record(locks) ||
      [...excludedQuestions, ...excludedGroups].some((id) => typeof id !== 'string' || !isUuid(id)) ||
      typeof controls.lockedPassageGroupId !== 'undefined' &&
        (typeof controls.lockedPassageGroupId !== 'string' || !isUuid(controls.lockedPassageGroupId)) ||
      new Set(excludedQuestions).size !== excludedQuestions.length ||
      new Set(excludedGroups).size !== excludedGroups.length) {
      throw new Error('Selection controls contain invalid or duplicate identities.')
    }
    const selected = new Set(questions.map((question) => question.id))
    const passageId = snapshot.branches[0].passageGroup?.id
    if (excludedQuestions.some((id) => selected.has(id)) || excludedGroups.includes(passageId) ||
      controls.lockedPassageGroupId !== undefined && controls.lockedPassageGroupId !== passageId ||
      Object.entries(locks).some(([key, id]) => typeof id !== 'string' || !isUuid(id) ||
        !snapshot.branches.some((branch) => branch.id !== 'q1a' && branch.items.some((item) =>
          `${branch.id}:${item.label}` === key && item.question.id === id)))) {
      throw new Error('Selection controls disagree with the captured paper.')
    }
  }
  const settings = value.settings as PhaseTenTeacherIntent['settings']
  const error = getFirstValidationError(validateExamSettings(settings, questions.length))
  if (error) throw new Error(error)
  if (settings.questionQuantities !== undefined || settings.questionCount !== questions.length ||
    settings.selectionSeed !== snapshot.selectionSeed || snapshot.ownerId !== value.ownerId || snapshot.bankId !== value.bankId ||
    questions.some((question) => midyear
      ? !PHASE_TEN_MIDYEAR_UNITS.includes(question.unit as 1 | 2 | 3 | 4)
      : question.unit !== settings.unit) ||
    midyear && PHASE_TEN_MIDYEAR_UNITS.some((unit) => !questions.some((question) => question.unit === unit))) {
    throw new Error('Paper settings, ownership or captured question revisions disagree.')
  }
  return JSON.parse(canonicalJson({ ...value, snapshot })) as PhaseTenTeacherIntent
}
