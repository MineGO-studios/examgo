import { supabase } from './supabase'
import { isValidUuid, type Question } from './questions'

const PAGE_SIZE = 1000
// Keep encoded UUID filters well below gateway URL limits for populated banks.
const QUESTION_BATCH_SIZE = 50
const QUESTION_BATCH_CONCURRENCY = 6

/** Run batch reads a few at a time: hides network latency without flooding the API. */
async function forEachConcurrently<T>(items: readonly T[], run: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < items.length) await run(items[next++])
  }
  await Promise.all(Array.from({ length: Math.min(QUESTION_BATCH_CONCURRENCY, items.length) }, worker))
}

function normalizeBankIds(bankIds: readonly string[]): string[] {
  const ids = [...new Set(bankIds.map((id) => id.trim().toLowerCase()))]
  if (ids.length === 0 || ids.length > 20 || ids.some((id) => !isValidUuid(id))) {
    throw new Error('Select between one and 20 valid question banks.')
  }
  return ids
}

const byId = (left: Question, right: Question) => left.id.localeCompare(right.id)

/**
 * Load the whole pool in one database call, filtered there. Returns null when the
 * function is not installed yet, so callers fall back to the batched reads below.
 */
async function loadQuestionPool(ids: string[], activeOnly: boolean, standaloneOnly: boolean): Promise<Question[] | null> {
  const { data, error } = await supabase.rpc('get_bank_question_pool', {
    p_bank_ids: ids, p_active_only: activeOnly, p_standalone_only: standaloneOnly,
  }).abortSignal(AbortSignal.timeout(60_000))
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') return null
    throw new Error(error.code === '23514' ? 'Select between one and 20 valid question banks.'
      : error.code === '42501' ? 'A selected question bank is missing, archived or inaccessible.'
        : 'Unable to load the selected question banks. Retry; your work is unchanged.')
  }
  if (!Array.isArray(data)) throw new Error('Question pool response is invalid. Reopen the selected banks.')
  const questions = data as unknown as Question[]
  const ownerId = questions[0]?.owner_id
  if (new Set(questions.map((question) => question.id)).size !== questions.length ||
    questions.some((question) => !isValidUuid(question.id) || question.owner_id !== ownerId)) {
    throw new Error('Question pool readback is inconsistent. Reopen the selected banks.')
  }
  return [...questions].sort(byId)
}

/** Read one current canonical row per question across owned, active banks. */
export async function getQuestionsForBanks(bankIds: readonly string[]): Promise<Question[]> {
  const ids = normalizeBankIds(bankIds)
  return await loadQuestionPool(ids, false, false) ?? batchedQuestionsForBanks(ids)
}

/** Batched fallback used until get_bank_question_pool is installed. */
async function batchedQuestionsForBanks(ids: string[]): Promise<Question[]> {
  const banksResult = await supabase.from('question_banks')
    .select('id,owner_id').in('id', ids).eq('is_archived', false)
  if (banksResult.error || !banksResult.data || banksResult.data.length !== ids.length ||
    banksResult.data.some((bank) => bank.owner_id !== banksResult.data[0].owner_id)) {
    throw new Error('A selected question bank is missing, archived or inaccessible.')
  }
  const ownerId = banksResult.data[0].owner_id

  const questionIds = new Set<string>()
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const result = await supabase.from('question_bank_memberships')
      .select('question_id').in('bank_id', ids)
      .order('question_id').order('bank_id')
      .range(offset, offset + PAGE_SIZE - 1)
    if (result.error || !result.data) throw new Error('Unable to load question bank memberships.')
    for (const membership of result.data) questionIds.add(membership.question_id)
    if (result.data.length < PAGE_SIZE) break
  }

  const orderedIds = [...questionIds].sort()
  const batches: string[][] = []
  for (let index = 0; index < orderedIds.length; index += QUESTION_BATCH_SIZE) {
    batches.push(orderedIds.slice(index, index + QUESTION_BATCH_SIZE))
  }
  const questions: Question[] = []
  await forEachConcurrently(batches, async (batch) => {
    const result = await supabase.from('questions').select('*')
      .in('id', batch)
      .abortSignal(AbortSignal.timeout(60_000))
    if (result.error || !result.data) throw new Error('Unable to load canonical questions.')
    questions.push(...result.data)
  })
  if (questions.length !== orderedIds.length || questions.some((question) => question.owner_id !== ownerId)) {
    throw new Error('Question membership readback is incomplete or disagrees with bank ownership.')
  }
  return questions.sort(byId)
}

export async function getActiveQuestionsForBanks(bankIds: readonly string[]): Promise<Question[]> {
  const ids = normalizeBankIds(bankIds)
  return await loadQuestionPool(ids, true, false) ??
    (await batchedQuestionsForBanks(ids)).filter((question) => question.is_active)
}

/** Simple-paper selection must never detach a child from its passage context. */
export async function getStandaloneQuestionsForBanks(bankIds: readonly string[]): Promise<Question[]> {
  const ids = normalizeBankIds(bankIds)
  return await loadQuestionPool(ids, false, true) ?? batchedStandaloneQuestionsForBanks(ids)
}

async function batchedStandaloneQuestionsForBanks(ids: string[]): Promise<Question[]> {
  const questions = await batchedQuestionsForBanks(ids)
  const passageChildren = new Set<string>()
  const batches: string[][] = []
  for (let first = 0; first < questions.length; first += QUESTION_BATCH_SIZE) {
    batches.push(questions.slice(first, first + QUESTION_BATCH_SIZE).map((q) => q.id))
  }
  await forEachConcurrently(batches, async (ids) => {
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const result = await supabase.from('question_group_questions')
        .select('question_id,question_groups!inner(group_type)')
        .in('question_id', ids).eq('question_groups.group_type', 'passage')
        .order('question_id').order('group_id').range(offset, offset + PAGE_SIZE - 1)
        .abortSignal(AbortSignal.timeout(60_000))
      if (result.error || !result.data) throw new Error('Unable to confirm question context. Reopen the selected banks.')
      for (const member of result.data) passageChildren.add(member.question_id)
      if (result.data.length < PAGE_SIZE) break
    }
  })
  return questions.filter((question) => !passageChildren.has(question.id))
}

export async function getActiveStandaloneQuestionsForBanks(bankIds: readonly string[]): Promise<Question[]> {
  const ids = normalizeBankIds(bankIds)
  return await loadQuestionPool(ids, true, true) ??
    (await batchedStandaloneQuestionsForBanks(ids)).filter((question) => question.is_active)
}

export async function removeDerivedQuestionMembership(bankId: string, question: Question): Promise<void> {
  if (!isValidUuid(bankId) || !isValidUuid(question.id) || bankId === question.bank_id) {
    throw new Error('Only a derived bank membership can be removed.')
  }
  const { data, error } = await supabase.from('question_bank_memberships').delete()
    .eq('bank_id', bankId).eq('question_id', question.id)
    .select('question_id').maybeSingle()
  if (error || !data) throw new Error(error?.code === '23514'
    ? 'This question belongs to a group. Remove the whole group from the collection.'
    : 'Unable to remove this question from the derived bank.')
}

export async function removeDerivedGroupMembership(bankId: string, groupId: string,
  childIds: readonly string[]): Promise<void> {
  if (!isValidUuid(bankId) || !isValidUuid(groupId) || childIds.length < 1 ||
    childIds.some((id) => !isValidUuid(id))) {
    throw new Error('A valid collection and complete question group are required.')
  }
  const { data, error } = await supabase.rpc('remove_group_from_bank', {
    p_bank_id: bankId, p_group_id: groupId,
  })
  if (error || data !== childIds.length) {
    throw new Error(error?.code === '23514'
      ? 'This group overlaps another group or belongs to its source bank.'
      : 'Unable to confirm the complete group removal.')
  }
  const readback = await supabase.from('question_bank_memberships').select('question_id')
    .eq('bank_id', bankId).in('question_id', [...childIds])
  if (readback.error || !readback.data || readback.data.length > 0) {
    throw new Error('Group removal readback is incomplete. Reload the collection.')
  }
}
