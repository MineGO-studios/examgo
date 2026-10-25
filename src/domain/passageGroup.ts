import {
  QUESTION_SCHEMA_VERSION,
  isUuid,
  validateDomainQuestion,
  type DomainQuestion,
  type DomainValidationIssue,
  type DomainValidationResult,
} from './questionDomain'

export interface PassageGroup {
  id: string
  ownerId: string
  bankId: string
  revision: number
  schemaVersion: typeof QUESTION_SCHEMA_VERSION
  title: string | null
  instruction: string
  arabicInstruction: string | null
  passage: string
  attemptCount: number
  expectedMarks: number | null
  children: { position: number; question: DomainQuestion }[]
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function validatePassageGroup(value: unknown,
  options: { examOwnedMarks?: boolean } = {}): DomainValidationResult {
  const issues: DomainValidationIssue[] = []
  const issue = (path: string, message: string) => issues.push({ path, message })
  if (!record(value)) return { success: false, issues: [{ path: '', message: 'A passage group is required.' }] }

  for (const key of ['id', 'ownerId', 'bankId'] as const) {
    if (typeof value[key] !== 'string' || !isUuid(value[key])) issue(key, 'A valid stable identity is required.')
  }
  if (value.schemaVersion !== QUESTION_SCHEMA_VERSION) issue('schemaVersion', 'Passage schema version is unsupported.')
  if (!Number.isSafeInteger(value.revision) || (value.revision as number) < 1) issue('revision', 'Passage revision must be positive.')
  if (value.title !== null && (typeof value.title !== 'string' || !value.title.trim() || value.title.length > 200)) issue('title', 'A supplied title must contain 1–200 characters.')
  if (typeof value.instruction !== 'string' || !value.instruction.trim() || value.instruction.length > 1000) issue('instruction', 'A source-supplied instruction of 1–1000 characters is required.')
  if (value.arabicInstruction !== null && (typeof value.arabicInstruction !== 'string' || !value.arabicInstruction.trim() || value.arabicInstruction.length > 1000)) issue('arabicInstruction', 'A supplied Arabic instruction must contain 1–1000 characters.')
  if (typeof value.passage !== 'string' || !value.passage.trim() || value.passage.length > 5000) issue('passage', 'A passage of 1–5000 characters is required.')
  if (!Array.isArray(value.children) || value.children.length < 1 || value.children.length > 100) {
    issue('children', 'A passage needs 1–100 ordered scorable children.')
    return { success: false, issues }
  }
  if (!Number.isSafeInteger(value.attemptCount) || (value.attemptCount as number) < 1 || (value.attemptCount as number) > value.children.length) issue('attemptCount', 'Attempt count must fit the displayed children.')
  if (value.expectedMarks !== null && (!Number.isSafeInteger(value.expectedMarks) || (value.expectedMarks as number) < 1 || (value.expectedMarks as number) > 1000)) issue('expectedMarks', 'Historical expected marks must be between 1 and 1000.')

  const ids = new Set<string>()
  const marks: number[] = []
  value.children.forEach((child, index) => {
    const path = `children[${index}]`
    if (!record(child) || !record(child.question)) {
      issue(path, 'An ordered question is required.')
      return
    }
    if (child.position !== index + 1) issue(`${path}.position`, 'Child positions must match their saved order without gaps.')
    const question = child.question
    const result = validateDomainQuestion(question)
    if (!result.success) for (const problem of result.issues) issue(`${path}.question.${problem.path}`, problem.message)
    if (typeof question.id !== 'string' || !isUuid(question.id) || ids.has(question.id)) issue(`${path}.question.id`, 'Child identities must be valid and unique.')
    if (typeof question.id === 'string') ids.add(question.id)
    if (question.ownerId !== value.ownerId || question.bankId !== value.bankId) issue(path, 'Every child must belong to the passage owner and bank.')
    if (question.isActive !== true) issue(path, 'Withdrawn questions cannot enter a new passage.')
    if (question.type === 'matching') issue(path, 'Matching children require the Phase 10B contract.')
    if (typeof question.marks === 'number') marks.push(question.marks)
  })
  if (!options.examOwnedMarks && value.expectedMarks !== null && marks.length !== value.children.length) {
    issue('expectedMarks', 'Historical passage marks need marked children.')
  }
  if (!options.examOwnedMarks && value.expectedMarks !== null && marks.length === value.children.length && Number.isSafeInteger(value.attemptCount)) {
    if ((value.attemptCount as number) < marks.length && marks.some((mark) => mark !== marks[0])) issue('children', 'Optional children must have equal marks.')
    const total = (value.attemptCount as number) < marks.length
      ? marks[0] * (value.attemptCount as number)
      : marks.reduce((sum, mark) => sum + mark, 0)
    if (value.expectedMarks !== total) issue('expectedMarks', 'Passage marks must equal the attempt-aware child marks.')
  }
  return issues.length ? { success: false, issues } : { success: true }
}
