import {
  EXAM_LIMITS,
  type ExamSettings,
} from '../types/exam'

export type ExamSettingsErrors = Partial<
  Record<keyof ExamSettings, string>
>

export function validateExamSettings(
  settings: ExamSettings,
  availableQuestionCount: number,
): ExamSettingsErrors {
  const errors: ExamSettingsErrors = {}
  const schoolName = settings.schoolName.trim()
  const examTitle = settings.examTitle.trim()

  if (schoolName.length === 0) {
    errors.schoolName = 'School name is required.'
  } else if (
    schoolName.length > EXAM_LIMITS.schoolNameMaxLength
  ) {
    errors.schoolName = `School name cannot exceed ${EXAM_LIMITS.schoolNameMaxLength} characters.`
  }

  if (examTitle.length === 0) {
    errors.examTitle = 'Test title is required.'
  } else if (
    examTitle.length > EXAM_LIMITS.examTitleMaxLength
  ) {
    errors.examTitle = `Test title cannot exceed ${EXAM_LIMITS.examTitleMaxLength} characters.`
  }

  if (settings.grade !== 6) {
    errors.grade = 'This prototype currently supports Grade 6 only.'
  }

  if (settings.unit !== 1) {
    errors.unit = 'This prototype currently supports Unit 1 only.'
  }

  if (
    !Number.isInteger(settings.marksPerQuestion) ||
    settings.marksPerQuestion <
      EXAM_LIMITS.minimumMarksPerQuestion ||
    settings.marksPerQuestion >
      EXAM_LIMITS.maximumMarksPerQuestion
  ) {
    errors.marksPerQuestion =
      `Marks must be a whole number between ` +
      `${EXAM_LIMITS.minimumMarksPerQuestion} and ` +
      `${EXAM_LIMITS.maximumMarksPerQuestion}.`
  }

  const maximumQuestionCount = Math.min(
    EXAM_LIMITS.maximumQuestionCount,
    availableQuestionCount,
  )

  if (maximumQuestionCount < 1) {
    errors.questionCount =
      'No approved questions are available for this test.'
  } else if (
    !Number.isInteger(settings.questionCount) ||
    settings.questionCount <
      EXAM_LIMITS.minimumQuestionCount ||
    settings.questionCount > maximumQuestionCount
  ) {
    errors.questionCount =
      `Question quantity must be between ` +
      `${EXAM_LIMITS.minimumQuestionCount} and ` +
      `${maximumQuestionCount}.`
  }

  return errors
}

export function getFirstValidationError(
  errors: ExamSettingsErrors,
): string | null {
  return Object.values(errors)[0] ?? null
}