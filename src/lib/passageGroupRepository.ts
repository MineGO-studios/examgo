import { questionRowToDomain, type DomainQuestion } from '../domain/questionDomain'
import { validatePassageGroup, type PassageGroup } from '../domain/passageGroup'
import type { CompletionGroup } from '../domain/compoundStructure'
import type { Tables } from '../types/database'
import { getQuestionsForBanks } from './questionMembershipRepository'
import { supabase } from './supabase'

type GroupRow = Tables<'question_groups'>
type MemberRow = Tables<'question_group_questions'>

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function dataError(code?: string): Error {
  if (code === '42501' || code === 'PGRST301') return new Error('You cannot access this passage or one of its questions.')
  if (code === 'PT409' || code === '40001') return new Error('This passage changed. Reopen it and review the current questions before saving.')
  if (code === 'PGRST202' || code === '42883') return new Error('Passage saving is not installed in this environment yet. Keep your text and retry after the database update.')
  if (code === '23514' || code === '23505') return new Error('The passage, children, attempt rule or marks are invalid. Review the group before saving.')
  return new Error('The passage could not be confirmed. Retry or reopen it before continuing.')
}

function parseGroup(row: GroupRow, members: MemberRow[], questionById: Map<string, ReturnType<typeof questionRowToDomain>>): PassageGroup {
  const content = row.content
  if (!record(content) || content.type !== 'passage' || content.schemaVersion !== 1 ||
    typeof content.bankId !== 'string' || typeof content.text !== 'string' ||
    !Array.isArray(content.childIds) || content.childIds.some((id) => typeof id !== 'string') ||
    (content.arabicInstruction !== null && typeof content.arabicInstruction !== 'string')) {
    throw new Error('Saved passage content uses an unsupported structure.')
  }
  const childIds = content.childIds as string[]
  const ordered = [...members].sort((a, b) => a.position - b.position)
  if (row.group_type !== 'passage' || row.parent_group_id !== null ||
    ordered.length !== childIds.length ||
    ordered.some((member, index) => member.group_id !== row.id || member.position !== index + 1 || member.question_id !== childIds[index])) {
    throw new Error('Saved passage children differ from their recorded order.')
  }
  const children = ordered.map((member) => {
    const question = questionById.get(member.question_id)
    if (!question) throw new Error('A saved passage child is missing from this bank.')
    return { position: member.position, question }
  })
  if (typeof row.instructions !== 'string' || row.attempt_count === null) {
    throw new Error('Saved passage instructions or attempt count are missing.')
  }
  return {
    id: row.id, ownerId: row.owner_id, bankId: content.bankId, revision: row.revision,
    schemaVersion: 1, title: row.title, instruction: row.instructions,
    arabicInstruction: content.arabicInstruction as string | null,
    passage: content.text, attemptCount: row.attempt_count,
    expectedMarks: row.expected_marks, children,
  }
}

export async function getStructuredQuestionPoolForBanks(bankIds: readonly string[]): Promise<{
  questions: DomainQuestion[]; passages: PassageGroup[]; completionGroups: CompletionGroup[]; standaloneQuestionIds: string[]
}> {
  const questions = await getQuestionsForBanks(bankIds)
  const questionById = new Map(questions.map((question) => [question.id, questionRowToDomain(question)]))
  const groups: GroupRow[] = []
  for (let offset = 0; ; offset += 1000) {
    const result = await supabase.from('question_groups').select('*')
      .order('created_at').order('id').range(offset, offset + 999)
    if (result.error || !result.data) throw dataError(result.error?.code)
    groups.push(...result.data)
    if (result.data.length < 1000) break
  }
  const selected = groups.filter((group) => group.group_type === 'passage' && record(group.content) &&
    typeof group.content.bankId === 'string' && Array.isArray(group.content.childIds) &&
    group.content.childIds.length > 0 &&
    group.content.childIds.every((id) => typeof id === 'string' && questionById.has(id)))
  // Even a partially selected passage must keep its context; never use its
  // remaining children as independent questions in another branch.
  const contextualIds = new Set(groups.flatMap((group) => group.group_type === 'passage' && record(group.content) && Array.isArray(group.content.childIds)
    ? group.content.childIds.filter((id): id is string => typeof id === 'string') : []))
  const pool = { questions: [...questionById.values()],
    standaloneQuestionIds: questions.filter((question) => !contextualIds.has(question.id)).map((question) => question.id) }
  const completionSources = groups.filter((group) => record(group.content) &&
    group.content.sourceGroupType === 'completion_set' && group.attempt_count === 5 &&
    record(group.content.source) && group.content.source.group_completeness === 'complete' &&
    group.content.source.display_count === 6 && typeof group.instructions === 'string')
  // Load membership even for unavailable completion exercises, so their remaining
  // blanks cannot be selected independently after one child disappears.
  const completionContextGroups = groups.filter(group => record(group.content) && group.content.sourceGroupType === 'completion_set')
  const requested = [...selected, ...completionContextGroups]
  if (!requested.length) return { ...pool, passages: [], completionGroups: [] }
  const members: MemberRow[] = []
  for (let index = 0; index < requested.length; index += 50) {
    const ids = requested.slice(index, index + 50).map((group) => group.id)
    for (let offset = 0; ; offset += 1000) {
      const result = await supabase.from('question_group_questions').select('*')
        .in('group_id', ids).order('group_id').order('position').range(offset, offset + 999)
      if (result.error || !result.data) throw dataError(result.error?.code)
      members.push(...result.data)
      if (result.data.length < 1000) break
    }
  }
  const completionContextIds = new Set(completionContextGroups.map(group => group.id))
  for (const member of members) if (completionContextIds.has(member.group_id)) contextualIds.add(member.question_id)
  pool.standaloneQuestionIds = questions.filter(question => !contextualIds.has(question.id)).map(question => question.id)
  const completionGroups = completionSources.flatMap((group): CompletionGroup[] => {
    const ordered = members.filter((member) => member.group_id === group.id).sort((a, b) => a.position - b.position)
    if (!record(group.content) || typeof group.content.bankId !== 'string' || ordered.length !== 6 ||
      ordered.some((member, index) => member.position !== index + 1 || questionById.get(member.question_id)?.type !== 'completion')) return []
    const children = ordered.map((member) => questionById.get(member.question_id)!)
    const first = children[0]
    const sourceBankId = group.content.bankId
    if (first.type !== 'completion' || children.some((question) => question.type !== 'completion' ||
      question.ownerId !== group.owner_id || question.bankId !== sourceBankId || !question.isActive ||
      question.content.blankIds.length !== 1 || JSON.stringify(question.content.wordBank) !== JSON.stringify(first.content.wordBank))) return []
    return [{ id: group.id, ownerId: group.owner_id, bankId: group.content.bankId,
      revision: group.revision, schemaVersion: 1, title: group.title, instruction: group.instructions!,
      attemptCount: group.attempt_count!, expectedMarks: group.expected_marks, content: group.content,
      childIds: ordered.map((member) => member.question_id) }]
  })
  return { ...pool, completionGroups, passages: selected.map((group) => parseGroup(
    group, members.filter((member) => member.group_id === group.id), questionById,
  )) }
}

export async function getPassageGroups(bankId: string): Promise<PassageGroup[]> {
  return (await getStructuredQuestionPoolForBanks([bankId])).passages
}

export async function savePassageGroup(group: PassageGroup, expectedRevision: number): Promise<PassageGroup> {
  const validation = validatePassageGroup(group)
  if (!validation.success) throw new Error(`Invalid passage at ${validation.issues[0].path}: ${validation.issues[0].message}`)
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 ||
    (expectedRevision !== 0 && group.revision !== expectedRevision)) {
    throw new Error('Reopen the passage to obtain its current revision before saving.')
  }
  const { data, error } = await supabase.rpc('save_passage_group', {
    p_id: group.id,
    p_expected_revision: expectedRevision,
    p_bank_id: group.bankId,
    p_title: group.title,
    p_instruction: group.instruction,
    p_arabic_instruction: group.arabicInstruction,
    p_passage: group.passage,
    p_attempt_count: group.attemptCount,
    p_expected_marks: group.expectedMarks,
    p_question_ids: group.children.map((child) => child.question.id),
  })
  if (error) throw dataError(error.code)
  if (!record(data) || data.id !== group.id || !Number.isSafeInteger(data.revision) ||
    (data.revision as number) < Math.max(1, expectedRevision) || (data.revision as number) > expectedRevision + 1) {
    throw new Error('Passage save response was incomplete. Reopen it before continuing.')
  }
  const saved = (await getPassageGroups(group.bankId)).find((candidate) => candidate.id === group.id)
  if (!saved || saved.revision !== data.revision || saved.ownerId !== group.ownerId ||
    saved.bankId !== group.bankId || saved.instruction !== group.instruction ||
    saved.arabicInstruction !== group.arabicInstruction || saved.passage !== group.passage ||
    saved.title !== group.title || saved.attemptCount !== group.attemptCount ||
    saved.expectedMarks !== group.expectedMarks || saved.children.length !== group.children.length ||
    saved.children.some((child, index) => child.question.id !== group.children[index]?.question.id ||
      child.question.revision !== group.children[index]?.question.revision)) {
    throw new Error('Saved passage readback differs from the reviewed group. Reopen it before continuing.')
  }
  return saved
}
