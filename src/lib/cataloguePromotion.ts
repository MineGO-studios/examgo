import {
  catalogueGroupComponents, catalogueGroupSemanticIssues, projectCatalogueGroups,
  type CatalogueGroupProjection,
} from './catalogueGroupProjection'
import { normalizeCatalogueQuestion } from './catalogueNormalization'
import type { StagedInterchangeQuestion } from './questionInterchange'
import { isValidUuid, questionInputPayload, type QuestionInput } from './questions'
import { validateDomainQuestion, validateQuestionGraph, type DomainQuestion } from '../domain/questionDomain'
import { validatePassageGroup } from '../domain/passageGroup'
import type { Json, TablesInsert } from '../types/database'

export interface CataloguePromotionIssue {
  sourceId: string
  message: string
}

export type CataloguePromotionComponent = {
  status: 'ready'
  catalogueIds: string[]
  questions: Array<{ source: StagedInterchangeQuestion; input: QuestionInput }>
  groups: CatalogueGroupProjection[]
} | {
  status: 'review'
  catalogueIds: string[]
  issues: CataloguePromotionIssue[]
}

export interface CataloguePromotionPlan {
  sourceBankId: string
  sourceRows: number
  readyRows: number
  reviewRows: number
  components: CataloguePromotionComponent[]
}

export interface CatalogueCanonicalIdentities {
  questions: ReadonlyMap<string, string>
  groups: ReadonlyMap<string, string>
}

/** Produce domain-validated canonical rows with the identities assigned to this import. */
export function materializeCatalogueComponent(
  component: Extract<CataloguePromotionComponent, { status: 'ready' }>,
  ownerId: string, sourceBankId: string, identities: CatalogueCanonicalIdentities,
) {
  if (!isValidUuid(ownerId) || !isValidUuid(sourceBankId) || component.questions.length < 1 ||
    component.questions.length > 100) throw new Error('A bounded component and valid owner/source bank are required.')
  const seen = new Set<string>()
  const identity = (kind: 'questions' | 'groups', sourceId: string): string => {
    const id = identities[kind].get(sourceId)
    if (!id || !isValidUuid(id) || seen.has(id.toLowerCase())) {
      throw new Error(`${sourceId}: canonical identity is missing, invalid or reused.`)
    }
    seen.add(id.toLowerCase())
    return id
  }
  const domain = new Map<string, DomainQuestion>()
  const questions = component.questions.map(({ source, input }): TablesInsert<'questions'> => {
    if (input.bankId !== sourceBankId || input.unit !== Math.max(...source.unitTags) || input.marks !== null) {
      throw new Error(`${source.catalogueId}: bank, primary unit or mark ownership changed after preview.`)
    }
    const id = identity('questions', source.catalogueId)
    const payload = questionInputPayload(input)
    const candidate = { id, ownerId, bankId: sourceBankId, externalId: input.externalId,
      unit: input.unit, lesson: input.lesson, type: input.questionType, schemaVersion: 1,
      difficulty: input.difficulty, prompt: input.prompt, marks: null,
      content: payload.content, answer: payload.answer, isActive: input.isActive, revision: 1 }
    const validation = validateDomainQuestion(candidate)
    if (!validation.success) throw new Error(`${source.catalogueId}: ${validation.issues[0].message}`)
    domain.set(source.catalogueId, candidate as DomainQuestion)
    return { id, owner_id: ownerId, bank_id: sourceBankId, external_id: input.externalId,
      unit: input.unit, lesson: input.lesson, question_type: input.questionType,
      difficulty: input.difficulty, prompt: input.prompt, marks: null,
      is_active: input.isActive, ...payload }
  })
  const groupIds = new Map(component.groups.map((group) =>
    [group.sourceGroupId, identity('groups', group.sourceGroupId)]))
  const members: TablesInsert<'question_group_questions'>[] = []
  const groups = component.groups.map((group): TablesInsert<'question_groups'> => {
    const id = groupIds.get(group.sourceGroupId)!
    const children = group.questionIds.map((sourceId, index) => {
      const question = domain.get(sourceId)
      if (!question) throw new Error(`${group.sourceGroupId}: a group member is outside the component.`)
      members.push({ group_id: id, question_id: question.id, owner_id: ownerId, position: index + 1 })
      return { position: index + 1, question }
    })
    if (children.length < 1 || children.length > 100) throw new Error('A group needs 1–100 ordered children.')
    const parentId = group.parentSourceGroupId === null ? null : groupIds.get(group.parentSourceGroupId)
    if (parentId === undefined) throw new Error(`${group.sourceGroupId}: parent is outside the component.`)
    let content: Record<string, unknown> = { ...group.content, bankId: sourceBankId }
    if (group.groupType === 'passage') {
      if (parentId !== null) throw new Error(`${group.sourceGroupId}: nested passage rendering requires review.`)
      const passage = { id, ownerId, bankId: sourceBankId, revision: 1, schemaVersion: 1,
        title: null, instruction: group.instructions, arabicInstruction: null,
        passage: group.content.source.passage_text, attemptCount: group.attemptCount,
        expectedMarks: null, children }
      const validation = validatePassageGroup(passage)
      if (!validation.success) throw new Error(`${group.sourceGroupId}: ${validation.issues[0].message}`)
      content = { ...content, text: passage.passage, arabicInstruction: null,
        childIds: children.map(({ question }) => question.id) }
    }
    return { id, owner_id: ownerId, group_type: group.groupType, schema_version: 1,
      parent_group_id: parentId, position: parentId === null ? null : component.groups.filter((candidate) =>
        candidate.parentSourceGroupId === group.parentSourceGroupId).indexOf(group) + 1, title: null,
      instructions: group.instructions, attempt_count: group.attemptCount,
      expected_marks: null, content: content as Json }
  })
  const graph = validateQuestionGraph(groups.map((group, index) => ({
    id: group.id!, ownerId, type: component.groups[index].groupType, schemaVersion: 1,
    parentGroupId: group.parent_group_id ?? null, position: group.position ?? null,
    label: null, expectedMarks: null,
  })), members.map((member) => ({ groupId: member.group_id,
    questionId: member.question_id, ownerId, position: member.position })), [...domain.values()])
  if (!graph.success) throw new Error(`Canonical group graph: ${graph.issues[0].message}`)
  return { questions, groups, members }
}

/** One normalization and group gate for preview and commit; this grants no publication authority. */
export function prepareCataloguePromotion(questions: readonly StagedInterchangeQuestion[],
  sourceBankId: string): CataloguePromotionPlan {
  if (!isValidUuid(sourceBankId) || questions.length < 1 || questions.length > 10_000) {
    throw new Error('A valid source bank and between 1 and 10,000 questions are required.')
  }
  const seen = new Set<string>()
  for (const question of questions) {
    const key = question.catalogueId.toLowerCase()
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(question.catalogueId) || seen.has(key)) {
      throw new Error('Catalogue identities must be valid and unique within the import.')
    }
    seen.add(key)
    if (question.unitTags.length < 1 || question.unitTags.length > 8 ||
      question.unitTags.some((unit) => !Number.isSafeInteger(unit) || unit < 1 || unit > 8) ||
      new Set(question.unitTags).size !== question.unitTags.length ||
      question.displayUnit !== Math.max(...question.unitTags)) {
      throw new Error(`${question.catalogueId}: invalid highest-unit placement.`)
    }
  }
  const components = catalogueGroupComponents(questions).map((source): CataloguePromotionComponent => {
    const catalogueIds = source.map((question) => question.catalogueId)
    const converted: Array<{ source: StagedInterchangeQuestion; input: QuestionInput }> = []
    const issues: CataloguePromotionIssue[] = []
    for (const question of source) {
      const result = normalizeCatalogueQuestion(question, sourceBankId)
      if (result.status === 'review') issues.push({ sourceId: question.catalogueId, message: result.reason })
      else converted.push({ source: question, input: result.input })
    }
    if (issues.length) return { status: 'review', catalogueIds, issues }
    let groups: CatalogueGroupProjection[]
    try { groups = projectCatalogueGroups(source) } catch (error) {
      if (!(error instanceof Error)) throw error
      return { status: 'review', catalogueIds,
        issues: [{ sourceId: catalogueIds[0], message: error.message }] }
    }
    const inputs = new Map(converted.map((question) => [question.source.catalogueId, question.input]))
    for (const group of groups) {
      for (const message of catalogueGroupSemanticIssues(group, inputs)) {
        issues.push({ sourceId: group.sourceGroupId, message })
      }
    }
    return issues.length ? { status: 'review', catalogueIds, issues }
      : { status: 'ready', catalogueIds, questions: converted, groups }
  })
  const readyRows = components.reduce((count, component) =>
    count + (component.status === 'ready' ? component.catalogueIds.length : 0), 0)
  return { sourceBankId, sourceRows: questions.length, readyRows,
    reviewRows: questions.length - readyRows, components }
}
