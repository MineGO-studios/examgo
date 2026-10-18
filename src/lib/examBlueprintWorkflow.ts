import { EXAM_LIMITS, type ExamSettings } from '../types/exam'
import { parseExamBlueprint, type ExamBlueprint } from './examBlueprint'
import { getFirstValidationError, validateExamSettings } from './validateExamSettings'

export const EXAM_BLUEPRINT_PROFILE_ID = 'exam-blueprint-v1' as const

/** Reusable teacher configuration. Captured question content belongs only to a generated snapshot. */
export interface ExamBlueprintIntent {
  schemaVersion: 1
  profileId: typeof EXAM_BLUEPRINT_PROFILE_ID
  rendererVersion: 1
  blueprint: ExamBlueprint
  settings: Pick<ExamSettings, 'schoolName' | 'examTitle' | 'grade'> & { teacherName: string }
  generalInstruction: string
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function parseExamBlueprintIntent(value: unknown): ExamBlueprintIntent {
  if (!record(value) || value.schemaVersion !== 1 || value.profileId !== EXAM_BLUEPRINT_PROFILE_ID || value.rendererVersion !== 1 ||
    Object.keys(value).some((key) => !['schemaVersion', 'profileId', 'rendererVersion', 'blueprint', 'settings', 'generalInstruction'].includes(key))) {
    throw new Error('This editable blueprint uses an unsupported format. Reopen its supported configuration.')
  }
  const blueprint = parseExamBlueprint(value.blueprint)
  if (!record(value.settings) || typeof value.settings.schoolName !== 'string' || typeof value.settings.examTitle !== 'string' ||
    typeof value.settings.teacherName !== 'string' || value.settings.grade !== 6 ||
    Object.keys(value.settings).some((key) => !['schoolName', 'examTitle', 'teacherName', 'grade'].includes(key))) {
    throw new Error('Enter the school, test and teacher details for a Grade 6 blueprint.')
  }
  const settings = { schoolName: value.settings.schoolName, examTitle: value.settings.examTitle,
    teacherName: value.settings.teacherName, grade: value.settings.grade }
  const settingsError = getFirstValidationError(validateExamSettings({ ...settings, unit: 1, marksPerQuestion: 1,
    questionCount: blueprint.branches.reduce((sum, branch) => sum + branch.quantity, 0), selectionSeed: blueprint.selectionSeed },
  EXAM_LIMITS.maximumQuestionCount))
  if (settingsError) throw new Error(settingsError)
  if (typeof value.generalInstruction !== 'string' || !value.generalInstruction.trim() || value.generalInstruction.length > 1000) {
    throw new Error('Enter a general paper instruction of one to 1000 characters.')
  }
  return structuredClone({ schemaVersion: 1, profileId: EXAM_BLUEPRINT_PROFILE_ID, rendererVersion: 1,
    blueprint, settings, generalInstruction: value.generalInstruction })
}

/** A new editable configuration keeps teacher choices, without a saved identity or generated snapshot. */
export function duplicateExamBlueprintIntent(value: ExamBlueprintIntent): ExamBlueprintIntent {
  const intent = parseExamBlueprintIntent(value)
  intent.blueprint.version = 1
  intent.settings.examTitle = `${intent.settings.examTitle.slice(0, 73)} (copy)`
  return intent
}
