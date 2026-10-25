import type { Json, Tables, TablesInsert } from '../types/database'
import type { ExamQuestion, QuestionOption } from '../types/question'

export const QUESTION_SCHEMA_VERSION = 1 as const
export const MANUAL_MARKING_NOTE =
  'Manual marking — no approved model provided' as const

export type QuestionType =
  | 'multiple-choice'
  | 'binary'
  | 'short-answer'
  | 'completion'
  | 'odd-word'
  | 'matching'
  | 'word-relationship'
  | 'rewrite'
  | 'extended-writing'

export type QuestionDifficulty = 'easy' | 'medium' | 'hard'

type Envelope<T extends QuestionType> = {
  type: T
  schemaVersion: typeof QUESTION_SCHEMA_VERSION
}

export type MultipleChoiceContent = Envelope<'multiple-choice'> & {
  options: QuestionOption[]
}

export type MultipleChoiceAnswer = Envelope<'multiple-choice'> & {
  correctOptionLabel: string
}

export type BinaryContent = Envelope<'binary'> & {
  labelMode: 'true-false' | 'yes-no'
}

export type BinaryAnswer = Envelope<'binary'> & {
  isTrue: boolean
}

export type ShortAnswerContent = Envelope<'short-answer'> & {
  answerLines?: number
}

export type ShortAnswerAnswer = Envelope<'short-answer'> & {
  canonicalAnswer: string
  approvedVariants?: string[]
  caseSensitive?: boolean
}

export type CompletionContent = Envelope<'completion'> & {
  text: string
  blankIds: string[]
  wordBank: string[]
  wordBankOrder: 'ordered' | 'unordered'
  allowWordReuse: boolean
  requireAllWordsUsed: boolean
}

export type CompletionAnswer = Envelope<'completion'> & {
  answers: Record<string, string>
}

export type OddWordContent = Envelope<'odd-word'> & {
  words: string[]
}

export type OddWordAnswer = Envelope<'odd-word'> & {
  oddWord: string
}

export type MatchingItem = {
  id: string
  text: string
}

export type MatchingContent = Envelope<'matching'> & {
  left: MatchingItem[]
  right: MatchingItem[]
}

export type MatchingAnswer = Envelope<'matching'> & {
  pairs: Array<{ leftId: string; rightId: string }>
}

export type WordRelationshipContent =
  Envelope<'word-relationship'> & {
    words: [string, string]
  }

export type WordRelationshipAnswer = Envelope<'word-relationship'> & {
  acceptedAnswers: string[]
}

export type RewriteContent = Envelope<'rewrite'> & {
  instruction: string
}

export type RewriteAnswer = Envelope<'rewrite'> & {
  acceptedAnswers: string[]
}

export type ExtendedWritingContent = Envelope<'extended-writing'> & {
  minimumWords?: number
  maximumWords?: number
}

export type ExtendedWritingAnswer = Envelope<'extended-writing'> & {
  rubricCriteria?: string[]
  modelAnswer?: string
  manualMarkingNote?: typeof MANUAL_MARKING_NOTE
}

export type QuestionContentByType = {
  'multiple-choice': MultipleChoiceContent
  binary: BinaryContent
  'short-answer': ShortAnswerContent
  completion: CompletionContent
  'odd-word': OddWordContent
  matching: MatchingContent
  'word-relationship': WordRelationshipContent
  rewrite: RewriteContent
  'extended-writing': ExtendedWritingContent
}

export type QuestionAnswerByType = {
  'multiple-choice': MultipleChoiceAnswer
  binary: BinaryAnswer
  'short-answer': ShortAnswerAnswer
  completion: CompletionAnswer
  'odd-word': OddWordAnswer
  matching: MatchingAnswer
  'word-relationship': WordRelationshipAnswer
  rewrite: RewriteAnswer
  'extended-writing': ExtendedWritingAnswer
}

type DomainQuestionBase = {
  id: string
  ownerId: string
  bankId: string
  externalId: string
  unit: number
  lesson: string
  difficulty: QuestionDifficulty
  prompt: string
  marks: number | null
  isActive: boolean
  revision: number
}

export type DomainQuestion = {
  [T in QuestionType]: DomainQuestionBase & {
    type: T
    schemaVersion: typeof QUESTION_SCHEMA_VERSION
    content: QuestionContentByType[T]
    answer: QuestionAnswerByType[T]
  }
}[QuestionType]

export type QuestionRevision = DomainQuestion & {
  revisionId: string
  capturedAt: string
}

export type QuestionEditorDraft = {
  [T in QuestionType]: Omit<
    DomainQuestionBase,
    'id' | 'ownerId' | 'revision'
  > & {
    type: T
    schemaVersion: typeof QUESTION_SCHEMA_VERSION
    content: QuestionContentByType[T]
    answer: QuestionAnswerByType[T]
  }
}[QuestionType]

export type QuestionSelectionInput = Pick<
  DomainQuestion,
  | 'id'
  | 'unit'
  | 'lesson'
  | 'type'
  | 'difficulty'
  | 'marks'
  | 'isActive'
>

export type QuestionRendererInput = Pick<
  DomainQuestion,
  | 'id'
  | 'type'
  | 'schemaVersion'
  | 'prompt'
  | 'marks'
  | 'content'
  | 'answer'
>

export type QuestionPersistenceRow = Tables<'questions'>

export type QuestionGroupType =
  | 'passage'
  | 'main-question'
  | 'branch'
  | 'alternative-choice'

export type QuestionGroup = {
  id: string
  ownerId: string
  type: QuestionGroupType
  schemaVersion: typeof QUESTION_SCHEMA_VERSION
  parentGroupId: string | null
  position: number | null
  label: string | null
  expectedMarks: number | null
}

export type QuestionGroupMember = {
  groupId: string
  questionId: string
  ownerId: string
  position: number
}

export type ExamSnapshotQuestion = {
  questionId: string
  questionRevisionId: string
  revision: number
  position: number
  marks: number
  sourceGroupId: string | null
}

export type ExamSnapshot = {
  id: string
  ownerId: string
  schemaVersion: typeof QUESTION_SCHEMA_VERSION
  selectionSeed: number
  totalMarks: number
  questions: ExamSnapshotQuestion[]
  attemptGroups?: { id: string; questionIds: string[]; attemptCount: number }[]
}

export type DomainValidationIssue = {
  path: string
  message: string
}

export type DomainValidationResult =
  | { success: true }
  | { success: false; issues: DomainValidationIssue[] }

const QUESTION_TYPES: readonly QuestionType[] = [
  'multiple-choice',
  'binary',
  'short-answer',
  'completion',
  'odd-word',
  'matching',
  'word-relationship',
  'rewrite',
  'extended-writing',
]

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isIntegerBetween(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    Number.isSafeInteger(value) &&
    Number(value) >= minimum &&
    Number(value) <= maximum
  )
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(hasText)
  )
}

function addIssue(
  issues: DomainValidationIssue[],
  path: string,
  message: string,
): void {
  issues.push({ path, message })
}

function validateEnvelope(
  value: unknown,
  type: QuestionType,
  path: string,
  issues: DomainValidationIssue[],
): value is Record<string, unknown> {
  if (!isRecord(value)) {
    addIssue(issues, path, 'Must be an object.')
    return false
  }

  if (value.type !== type) {
    addIssue(issues, `${path}.type`, 'Must match the question type.')
  }

  if (value.schemaVersion !== QUESTION_SCHEMA_VERSION) {
    addIssue(
      issues,
      `${path}.schemaVersion`,
      `Only schema version ${QUESTION_SCHEMA_VERSION} is supported.`,
    )
  }

  return true
}

function validateOptions(
  value: unknown,
  path: string,
  issues: DomainValidationIssue[],
): value is QuestionOption[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 6) {
    addIssue(issues, path, 'Must contain between 2 and 6 options.')
    return false
  }

  const labels = new Set<string>()

  value.forEach((candidate, index) => {
    if (!isRecord(candidate) || !hasText(candidate.label) || !hasText(candidate.text)) {
      addIssue(issues, `${path}[${index}]`, 'Requires a label and text.')
      return
    }

    const label = candidate.label.trim().toUpperCase()
    if (labels.has(label)) {
      addIssue(issues, path, 'Option labels must be unique.')
    }
    labels.add(label)
  })

  return true
}

function validateMatchingItems(
  value: unknown,
  path: string,
  issues: DomainValidationIssue[],
): value is MatchingItem[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 20) {
    addIssue(issues, path, 'Must contain between 2 and 20 matching items.')
    return false
  }

  const ids = new Set<string>()
  value.forEach((candidate, index) => {
    if (!isRecord(candidate) || !hasText(candidate.id) || !hasText(candidate.text) || candidate.id.length > 100 || candidate.text.length > 1000) {
      addIssue(issues, `${path}[${index}]`, 'Requires an id and text.')
      return
    }
    if (ids.has(candidate.id)) {
      addIssue(issues, path, 'Matching item ids must be unique.')
    }
    ids.add(candidate.id)
  })
  return true
}

function validatePayload(
  type: QuestionType,
  contentValue: unknown,
  answerValue: unknown,
  issues: DomainValidationIssue[],
): void {
  const contentValid = validateEnvelope(contentValue, type, 'content', issues)
  const answerValid = validateEnvelope(answerValue, type, 'answer', issues)

  if (!contentValid || !answerValid) {
    return
  }

  const content = contentValue
  const answer = answerValue

  switch (type) {
    case 'multiple-choice': {
      const optionsValid = validateOptions(content.options, 'content.options', issues)
      if (!hasText(answer.correctOptionLabel)) {
        addIssue(issues, 'answer.correctOptionLabel', 'A correct option is required.')
      } else if (
        optionsValid &&
        !(content.options as QuestionOption[]).some(
          (option) =>
            option.label.trim().toUpperCase() ===
            String(answer.correctOptionLabel).trim().toUpperCase(),
        )
      ) {
        addIssue(
          issues,
          'answer.correctOptionLabel',
          'Must identify one of the supplied options.',
        )
      }
      break
    }
    case 'binary':
      if (
        content.labelMode !== 'true-false' &&
        content.labelMode !== 'yes-no'
      ) {
        addIssue(
          issues,
          'content.labelMode',
          'Select either True/False or Yes/No labels.',
        )
      }
      if (typeof answer.isTrue !== 'boolean') {
        addIssue(issues, 'answer.isTrue', 'Must be true or false.')
      }
      break
    case 'short-answer': {
      if (!hasText(answer.canonicalAnswer)) {
        addIssue(
          issues,
          'answer.canonicalAnswer',
          'A canonical reference answer is required.',
        )
      }
      if (
        answer.approvedVariants !== undefined &&
        (!Array.isArray(answer.approvedVariants) ||
          !answer.approvedVariants.every(hasText))
      ) {
        addIssue(
          issues,
          'answer.approvedVariants',
          'Approved variants must contain non-empty text.',
        )
      } else if (
        hasText(answer.canonicalAnswer) &&
        Array.isArray(answer.approvedVariants)
      ) {
        const normalizedCanonical = answer.canonicalAnswer
          .trim()
          .toLocaleLowerCase()
        const normalizedVariants = answer.approvedVariants.map(
          (variant) => String(variant).trim().toLocaleLowerCase(),
        )

        if (
          new Set(normalizedVariants).size !== normalizedVariants.length ||
          normalizedVariants.includes(normalizedCanonical)
        ) {
          addIssue(
            issues,
            'answer.approvedVariants',
            'Variants must be unique and distinct from the canonical answer.',
          )
        }
      }
      if (
        content.answerLines !== undefined &&
        !isIntegerBetween(content.answerLines, 1, 20)
      ) {
        addIssue(issues, 'content.answerLines', 'Must be between 1 and 20.')
      }
      break
    }
    case 'completion': {
      if (!hasText(content.text)) {
        addIssue(issues, 'content.text', 'Completion text is required.')
      }
      if (!isNonEmptyStringArray(content.blankIds)) {
        addIssue(issues, 'content.blankIds', 'At least one blank id is required.')
      }
      if (!isNonEmptyStringArray(content.wordBank)) {
        addIssue(issues, 'content.wordBank', 'A non-empty word bank is required.')
      }
      if (
        content.wordBankOrder !== 'ordered' &&
        content.wordBankOrder !== 'unordered'
      ) {
        addIssue(
          issues,
          'content.wordBankOrder',
          'Word-bank order must be explicit.',
        )
      }
      if (typeof content.allowWordReuse !== 'boolean') {
        addIssue(
          issues,
          'content.allowWordReuse',
          'Word-reuse policy must be explicit.',
        )
      }
      if (typeof content.requireAllWordsUsed !== 'boolean') {
        addIssue(
          issues,
          'content.requireAllWordsUsed',
          'Unused-word policy must be explicit.',
        )
      }
      const answers = answer.answers
      if (!isRecord(answers)) {
        addIssue(issues, 'answer.answers', 'Answers must be keyed by blank id.')
      } else if (
        Array.isArray(content.blankIds) &&
        Array.isArray(content.wordBank)
      ) {
        const blankIds = content.blankIds.filter(hasText)
        const answerIds = Object.keys(answers)
        const wordBank = content.wordBank.filter(hasText)
        const normalizedBank = wordBank.map((word) =>
          word.trim().toLocaleLowerCase(),
        )
        const answerWords = blankIds.map((id) => answers[id])
        const normalizedAnswers = answerWords
          .filter(hasText)
          .map((word) => word.trim().toLocaleLowerCase())

        if (
          new Set(blankIds).size !== blankIds.length ||
          new Set(normalizedBank).size !== normalizedBank.length ||
          blankIds.some((id) => !hasText(answers[id])) ||
          answerIds.some((id) => !blankIds.includes(id))
        ) {
          addIssue(
            issues,
            'answer.answers',
            'Every unique blank requires one answer and no unknown blank may be present.',
          )
        }
        if (
          normalizedAnswers.some(
            (word) => !normalizedBank.includes(word),
          )
        ) {
          addIssue(
            issues,
            'answer.answers',
            'Every completion answer must come from the word bank.',
          )
        }
        if (
          content.allowWordReuse === false &&
          new Set(normalizedAnswers).size !== normalizedAnswers.length
        ) {
          addIssue(
            issues,
            'answer.answers',
            'A word-bank entry cannot be reused unless reuse is enabled.',
          )
        }
        if (
          content.requireAllWordsUsed === true &&
          normalizedBank.some(
            (word) => !normalizedAnswers.includes(word),
          )
        ) {
          addIssue(
            issues,
            'answer.answers',
            'Every word-bank entry must be used by this completion.',
          )
        }
      }
      break
    }
    case 'odd-word':
      if (!Array.isArray(content.words) || content.words.length < 3 || !content.words.every(hasText)) {
        addIssue(issues, 'content.words', 'At least three words are required.')
      }
      if (!hasText(answer.oddWord) || !Array.isArray(content.words) || !content.words.includes(answer.oddWord)) {
        addIssue(issues, 'answer.oddWord', 'Must identify a supplied word.')
      }
      break
    case 'matching': {
      const leftValid = validateMatchingItems(content.left, 'content.left', issues)
      const rightValid = validateMatchingItems(content.right, 'content.right', issues)
      if (
        leftValid &&
        rightValid &&
        (content.left as MatchingItem[]).length !==
          (content.right as MatchingItem[]).length
      ) {
        addIssue(
          issues,
          'content.right',
          'List A and List B must contain the same number of items.',
        )
      }
      if (!Array.isArray(answer.pairs) || answer.pairs.length < 2) {
        addIssue(issues, 'answer.pairs', 'At least two pairs are required.')
      } else if (leftValid && rightValid) {
        const leftIds = new Set((content.left as MatchingItem[]).map((item) => item.id))
        const rightIds = new Set((content.right as MatchingItem[]).map((item) => item.id))
        const usedLeft = new Set<string>()
        const usedRight = new Set<string>()
        const invalidPair = answer.pairs.some((pair) => {
          if (!isRecord(pair) || !hasText(pair.leftId) || !hasText(pair.rightId)) {
            return true
          }
          const duplicate =
            usedLeft.has(pair.leftId) || usedRight.has(pair.rightId)
          usedLeft.add(pair.leftId)
          usedRight.add(pair.rightId)
          return (
            duplicate ||
            !leftIds.has(pair.leftId) ||
            !rightIds.has(pair.rightId)
          )
        })
        if (
          invalidPair ||
          answer.pairs.length !== leftIds.size ||
          usedLeft.size !== leftIds.size ||
          usedRight.size !== rightIds.size
        ) {
          addIssue(
            issues,
            'answer.pairs',
            'Matching requires one unique pair for every List A and List B item.',
          )
        }
      }
      break
    }
    case 'word-relationship':
      if (
        !Array.isArray(content.words) ||
        content.words.length !== 2 ||
        !content.words.every(hasText)
      ) {
        addIssue(issues, 'content.words', 'Exactly two words are required.')
      }
      if (!isNonEmptyStringArray(answer.acceptedAnswers)) {
        addIssue(issues, 'answer.acceptedAnswers', 'At least one relationship is required.')
      }
      break
    case 'rewrite':
      if (!hasText(content.instruction)) {
        addIssue(issues, 'content.instruction', 'A rewrite instruction is required.')
      }
      if (!isNonEmptyStringArray(answer.acceptedAnswers)) {
        addIssue(issues, 'answer.acceptedAnswers', 'At least one rewrite is required.')
      }
      break
    case 'extended-writing': {
      const hasModel = hasText(answer.modelAnswer)
      const hasRubric = isNonEmptyStringArray(answer.rubricCriteria)
      const hasManualNote =
        answer.manualMarkingNote === MANUAL_MARKING_NOTE

      if (
        answer.modelAnswer !== undefined &&
        !hasModel
      ) {
        addIssue(
          issues,
          'answer.modelAnswer',
          'An approved model answer cannot be blank.',
        )
      }
      if (
        answer.rubricCriteria !== undefined &&
        !hasRubric
      ) {
        addIssue(
          issues,
          'answer.rubricCriteria',
          'An approved rubric must contain at least one criterion.',
        )
      }
      if (
        answer.manualMarkingNote !== undefined &&
        !hasManualNote
      ) {
        addIssue(
          issues,
          'answer.manualMarkingNote',
          'Manual-only writing must use the approved answer-key note.',
        )
      }
      if ((hasModel || hasRubric) === hasManualNote) {
        addIssue(
          issues,
          'answer',
          'Provide an approved model or rubric, or explicitly mark the item manual-only.',
        )
      }
      if (
        content.minimumWords !== undefined &&
        !isIntegerBetween(content.minimumWords, 1, 1000)
      ) {
        addIssue(issues, 'content.minimumWords', 'Must be between 1 and 1000.')
      }
      if (
        content.maximumWords !== undefined &&
        !isIntegerBetween(content.maximumWords, 1, 2000)
      ) {
        addIssue(issues, 'content.maximumWords', 'Must be between 1 and 2000.')
      }
      if (
        typeof content.minimumWords === 'number' &&
        typeof content.maximumWords === 'number' &&
        content.minimumWords > content.maximumWords
      ) {
        addIssue(issues, 'content.maximumWords', 'Must not be below the minimum.')
      }
      break
    }
  }
}

export function validateDomainQuestion(
  value: unknown,
): DomainValidationResult {
  const issues: DomainValidationIssue[] = []

  if (!isRecord(value)) {
    return { success: false, issues: [{ path: '', message: 'Question must be an object.' }] }
  }

  if (!hasText(value.id)) addIssue(issues, 'id', 'A stable id is required.')
  if (!hasText(value.ownerId)) addIssue(issues, 'ownerId', 'An owner is required.')
  if (!hasText(value.bankId)) addIssue(issues, 'bankId', 'A bank is required.')
  if (!hasText(value.externalId)) addIssue(issues, 'externalId', 'An external id is required.')
  if (!isIntegerBetween(value.unit, 1, 8)) addIssue(issues, 'unit', 'Must be between 1 and 8.')
  if (!hasText(value.lesson)) addIssue(issues, 'lesson', 'A lesson is required.')
  if (!['easy', 'medium', 'hard'].includes(String(value.difficulty))) addIssue(issues, 'difficulty', 'Difficulty is invalid.')
  if (!hasText(value.prompt)) addIssue(issues, 'prompt', 'A prompt is required.')
  if (value.marks !== null && !isIntegerBetween(value.marks, 1, 100)) addIssue(issues, 'marks', 'Must be between 1 and 100 when present for historical questions.')
  if (typeof value.isActive !== 'boolean') addIssue(issues, 'isActive', 'Status must be boolean.')
  if (!isIntegerBetween(value.revision, 1, Number.MAX_SAFE_INTEGER)) addIssue(issues, 'revision', 'Must be positive.')

  if (!QUESTION_TYPES.includes(value.type as QuestionType)) {
    addIssue(issues, 'type', 'Question type is unsupported.')
  } else {
    if (value.schemaVersion !== QUESTION_SCHEMA_VERSION) {
      addIssue(issues, 'schemaVersion', `Only schema version ${QUESTION_SCHEMA_VERSION} is supported.`)
    }
    validatePayload(value.type as QuestionType, value.content, value.answer, issues)
  }

  return issues.length === 0 ? { success: true } : { success: false, issues }
}

export function assertDomainQuestion(
  value: unknown,
): asserts value is DomainQuestion {
  const result = validateDomainQuestion(value)
  if (!result.success) {
    const first = result.issues[0]
    throw new Error(`Invalid question domain data at ${first.path || 'root'}: ${first.message}`)
  }
}

export function validateQuestionGraph(
  groups: readonly QuestionGroup[],
  members: readonly QuestionGroupMember[],
  questions: readonly DomainQuestion[],
): DomainValidationResult {
  const issues: DomainValidationIssue[] = []
  const groupById = new Map(groups.map((group) => [group.id, group]))
  const questionById = new Map(questions.map((question) => [question.id, question]))
  const siblingPositions = new Set<string>()
  const memberPositions = new Set<string>()
  const memberships = new Set<string>()

  if (groupById.size !== groups.length) addIssue(issues, 'groups', 'Group ids must be unique.')
  if (questionById.size !== questions.length) addIssue(issues, 'questions', 'Question ids must be unique.')

  groups.forEach((group, index) => {
    if (group.schemaVersion !== QUESTION_SCHEMA_VERSION) addIssue(issues, `groups[${index}].schemaVersion`, 'Group schema version is unsupported.')
    if (group.parentGroupId === null && group.position !== null) addIssue(issues, `groups[${index}].position`, 'A root group cannot have a sibling position.')
    if (group.parentGroupId !== null) {
      const parent = groupById.get(group.parentGroupId)
      if (!parent) addIssue(issues, `groups[${index}].parentGroupId`, 'Parent group does not exist.')
      else if (parent.ownerId !== group.ownerId) addIssue(issues, `groups[${index}].ownerId`, 'Parent and child owners must match.')
      if (!isIntegerBetween(group.position, 1, 100)) addIssue(issues, `groups[${index}].position`, 'Nested groups require a position.')
      const key = `${group.parentGroupId}:${group.position}`
      if (siblingPositions.has(key)) addIssue(issues, `groups[${index}].position`, 'Sibling positions must be unique.')
      siblingPositions.add(key)
    }

    const visited = new Set<string>([group.id])
    let parentId = group.parentGroupId
    while (parentId !== null) {
      if (visited.has(parentId)) {
        addIssue(issues, `groups[${index}].parentGroupId`, 'Group relationships cannot contain a cycle.')
        break
      }
      visited.add(parentId)
      parentId = groupById.get(parentId)?.parentGroupId ?? null
    }
  })

  members.forEach((member, index) => {
    const group = groupById.get(member.groupId)
    const question = questionById.get(member.questionId)
    if (!group) addIssue(issues, `members[${index}].groupId`, 'Group does not exist.')
    if (!question) addIssue(issues, `members[${index}].questionId`, 'Question does not exist.')
    if ((group && group.ownerId !== member.ownerId) || (question && question.ownerId !== member.ownerId)) addIssue(issues, `members[${index}].ownerId`, 'Group, question, and member owners must match.')
    if (!isIntegerBetween(member.position, 1, 100)) addIssue(issues, `members[${index}].position`, 'Position must be between 1 and 100.')
    const membership = `${member.groupId}:${member.questionId}`
    const position = `${member.groupId}:${member.position}`
    if (memberships.has(membership)) addIssue(issues, `members[${index}]`, 'A question cannot be repeated in one group.')
    if (memberPositions.has(position)) addIssue(issues, `members[${index}].position`, 'Question positions must be unique within a group.')
    memberships.add(membership)
    memberPositions.add(position)
  })

  return issues.length === 0 ? { success: true } : { success: false, issues }
}

export function validateExamSnapshot(
  snapshot: ExamSnapshot,
): DomainValidationResult {
  const issues: DomainValidationIssue[] = []
  if (snapshot.schemaVersion !== QUESTION_SCHEMA_VERSION) addIssue(issues, 'schemaVersion', 'Snapshot schema version is unsupported.')
  if (!Number.isSafeInteger(snapshot.selectionSeed) || snapshot.selectionSeed < 0 || snapshot.selectionSeed > 4_294_967_295) addIssue(issues, 'selectionSeed', 'Selection seed is outside the supported range.')
  if (snapshot.questions.length < 1) addIssue(issues, 'questions', 'A snapshot must contain at least one question.')

  const positions = new Set<number>()
  const revisions = new Set<string>()
  const canonicalIds = new Set<string>()
  snapshot.questions.forEach((question, index) => {
    if (!isIntegerBetween(question.position, 1, 200)) addIssue(issues, `questions[${index}].position`, 'Position must be between 1 and 200.')
    if (!isIntegerBetween(question.revision, 1, Number.MAX_SAFE_INTEGER)) addIssue(issues, `questions[${index}].revision`, 'Revision must be positive.')
    if (!isIntegerBetween(question.marks, 1, 100)) addIssue(issues, `questions[${index}].marks`, 'Marks must be between 1 and 100.')
    if (positions.has(question.position)) addIssue(issues, `questions[${index}].position`, 'Snapshot positions must be unique.')
    if (revisions.has(question.questionRevisionId)) addIssue(issues, `questions[${index}].questionRevisionId`, 'A revision cannot appear twice.')
    if (canonicalIds.has(question.questionId)) addIssue(issues, `questions[${index}].questionId`, 'A canonical question cannot appear twice, including different revisions.')
    canonicalIds.add(question.questionId)
    positions.add(question.position)
    revisions.add(question.questionRevisionId)
  })

  let calculatedMarks = snapshot.questions.reduce((total, question) => total + question.marks, 0)
  if (snapshot.attemptGroups !== undefined) {
    const groupedIds = new Set<string>()
    const groupIds = new Set<string>()
    const byId = new Map(snapshot.questions.map((question) => [question.questionId, question]))
    calculatedMarks = 0
    snapshot.attemptGroups.forEach((group, index) => {
      const path = `attemptGroups[${index}]`
      if (!group.id.trim() || groupIds.has(group.id)) addIssue(issues, path, 'Attempt groups require unique identities.')
      groupIds.add(group.id)
      if (!isIntegerBetween(group.attemptCount, 1, group.questionIds.length)) addIssue(issues, path, 'Attempt count must fit the offered group.')
      const marks = group.questionIds.map((id) => {
        if (!byId.has(id) || groupedIds.has(id)) addIssue(issues, path, 'Each captured question must belong to exactly one attempt group.')
        groupedIds.add(id)
        return byId.get(id)?.marks ?? 0
      })
      if (marks.some((mark) => mark !== marks[0])) addIssue(issues, path, 'Alternatives in an attempt group must carry equal marks.')
      calculatedMarks += (marks[0] ?? 0) * group.attemptCount
    })
    if (groupedIds.size !== canonicalIds.size) addIssue(issues, 'attemptGroups', 'Attempt groups must cover every captured question exactly once.')
  }
  if (snapshot.totalMarks !== calculatedMarks) addIssue(issues, 'totalMarks', 'Must equal the attempt-aware marks of the captured revisions.')

  return issues.length === 0 ? { success: true } : { success: false, issues }
}

function jsonValue(value: unknown): Json {
  return value as Json
}

export function questionRowToDomain(
  row: QuestionPersistenceRow,
): DomainQuestion {
  const candidate = {
    id: row.id,
    ownerId: row.owner_id,
    bankId: row.bank_id,
    externalId: row.external_id,
    unit: row.unit,
    lesson: row.lesson,
    type: row.question_type,
    schemaVersion: row.schema_version,
    difficulty: row.difficulty,
    prompt: row.prompt,
    marks: row.marks,
    content: row.content,
    answer: row.answer,
    isActive: row.is_active,
    revision: row.current_revision,
  }

  assertDomainQuestion(candidate)
  return candidate
}

export function domainQuestionToPersistenceInsert(
  question: DomainQuestion,
): TablesInsert<'questions'> {
  assertDomainQuestion(question)
  const multipleChoice = question.type === 'multiple-choice' ? question : null

  return {
    id: question.id,
    bank_id: question.bankId,
    owner_id: question.ownerId,
    external_id: question.externalId,
    unit: question.unit,
    lesson: question.lesson,
    question_type: question.type,
    schema_version: question.schemaVersion,
    difficulty: question.difficulty,
    prompt: question.prompt,
    marks: question.marks,
    content: jsonValue(question.content),
    answer: jsonValue(question.answer),
    options: multipleChoice ? jsonValue(multipleChoice.content.options) : null,
    correct_option_label: multipleChoice?.answer.correctOptionLabel ?? null,
    is_active: question.isActive,
  }
}

export function domainQuestionToSelectionInput(
  question: DomainQuestion,
): QuestionSelectionInput {
  return {
    id: question.id,
    unit: question.unit,
    lesson: question.lesson,
    type: question.type,
    difficulty: question.difficulty,
    marks: question.marks,
    isActive: question.isActive,
  }
}

export function domainQuestionToRendererInput(
  question: DomainQuestion,
): QuestionRendererInput {
  if (question.marks === null) throw new Error('Exam marks must be assigned before rendering.')
  return {
    id: question.id,
    type: question.type,
    schemaVersion: question.schemaVersion,
    prompt: question.prompt,
    marks: question.marks,
    content: question.content,
    answer: question.answer,
  }
}

export function domainQuestionToLegacyExamQuestion(
  question: DomainQuestion,
): ExamQuestion {
  if (question.marks === null) throw new Error('Exam marks must be assigned before rendering.')
  if (question.type !== 'multiple-choice') {
    throw new Error('The legacy renderer only supports multiple-choice questions.')
  }

  const correctAnswer = question.content.options.find(
    (option) =>
      option.label.trim().toUpperCase() ===
      question.answer.correctOptionLabel.trim().toUpperCase(),
  )

  if (!correctAnswer) {
    throw new Error('This question does not have a valid correct answer.')
  }

  return {
    id: question.id,
    unit: question.unit,
    lesson: question.lesson,
    type: 'multiple-choice',
    difficulty: question.difficulty,
    prompt: question.prompt,
    marks: question.marks,
    options: question.content.options,
    correctAnswer,
  }
}

export function createLegacyMultipleChoicePayload(
  options: QuestionOption[],
  correctOptionLabel: string,
): Pick<
  TablesInsert<'questions'>,
  'schema_version' | 'content' | 'answer'
> {
  return {
    schema_version: QUESTION_SCHEMA_VERSION,
    content: jsonValue({
      type: 'multiple-choice',
      schemaVersion: QUESTION_SCHEMA_VERSION,
      options,
    }),
    answer: jsonValue({
      type: 'multiple-choice',
      schemaVersion: QUESTION_SCHEMA_VERSION,
      correctOptionLabel,
    }),
  }
}

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value)
}
