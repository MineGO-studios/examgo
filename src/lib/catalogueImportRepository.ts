import type { Json } from '../types/database'
import { canonicalImportValue, packStagingBatches } from './questionImportRepository'
import { materializeCatalogueComponent, prepareCataloguePromotion, type CataloguePromotionPlan } from './cataloguePromotion'
import { adaptPapersCatalogueRows, parseExamgoInterchangeJson, QUESTION_INTERCHANGE_FORMAT, QUESTION_INTERCHANGE_VERSION } from './questionInterchange'
import { isValidUuid } from './questions'
import { supabase } from './supabase'
import { accountLimitError } from './accountLimits'
import { importOutcomeTotals, importReviewMessage } from './importInterpretation'

const PAGE_SIZE = 1000
const READBACK_BATCH_SIZE = 50
type Payload = ReturnType<typeof materializeCatalogueComponent> & { catalogueIds: string[] }
const componentKey = (ids: readonly string[]) => [...ids].sort().join(':')

/** Reopen authoritative, complete intake; new imports retain explicit source list order. */
export async function previewStagedCatalogue(importId: string, bankId: string) {
  if (!isValidUuid(importId) || !isValidUuid(bankId)) throw new Error('A valid saved import and source bank are required.')
  const identity = await supabase.auth.getUser()
  if (identity.error || !identity.data.user) throw new Error('Sign in before importing questions.')
  const ownerId = identity.data.user.id
  const bank = await supabase.from('question_banks').select('id,owner_id')
    .eq('id', bankId).eq('owner_id', ownerId).eq('is_archived', false).maybeSingle()
  const intake = await supabase.from('catalogue_imports').select('source_namespace,expected_rows,format_version')
    .eq('id', importId).eq('owner_id', ownerId).eq('source_bank_id', bankId).maybeSingle()
  if (bank.error || !bank.data || intake.error || !intake.data || intake.data.format_version !== 1 ||
    intake.data.expected_rows < 1 || intake.data.expected_rows > 10_000) {
    throw new Error('Saved import or source bank is missing, archived or inaccessible.')
  }
  const rows: Array<{ catalogue_id: string; normalized: Json | null; source_fields: Json; source_content_hash: string }> = []
  for (let offset = 0; offset < intake.data.expected_rows; offset += PAGE_SIZE) {
    const result = await supabase.from('catalogue_import_rows').select('catalogue_id,normalized,source_fields,source_content_hash')
      .eq('import_id', importId).order('catalogue_id').range(offset, offset + PAGE_SIZE - 1)
    if (result.error || !result.data) throw new Error('Saved import could not be read. Reopen it and retry.')
    rows.push(...result.data)
  }
  if (rows.length !== intake.data.expected_rows) {
    throw new Error('Saved import is incomplete or has no confirmed mapping. Retry the same file and mapping.')
  }
  const missingMapping = rows.some((row) => row.normalized === null)
  if (missingMapping && intake.data.source_namespace !== 'Papers/Ready_Question_Bank/master_export') {
    throw new Error('Saved import has no confirmed mapping. Retry the same file and mapping.')
  }
  const papers = missingMapping ? adaptPapersCatalogueRows(rows.map((row) => row.source_fields as Record<string, string>)) : null
  const normalized = rows.map((row,index) => (row.normalized ?? papers!.questions[index]) as Record<string, Json>)
  if (normalized.some((row,index) => !row || typeof row !== 'object' || Array.isArray(row) || row.catalogueId !== rows[index].catalogue_id)) {
    throw new Error('Saved mapping identities disagree with their original source rows.')
  }
  // A partially attached historical Papers mapping resumes in its original
  // catalogue order. Existing explicit positions must agree with that order.
  if (missingMapping) normalized.forEach((row,index) => {
    if (row.sourceOrder !== undefined && row.sourceOrder !== index + 1) throw new Error('Saved source ordering is inconsistent.')
    row.sourceOrder = index + 1
  })
  const order = normalized.map((row) => row.sourceOrder)
  if (order.some((value) => value !== undefined)) {
    if (order.some((value) => typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > rows.length) ||
      new Set(order).size !== rows.length) throw new Error('Saved source ordering is inconsistent.')
    normalized.sort((left, right) => (left.sourceOrder as number) - (right.sourceOrder as number))
  }
  const document = parseExamgoInterchangeJson(JSON.stringify({ format: QUESTION_INTERCHANGE_FORMAT,
    version: QUESTION_INTERCHANGE_VERSION, sourceNamespace: intake.data.source_namespace, questions: normalized }))
  const hashes = new Map(rows.map((row) => [row.catalogue_id, row.source_content_hash]))
  const mappingRows = missingMapping ? document.questions.map((question,index) => ({
    catalogueId: question.catalogueId, sourceContentHash: hashes.get(question.catalogueId)!,
    sourceFields: question.sourceFields, unitTags: question.unitTags, displayUnit: question.displayUnit,
    groupIds: question.groupIds, normalized: { ...question, sourceOrder: index + 1 },
  })) : []
  const plan = prepareCataloguePromotion(document.questions, bankId)
  const savedKeys = new Set<string>()
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const saved = await supabase.from('catalogue_promotion_batches').select('catalogue_ids')
      .eq('import_id', importId).order('component_key').range(offset, offset + PAGE_SIZE - 1)
    if (saved.error || !saved.data) throw new Error('Saved conversion totals could not be confirmed. Reopen and retry.')
    for (const receipt of saved.data) savedKeys.add(componentKey(receipt.catalogue_ids))
    if (saved.data.length < PAGE_SIZE) break
  }
  const unchanged = plan.components.reduce((count, component) => count +
    (component.status === 'ready' && savedKeys.has(componentKey(component.catalogueIds)) ? component.catalogueIds.length : 0), 0)
  return { ownerId, document, plan, mappingRows, totals: importOutcomeTotals(plan.readyRows, plan.reviewRows, unchanged) }
}

export interface CatalogueCommitResult {
  importId: string
  sourceRows: number
  inserted: number
  unchanged: number
  readyRows: number
  reviewRows: number
  groups: number
  review: Extract<CataloguePromotionPlan['components'][number], { status: 'review' }>[]
  totals: ReturnType<typeof importOutcomeTotals>
  diagnostics: Array<ReturnType<typeof importReviewMessage> & { row: string; affectedRows: string[] }>
}

/** Commit whole eligible components. Receipts preserve identities across retries and edited questions. */
export async function commitStagedCatalogue(importId: string, bankId: string,
  onProgress?: (completed: number, total: number) => void): Promise<CatalogueCommitResult> {
  const { ownerId, plan, mappingRows } = await previewStagedCatalogue(importId, bankId)
  const receipts = new Map<string, Payload>()
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const result = await supabase.from('catalogue_promotion_batches').select('catalogue_ids,payload')
      .eq('import_id', importId).order('component_key').range(offset, offset + PAGE_SIZE - 1)
    if (result.error || !result.data) throw new Error('Saved conversions could not be loaded. Reopen and retry.')
    for (const receipt of result.data) receipts.set(componentKey(receipt.catalogue_ids), receipt.payload as unknown as Payload)
    if (result.data.length < PAGE_SIZE) break
  }
  // Prepare every component before any write. Existing receipts supply stable UUIDs.
  const payloads = plan.components.flatMap((component): Payload[] => {
    if (component.status !== 'ready') return []
    const existing = receipts.get(componentKey(component.catalogueIds))
    const identities = existing ? {
      questions: new Map(existing.questions.map((q) => [q.external_id, q.id!])),
      groups: new Map(existing.groups.map((g) => {
        const content = g.content as { source: { group_id: string } }
        return [content.source.group_id, g.id!]
      })),
    } : { questions: new Map(component.catalogueIds.map((id) => [id, crypto.randomUUID()])),
      groups: new Map(component.groups.map((g) => [g.sourceGroupId, crypto.randomUUID()])) }
    const payload = { catalogueIds: component.catalogueIds,
      ...materializeCatalogueComponent(component, ownerId, bankId, identities) }
    if (existing && canonicalImportValue(existing) !== canonicalImportValue(payload)) {
      throw new Error('Saved conversion differs from this preview. Review the existing import; no new rows were written.')
    }
    if (new TextEncoder().encode(JSON.stringify(payload)).byteLength > 700_000) {
      throw new Error('One converted group exceeds the atomic import size limit.')
    }
    return [payload]
  })
  let inserted = 0, unchanged = 0
  for (const batch of packStagingBatches(mappingRows)) {
    const attached = await supabase.rpc('attach_catalogue_mapping', { p_import_id: importId,
      p_rows: batch as unknown as Json })
    if (attached.error || attached.data === null) throw new Error('Source mapping could not be confirmed. Reopen this saved import and retry.')
  }
  for (const [index, payload] of payloads.entries()) {
    const result = await supabase.rpc('commit_catalogue_component', { p_import_id: importId,
      p_payload: payload as unknown as Json })
    const limit = accountLimitError(result.error)
    if (limit) throw limit
    const response = result.data
    if (result.error || !response || typeof response !== 'object' || Array.isArray(response) ||
      !Number.isSafeInteger(response.inserted) || !Number.isSafeInteger(response.unchanged) ||
      ![0, payload.questions.length].includes(response.inserted as number) ||
      (response.inserted as number) + (response.unchanged as number) !== payload.questions.length) {
      throw new Error(result.error?.code === '23505' ? 'A question ID or saved conversion conflicts. No conflicting group was changed.'
        : `Import stopped at group ${index + 1}. Retry this saved import to resume without duplicates.`)
    }
    inserted += response.inserted as number; unchanged += response.unchanged as number
    onProgress?.(index + 1, payloads.length)
  }
  await verifyCanonicalReadback(payloads, ownerId, bankId)
  const review = plan.components.filter((component) => component.status === 'review')
  return { importId, sourceRows: plan.sourceRows, inserted, unchanged, readyRows: plan.readyRows,
    reviewRows: plan.reviewRows, groups: payloads.reduce((sum, p) => sum + p.groups.length, 0),
    totals: importOutcomeTotals(inserted + unchanged, plan.reviewRows, unchanged),
    review, diagnostics: review.flatMap((component) => component.issues.map((issue) => ({
      row: issue.sourceId, affectedRows: component.catalogueIds, ...importReviewMessage(issue.message),
    }))) }
}

async function verifyCanonicalReadback(payloads: Payload[], ownerId: string, bankId: string): Promise<void> {
  const questions = payloads.flatMap((p) => p.questions)
  for (let first = 0; first < questions.length; first += READBACK_BATCH_SIZE) {
    const expected = questions.slice(first, first + READBACK_BATCH_SIZE)
    const result = await supabase.from('question_revisions').select('*')
      .in('question_id', expected.map((q) => q.id!)).eq('revision', 1)
      .abortSignal(AbortSignal.timeout(60_000))
    if (result.error || result.data?.length !== expected.length) throw new Error('Canonical revision readback is incomplete. Reopen the saved import.')
    const saved = new Map(result.data.map((q) => [q.question_id, q]))
    for (const question of expected) {
      const revision = saved.get(question.id!)
      if (!revision || revision.owner_id !== ownerId || revision.bank_id !== bankId ||
        ['external_id', 'unit', 'lesson', 'question_type', 'schema_version', 'difficulty', 'prompt', 'marks', 'content', 'answer', 'is_active']
          .some((field) => canonicalImportValue(revision[field as keyof typeof revision]) !==
            canonicalImportValue(question[field as keyof typeof question]))) {
        throw new Error('Canonical revision differs from the saved conversion. Reopen the saved import.')
      }
    }
  }
  const groups = payloads.flatMap((p) => p.groups)
  for (let first = 0; first < groups.length; first += 50) {
    const expected = groups.slice(first, first + 50)
    const ids = expected.map((g) => g.id!)
    const result = await supabase.from('question_groups').select('*').in('id', ids)
      .abortSignal(AbortSignal.timeout(60_000))
    if (result.error || result.data?.length !== expected.length) throw new Error('Canonical group readback is incomplete.')
    const saved = new Map(result.data.map((g) => [g.id, g]))
    for (const group of expected) {
      const value = saved.get(group.id!)
      if (!value || value.owner_id !== ownerId || ['group_type', 'schema_version', 'parent_group_id', 'position',
        'instructions', 'content', 'attempt_count', 'expected_marks'].some((field) =>
        canonicalImportValue(value[field as keyof typeof value]) !== canonicalImportValue(group[field as keyof typeof group]))) {
        throw new Error('A saved group changed or differs from its import receipt. Review it before continuing.')
      }
    }
    const members: Array<{ group_id: string; question_id: string; owner_id: string; position: number }> = []
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const read = await supabase.from('question_group_questions').select('group_id,question_id,owner_id,position')
        .in('group_id', ids).order('group_id').order('position').range(offset, offset + PAGE_SIZE - 1)
        .abortSignal(AbortSignal.timeout(60_000))
      if (read.error || !read.data) throw new Error('Ordered group readback is incomplete.')
      members.push(...read.data)
      if (read.data.length < PAGE_SIZE) break
    }
    const compare = (a: { group_id: string; position: number }, b: { group_id: string; position: number }) =>
      a.group_id.localeCompare(b.group_id) || a.position - b.position
    const expectedMembers = payloads.flatMap((p) => p.members).filter((m) => ids.includes(m.group_id)).sort(compare)
    if (canonicalImportValue(members.sort(compare)) !== canonicalImportValue(expectedMembers)) throw new Error('Ordered group members differ from their import receipts.')
  }
}
