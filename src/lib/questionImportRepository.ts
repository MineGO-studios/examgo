import type { Json } from '../types/database'
import {
  QUESTION_INTERCHANGE_FORMAT, QUESTION_INTERCHANGE_VERSION,
  type QuestionInterchangeV1, type StagedInterchangeQuestion,
} from './questionInterchange'
import { isValidUuid } from './questions'
import { catalogueGroupComponents } from './catalogueGroupProjection'
import { supabase } from './supabase'
import { accountLimitError } from './accountLimits'

const MAX_IMPORT_BYTES = 32 * 1024 * 1024
const MAX_BATCH_ROWS = 100
const MAX_BATCH_BYTES = 700_000

export function canonicalImportValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalImportValue).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const fields = Object.entries(value).filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    return `{${fields.map(([key, item]) => `${JSON.stringify(key)}:${canonicalImportValue(item)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

async function sha256(value: Uint8Array): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new Uint8Array(value))
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function rowPayload(question: StagedInterchangeQuestion, sourceContentHash: string, sourceOrder: number) {
  return {
    catalogueId: question.catalogueId,
    sourceContentHash,
    sourceFields: question.sourceFields,
    unitTags: question.unitTags,
    displayUnit: question.displayUnit,
    groupIds: question.groupIds,
    normalized: { ...question, sourceOrder },
  }
}

type StagingRow = ReturnType<typeof rowPayload>

/** Keep every connected group component in one atomic RPC call. */
export function packStagingBatches(rows: readonly StagingRow[]): StagingRow[][] {
  const batches: StagingRow[][] = []
  let current: StagingRow[] = []
  for (const component of catalogueGroupComponents(rows)) {
    const combined = [...current, ...component]
    if (current.length > 0 && (combined.length > MAX_BATCH_ROWS ||
      new TextEncoder().encode(canonicalImportValue(combined)).byteLength > MAX_BATCH_BYTES)) {
      batches.push(current)
      current = component
    } else current = combined
    if (current.length > MAX_BATCH_ROWS ||
      new TextEncoder().encode(canonicalImportValue(current)).byteLength > MAX_BATCH_BYTES) {
      throw new Error('One source group exceeds the atomic import batch limit.')
    }
  }
  if (current.length > 0) batches.push(current)
  return batches
}

export interface StagedImportResult {
  importId: string
  sourceSha256: string
  rows: number
  inserted: number
  unchanged: number
}

export interface StagedImportSummary {
  id: string
  sourceNamespace: string
  expectedRows: number
  stagedRows: number
  createdAt: string
}

export interface StagedReviewRow {
  catalogueId: string
  type: string
  prompt: string
  answer: string
  unitTags: number[]
  displayUnit: number
  lesson: string
  selectionMarks: number | null
  groupIds: string[]
  groupCompleteness: string
  issues: string[]
  original: Record<string, unknown>
  normalized: Record<string, unknown>
}

export interface StagedReviewPage {
  rows: StagedReviewRow[]
  total: number
  page: number
  pageSize: number
}

const REVIEW_PAGE_SIZE = 20

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {}
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** Show source values without treating catalogue review status as application approval. */
export function summarizeStagedRow(row: {
  catalogue_id: string; source_fields: Json; normalized: Json | null;
  unit_tags: number[]; display_unit: number; selection_marks: number | null;
  group_ids: string[];
}): StagedReviewRow {
  const source = record(row.source_fields)
  const normalized = record(row.normalized)
  const normalizedIssues = normalized.issues
  const issues = Array.isArray(normalizedIssues)
    ? normalizedIssues.filter((issue): issue is string =>
      typeof issue === 'string' && issue !== 'selection-marks-unassigned') : []
  const groupCompleteness = stringValue(normalized.groupCompleteness) ||
    stringValue(source.group_completeness)
  const prompt = stringValue(normalized.prompt) || stringValue(source.question_text)
  if (!prompt.trim() && !issues.includes('prompt-missing')) issues.push('prompt-missing')
  if (groupCompleteness && groupCompleteness !== 'complete' && !issues.includes('group-incomplete')) {
    issues.push('group-incomplete')
  }
  const answer = normalized.answer
  return {
    catalogueId: row.catalogue_id,
    type: stringValue(normalized.type) || stringValue(source.question_type),
    prompt,
    answer: typeof answer === 'string' ? answer : stringValue(source.answer_text),
    unitTags: row.unit_tags, displayUnit: row.display_unit,
    lesson: stringValue(normalized.lesson) || stringValue(source.lesson),
    selectionMarks: row.selection_marks, groupIds: row.group_ids,
    groupCompleteness, issues, original: source, normalized,
  }
}

export async function getStagedReviewPage(importId: string, page: number): Promise<StagedReviewPage> {
  if (!isValidUuid(importId) || !Number.isSafeInteger(page) || page < 1 || page > 500) {
    throw new Error('A valid saved import and review page are required.')
  }
  const first = (page - 1) * REVIEW_PAGE_SIZE
  const result = await supabase.from('catalogue_import_rows')
    .select('catalogue_id,source_fields,normalized,unit_tags,display_unit,selection_marks,group_ids',
      { count: 'exact' })
    .eq('import_id', importId).order('catalogue_id').range(first, first + REVIEW_PAGE_SIZE - 1)
  if (result.error || !result.data || result.count === null) {
    throw new Error('Saved import questions could not be read back.')
  }
  return { rows: result.data.map(summarizeStagedRow), total: result.count,
    page, pageSize: REVIEW_PAGE_SIZE }
}

export async function listStagedImportsForBank(bankId: string): Promise<StagedImportSummary[]> {
  if (!isValidUuid(bankId)) throw new Error('A valid source bank is required.')
  const result = await supabase.from('catalogue_imports')
    .select('id,source_namespace,expected_rows,created_at')
    .eq('source_bank_id', bankId).order('created_at', { ascending: false }).limit(20)
  if (result.error || !result.data) throw new Error('Saved intake records could not be loaded.')
  return Promise.all(result.data.map(async (item) => {
    const count = await supabase.from('catalogue_import_rows')
      .select('catalogue_id', { count: 'exact', head: true }).eq('import_id', item.id)
    if (count.error || count.count === null) {
      throw new Error('Saved intake row counts could not be confirmed.')
    }
    return { id: item.id, sourceNamespace: item.source_namespace,
      expectedRows: item.expected_rows, stagedRows: count.count, createdAt: item.created_at }
  }))
}

export async function stageQuestionInterchange(
  document: QuestionInterchangeV1, sourceBytes: Uint8Array, sourceBankId: string,
  onProgress?: (completed: number, total: number) => void,
): Promise<StagedImportResult> {
  if (document.format !== QUESTION_INTERCHANGE_FORMAT || document.version !== QUESTION_INTERCHANGE_VERSION ||
    !isValidUuid(sourceBankId) || sourceBytes.byteLength > MAX_IMPORT_BYTES ||
    document.questions.length < 1 || document.questions.length > 10_000 ||
    !document.sourceNamespace.trim() || document.sourceNamespace.length > 100) {
    throw new Error('Import format, source, bank or size is invalid.')
  }
  const { data: identity, error: identityError } = await supabase.auth.getUser()
  if (identityError || !identity.user) throw new Error('Sign in before staging this import.')
  const { data: bank, error: bankError } = await supabase.from('question_banks')
    .select('id,owner_id').eq('id', sourceBankId).eq('is_archived', false).maybeSingle()
  if (bankError || !bank || bank.owner_id !== identity.user.id) {
    throw new Error('The selected source bank is missing or inaccessible.')
  }
  const sourceSha256 = await sha256(sourceBytes)
  const seen = new Set<string>()
  const rows: StagingRow[] = []
  for (const [index, question] of document.questions.entries()) {
    const key = question.catalogueId.toLowerCase()
    if (seen.has(key) || question.unitTags.length === 0 || question.unitTags.length > 8 ||
      question.unitTags.some((unit) => !Number.isSafeInteger(unit) || unit < 1 || unit > 8) ||
      new Set(question.unitTags).size !== question.unitTags.length ||
      question.displayUnit !== Math.max(...question.unitTags)) {
      throw new Error(`Duplicate or invalid catalogue question: ${question.catalogueId}.`)
    }
    seen.add(key)
    const hashInput = document.sourceNamespace === 'Papers/Ready_Question_Bank/master_export'
      ? question.sourceFields : { sourceFields: question.sourceFields, normalized: question }
    rows.push(rowPayload(question, await sha256(new TextEncoder().encode(canonicalImportValue(hashInput))), index + 1))
  }
  const batches = packStagingBatches(rows)
  const insertedImport = await supabase.from('catalogue_imports').insert({
    source_namespace: document.sourceNamespace, source_sha256: sourceSha256,
    source_bank_id: sourceBankId, expected_rows: rows.length,
  }).select('id,source_bank_id,expected_rows').single()
  let importRow = insertedImport.data
  const importLimit = accountLimitError(insertedImport.error)
  if (importLimit) throw importLimit
  if (insertedImport.error?.code === '23505') {
    const existing = await supabase.from('catalogue_imports')
      .select('id,source_bank_id,expected_rows')
      .eq('source_namespace', document.sourceNamespace).eq('source_sha256', sourceSha256).maybeSingle()
    if (existing.error || !existing.data) throw new Error('Existing import could not be read back.')
    importRow = existing.data
  } else if (insertedImport.error || !importRow) {
    throw new Error('Unable to create the private import record.')
  }
  if (importRow.source_bank_id !== sourceBankId || importRow.expected_rows !== rows.length) {
    throw new Error('Existing import uses a different bank or row count.')
  }
  let inserted = 0
  let unchanged = 0
  for (const [index, batch] of batches.entries()) {
    const { data, error } = await supabase.rpc('stage_catalogue_import_batch', {
      p_import_id: importRow.id, p_rows: batch as unknown as Json,
    })
    if (error || !data || typeof data !== 'object' || Array.isArray(data) ||
      typeof data.inserted !== 'number' || typeof data.unchanged !== 'number') {
      throw new Error(error?.code === '23505'
        ? 'A catalogue ID already exists with different content or mapping.'
        : `Import batch ${index + 1} could not be confirmed. Retry the same file and mapping.`)
    }
    inserted += data.inserted
    unchanged += data.unchanged
    onProgress?.(index + 1, batches.length)
  }
  const readback = await supabase.from('catalogue_import_rows')
    .select('catalogue_id', { count: 'exact', head: true }).eq('import_id', importRow.id)
  if (readback.error || readback.count !== rows.length) {
    throw new Error('Import staging readback is incomplete. Retry the same file and mapping.')
  }
  return { importId: importRow.id, sourceSha256, rows: rows.length, inserted, unchanged }
}
