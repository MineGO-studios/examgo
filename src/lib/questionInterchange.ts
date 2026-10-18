import { LEGACY_CSV_HEADERS, parseCsvRecords, parseQuestionCsv } from './questionCsv'
import type { QuestionType } from '../domain/questionDomain'

export const QUESTION_INTERCHANGE_FORMAT = 'examgo-question-interchange' as const
export const QUESTION_INTERCHANGE_VERSION = 1 as const
const MAX_BYTES = 32 * 1024 * 1024
const MAX_ROWS = 10_000
const MAX_CELL = 100_000
const TYPES = new Set<QuestionType>([
  'multiple-choice', 'binary', 'short-answer', 'completion', 'odd-word',
  'matching', 'word-relationship', 'rewrite', 'extended-writing',
])

export interface StagedInterchangeQuestion {
  catalogueId: string
  type: QuestionType
  prompt: string
  unitTags: number[]
  displayUnit: number
  lesson: string | null
  difficulty: 'easy' | 'medium' | 'hard'
  difficultyProvisional: boolean
  selectionMarks: number | null
  content: unknown
  answer: unknown
  groupIds: string[]
  groupCompleteness: string | null
  sourceFields: Record<string, string>
  issues: string[]
}

export interface QuestionInterchangeV1 {
  format: typeof QUESTION_INTERCHANGE_FORMAT
  version: typeof QUESTION_INTERCHANGE_VERSION
  sourceNamespace: string
  questions: StagedInterchangeQuestion[]
}

export interface TeacherCsvMapping {
  externalId: string
  unit: string
  prompt: string
  questionType: string
  lesson?: string
  difficulty?: string
  marks?: string
  answer?: string
  correctOptionLabel?: string
  groupContext?: string
  structuredContent?: string
  structuredAnswer?: string
  optionA?: string
  optionB?: string
  optionC?: string
  optionD?: string
  optionE?: string
  optionF?: string
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function checkSize(text: string): void {
  if (new TextEncoder().encode(text).byteLength > MAX_BYTES) {
    throw new Error('Import exceeds the 32 MiB supported file limit.')
  }
}

function parseRows(text: string): { headers: string[]; rows: Record<string, string>[] } {
  checkSize(text)
  const records = parseCsvRecords(text.replace(/^\uFEFF/, ''))
  if (records.length < 2 || records.length > MAX_ROWS + 1) {
    throw new Error('CSV needs a header and between one and 10,000 rows.')
  }
  const headers = records[0].map((value) => value.trim())
  if (headers.some((header) => !header) || new Set(headers.map((value) => value.toLowerCase())).size !== headers.length) {
    throw new Error('CSV headers must be present and unique.')
  }
  const rows = records.slice(1).map((record, index) => {
    if (record.length !== headers.length || record.some((cell) => cell.length > MAX_CELL)) {
      throw new Error(`CSV row ${index + 2} has an invalid column count or a cell above 100,000 characters.`)
    }
    return Object.fromEntries(headers.map((header, column) => [header, record[column]]))
  })
  return { headers, rows }
}

export function inspectCsvHeaders(text: string): string[] {
  return parseRows(text).headers
}

function parseUnitTags(value: unknown): number[] {
  const tags = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : []
  const parsed = tags.map((tag) => typeof tag === 'number' ? tag : Number(String(tag).trim()))
  if (parsed.length === 0 || parsed.length > 8 ||
    parsed.some((tag) => !Number.isSafeInteger(tag) || tag < 1 || tag > 8) ||
    new Set(parsed).size !== parsed.length) {
    throw new Error('Unit tags must be distinct whole numbers from 1 to 8.')
  }
  return parsed
}

function parseJsonField(value: string, label: string): unknown {
  if (!value) return null
  try { return JSON.parse(value) } catch { throw new Error(`${label} contains invalid JSON.`) }
}

function groupIds(context: unknown): string[] {
  if (context === null) return []
  if (!Array.isArray(context) || context.some((group) => !object(group))) {
    throw new Error('Group context must be an array of objects.')
  }
  return [...new Set(context.flatMap((group) =>
    typeof group.group_id === 'string' && group.group_id ? [group.group_id] : []))]
}

function parseGroupIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((id) => typeof id !== 'string' || id.length < 1 || id.length > 100)) {
    throw new Error('Group IDs must be non-empty strings of at most 100 characters.')
  }
  return [...new Set(value as string[])]
}

function parseType(value: unknown): QuestionType {
  if (typeof value !== 'string' || !TYPES.has(value as QuestionType)) {
    throw new Error(`Unsupported question type: ${String(value)}.`)
  }
  return value as QuestionType
}

function normalizeQuestion(value: {
  id: string; type: unknown; prompt: string; units: unknown; lesson?: string;
  difficulty?: string; difficultyProvisional?: boolean;
  marks?: unknown; content?: unknown; answer?: unknown;
  groupContext?: unknown; groupIds?: unknown; groupCompleteness?: string;
  sourceFields: Record<string, string>;
}): StagedInterchangeQuestion {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(value.id)) throw new Error('Question ID is missing or invalid.')
  if (value.prompt.length > 2000 || (!value.prompt.trim() && value.type !== 'matching')) {
    throw new Error(`${value.id}: prompt is missing or too long.`)
  }
  let unitTags: number[]
  try { unitTags = parseUnitTags(value.units) }
  catch (error) { throw new Error(`${value.id}: unit tags: ${error instanceof Error ? error.message : 'Invalid unit tags.'}`) }
  let type: QuestionType
  try { type = parseType(value.type) }
  catch (error) { throw new Error(`${value.id}: question type: ${error instanceof Error ? error.message : 'Unsupported type.'}`) }
  const difficulty = value.difficulty?.trim().toLowerCase() || 'medium'
  if (!['easy', 'medium', 'hard'].includes(difficulty)) throw new Error(`${value.id}: difficulty is invalid.`)
  // Source marks remain in sourceFields as evidence. Exam marks are teacher-owned.
  const selectionMarks = null
  const issues = [
    ...(!value.prompt.trim() ? ['prompt-missing'] : []),
    ...(!value.lesson?.trim() ? ['lesson-unmapped'] : []),
    ...(value.groupCompleteness && value.groupCompleteness !== 'complete' ? ['group-incomplete'] : []),
    ...(value.answer === null || value.answer === undefined || value.answer === '' ? ['answer-unmapped'] : []),
  ]
  return {
    catalogueId: value.id, type, prompt: value.prompt,
    unitTags, displayUnit: Math.max(...unitTags), lesson: value.lesson?.trim() || null,
    difficulty: difficulty as StagedInterchangeQuestion['difficulty'],
    difficultyProvisional: value.difficultyProvisional ?? !value.difficulty?.trim(), selectionMarks,
    content: value.content ?? null, answer: value.answer ?? null,
    groupIds: value.groupIds === undefined ? groupIds(value.groupContext ?? null)
      : parseGroupIds(value.groupIds),
    groupCompleteness: value.groupCompleteness || null,
    sourceFields: value.sourceFields, issues,
  }
}

function finish(sourceNamespace: string, questions: StagedInterchangeQuestion[]): QuestionInterchangeV1 {
  if (!sourceNamespace.trim() || sourceNamespace.length > 100) throw new Error('Source namespace is missing or too long.')
  const seen = new Set<string>()
  for (const question of questions) {
    const key = question.catalogueId.toLowerCase()
    if (seen.has(key)) throw new Error(`Duplicate question ID: ${question.catalogueId}.`)
    seen.add(key)
  }
  return { format: QUESTION_INTERCHANGE_FORMAT, version: QUESTION_INTERCHANGE_VERSION,
    sourceNamespace, questions }
}

/** Lossless Papers adapter. Source group marks never become selection marks. */
export function parsePapersCatalogueCsv(text: string): QuestionInterchangeV1 {
  const { headers, rows } = parseRows(text)
  const required = ['catalogue_id', 'question_type', 'question_text', 'unit', 'lesson',
    'group_context_json', 'group_completeness', 'structured_content_json',
    'structured_answer_json', 'answer_text', 'source_occurrences_json']
  if (required.some((header) => !headers.includes(header))) throw new Error('Papers catalogue headers are incomplete.')
  return adaptPapersCatalogueRows(rows)
}

/** Reuse the same adapter for original rows staged before normalized mappings existed. */
export function adaptPapersCatalogueRows(rows: readonly Record<string, string>[]): QuestionInterchangeV1 {
  if (rows.length < 1 || rows.length > MAX_ROWS || rows.some((row) =>
    Object.values(row).some((value) => typeof value !== 'string' || value.length > MAX_CELL))) {
    throw new Error('Saved Papers rows exceed the supported count or cell contract.')
  }
  const questions = rows.map((raw) => normalizeQuestion({
    id: raw.catalogue_id, type: raw.question_type, prompt: raw.question_text,
    units: raw.unit, lesson: raw.lesson, marks: null,
    content: parseJsonField(raw.structured_content_json, `${raw.catalogue_id} content`),
    answer: parseJsonField(raw.structured_answer_json, `${raw.catalogue_id} answer`) ?? raw.answer_text,
    groupContext: parseJsonField(raw.group_context_json, `${raw.catalogue_id} groups`),
    groupCompleteness: raw.group_completeness, sourceFields: raw,
  }))
  return finish('Papers/Ready_Question_Bank/master_export', questions)
}

/** Existing MCQ validation remains the authority for the legacy CSV layout. */
export function parseLegacyQuestionCsv(text: string, sourceNamespace: string): QuestionInterchangeV1 {
  const { rows } = parseRows(text)
  const inputs = parseQuestionCsv(text, '00000000-0000-4000-8000-000000000000')
  return finish(sourceNamespace, inputs.map((input, index) => normalizeQuestion({
    id: input.externalId, type: input.questionType, prompt: input.prompt,
    units: [input.unit], lesson: input.lesson, difficulty: input.difficulty,
    difficultyProvisional: false, marks: input.marks,
    content: { type: 'multiple-choice', schemaVersion: 1, options: input.options },
    answer: { type: 'multiple-choice', schemaVersion: 1, correctOptionLabel: input.correctOptionLabel },
    sourceFields: rows[index],
  })))
}

const TEACHER_CSV_ALIASES: Record<keyof TeacherCsvMapping, string[]> = {
    externalId: ['external_id', 'question_id', 'id', 'qid'],
    unit: ['unit', 'units', 'unit_tags'], prompt: ['prompt', 'question', 'question_text'],
    questionType: ['question_type', 'type', 'kind'], lesson: ['lesson', 'lesson_no'],
    difficulty: ['difficulty', 'level'], marks: ['marks', 'points', 'score'],
    answer: ['answer', 'answer_text', 'correct_answer'], correctOptionLabel: ['correct_option_label', 'correct_option'],
    groupContext: ['group_context_json', 'group_json'], structuredContent: ['structured_content_json', 'content_json'],
    structuredAnswer: ['structured_answer_json', 'answer_json'],
    optionA: ['option_a', 'choice_a'], optionB: ['option_b', 'choice_b'],
    optionC: ['option_c', 'choice_c'], optionD: ['option_d', 'choice_d'],
    optionE: ['option_e', 'choice_e'], optionF: ['option_f', 'choice_f'],
}

const candidates = (headers: readonly string[], key: keyof TeacherCsvMapping) =>
  headers.filter((header) => TEACHER_CSV_ALIASES[key].includes(header.trim().toLowerCase()))

export function suggestTeacherCsvMapping(headers: readonly string[]): Partial<TeacherCsvMapping> {
  const result: Partial<TeacherCsvMapping> = {}
  for (const key of Object.keys(TEACHER_CSV_ALIASES) as Array<keyof TeacherCsvMapping>) {
    const matches = candidates(headers, key)
    if (matches.length === 1) result[key] = matches[0]
  }
  return result
}

/** Browser storage is untrusted; accept only known fields and columns in this file. */
function validateTeacherCsvMapping(value: unknown, headers: readonly string[]): Partial<TeacherCsvMapping> {
  if (!object(value) || Object.entries(value).some(([key, column]) =>
    !Object.hasOwn(TEACHER_CSV_ALIASES, key) || column !== undefined && typeof column !== 'string')) {
    throw new Error('Saved column choices are invalid. Choose the columns again for this file.')
  }
  if (Object.values(value).some((column) => column !== undefined && column !== '' && !headers.includes(column as string))) {
    throw new Error('A saved column is missing from this file. Choose the columns again for this file.')
  }
  return value as Partial<TeacherCsvMapping>
}

export function parseStoredTeacherCsvMapping(text: string, headers: readonly string[]): Partial<TeacherCsvMapping> {
  checkSize(text)
  let value: unknown
  try { value = JSON.parse(text) } catch {
    throw new Error('Saved column choices are invalid. Choose the columns again for this file.')
  }
  return validateTeacherCsvMapping(value, headers)
}

export type ImportFileFormat = 'legacy' | 'papers' | 'examgo' | 'teacher'
const PAPERS_HEADERS = ['catalogue_id', 'question_type', 'question_text', 'unit', 'lesson', 'group_context_json',
  'group_completeness', 'structured_content_json', 'structured_answer_json', 'answer_text', 'source_occurrences_json']
const REQUIRED_TEACHER_FIELDS: Array<keyof TeacherCsvMapping> = ['externalId', 'unit', 'prompt', 'questionType']

export interface RecognizedImportFile {
  format: ImportFileFormat
  /** Readable template name shown to the teacher. */
  label: string
  headers: string[]
  /** First data row by header, for readable mapping examples. Empty for JSON. */
  example: Record<string, string>
  /** Fields with more than one plausible column: the teacher must choose. */
  ambiguous: Array<keyof TeacherCsvMapping>
  /** Required fields with no recognised column. */
  missing: Array<keyof TeacherCsvMapping>
}

/**
 * Recognise one of the supported templates from the file itself. Unknown CSV layouts fall back to the
 * mapped teacher CSV, which always requires readable column confirmation; nothing is converted silently.
 */
export function recognizeImportFile(name: string, text: string): RecognizedImportFile {
  const body = text.replace(/^\uFEFF/, '')
  if (/\.json$/i.test(name) || body.trimStart().startsWith('{')) {
    parseExamgoInterchangeJson(body)
    return { format: 'examgo', label: 'ExamGO versioned question file (JSON)', headers: [], example: {}, ambiguous: [], missing: [] }
  }
  const { headers, rows } = parseRows(body)
  const lower = new Set(headers.map((header) => header.toLowerCase()))
  const example = rows[0] ?? {}
  if (PAPERS_HEADERS.every((header) => lower.has(header))) {
    return { format: 'papers', label: 'Papers master catalogue CSV', headers, example, ambiguous: [], missing: [] }
  }
  if (LEGACY_CSV_HEADERS.every((header) => lower.has(header)) && !lower.has('question_type') && !lower.has('type')) {
    return { format: 'legacy', label: 'ExamGO multiple-choice CSV (legacy template)', headers, example, ambiguous: [], missing: [] }
  }
  const keys = Object.keys(TEACHER_CSV_ALIASES) as Array<keyof TeacherCsvMapping>
  return { format: 'teacher', label: 'Other CSV: confirm which column holds each field', headers, example,
    ambiguous: keys.filter((key) => candidates(headers, key).length > 1),
    missing: REQUIRED_TEACHER_FIELDS.filter((key) => candidates(headers, key).length === 0) }
}

/** Caller must show and confirm mapping before invoking this adapter. */
export function parseMappedTeacherCsv(text: string, mapping: TeacherCsvMapping, confirmed: boolean,
  sourceNamespace: string): QuestionInterchangeV1 {
  if (!confirmed) throw new Error('Confirm the column mapping before previewing an import.')
  const { headers, rows } = parseRows(text)
  validateTeacherCsvMapping(mapping, headers)
  for (const key of ['externalId', 'unit', 'prompt', 'questionType'] as const) {
    if (!headers.includes(mapping[key])) throw new Error(`Mapped ${key} column is missing.`)
  }
  for (const column of Object.values(mapping)) {
    if (column && !headers.includes(column)) throw new Error(`Mapped column ${column} is missing.`)
  }
  const questions = rows.map((raw) => {
    const options = (['A', 'B', 'C', 'D', 'E', 'F'] as const).flatMap((label) => {
      const column = mapping[`option${label}`]
      const optionText = column ? raw[column]?.trim() : ''
      return optionText ? [{ label, text: optionText }] : []
    })
    return normalizeQuestion({
      id: raw[mapping.externalId], type: raw[mapping.questionType], prompt: raw[mapping.prompt],
      units: raw[mapping.unit], lesson: mapping.lesson ? raw[mapping.lesson] : undefined,
      difficulty: mapping.difficulty ? raw[mapping.difficulty] : undefined,
      marks: mapping.marks ? raw[mapping.marks] : null,
      content: mapping.structuredContent ? parseJsonField(raw[mapping.structuredContent], 'Structured content')
        : options.length ? { options } : null,
      answer: mapping.structuredAnswer ? parseJsonField(raw[mapping.structuredAnswer], 'Structured answer')
        : mapping.correctOptionLabel ? {
          correctOptionLabel: raw[mapping.correctOptionLabel],
          text: mapping.answer ? raw[mapping.answer] : '',
        } : mapping.answer ? raw[mapping.answer] : null,
      groupContext: mapping.groupContext ? parseJsonField(raw[mapping.groupContext], 'Group context') : null,
      sourceFields: raw,
    })
  })
  return finish(sourceNamespace, questions)
}

/** Strict versioned JSON intake; values remain staged until domain review. */
export function parseExamgoInterchangeJson(text: string): QuestionInterchangeV1 {
  checkSize(text)
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch { throw new Error('ExamGO interchange is not valid JSON.') }
  if (!object(parsed) || parsed.format !== QUESTION_INTERCHANGE_FORMAT ||
    parsed.version !== QUESTION_INTERCHANGE_VERSION || typeof parsed.sourceNamespace !== 'string' ||
    !Array.isArray(parsed.questions) || parsed.questions.length < 1 || parsed.questions.length > MAX_ROWS) {
    throw new Error('Unsupported ExamGO interchange format or version.')
  }
  const questions = parsed.questions.map((row: unknown) => {
    if (!object(row) || typeof row.catalogueId !== 'string' || typeof row.prompt !== 'string' ||
      !object(row.sourceFields) || Object.values(row.sourceFields).some((value) => typeof value !== 'string' || value.length > MAX_CELL)) {
      throw new Error('An interchange question has invalid required fields.')
    }
    return normalizeQuestion({
      id: row.catalogueId, type: row.type, prompt: row.prompt,
      units: row.unitTags, lesson: typeof row.lesson === 'string' ? row.lesson : undefined,
      difficulty: typeof row.difficulty === 'string' ? row.difficulty : undefined,
      difficultyProvisional: typeof row.difficultyProvisional === 'boolean' ? row.difficultyProvisional : undefined,
      marks: row.selectionMarks, content: row.content, answer: row.answer,
      groupContext: row.groupContext, groupIds: row.groupIds,
      groupCompleteness: typeof row.groupCompleteness === 'string' ? row.groupCompleteness : undefined,
      sourceFields: row.selectionMarks === null || row.selectionMarks === undefined
        ? row.sourceFields as Record<string, string>
        : { ...(row.sourceFields as Record<string, string>), legacySelectionMarks: String(row.selectionMarks) },
    })
  })
  return finish(parsed.sourceNamespace, questions)
}
