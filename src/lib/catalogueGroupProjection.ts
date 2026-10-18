import type { StagedInterchangeQuestion } from './questionInterchange'
import type { QuestionInput } from './questions'

type StoredGroupType = 'passage' | 'main-question' | 'branch' | 'alternative-choice'

/** Rows linked through any source group must commit or remain in review together. */
export function catalogueGroupComponents<T extends { groupIds: readonly string[] }>(rows: readonly T[]): T[][] {
  const parent = rows.map((_, index) => index)
  const find = (index: number): number => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]]
      index = parent[index]
    }
    return index
  }
  const byGroup = new Map<string, number>()
  rows.forEach((row, index) => {
    row.groupIds.forEach((id) => {
      const previous = byGroup.get(id)
      if (previous === undefined) byGroup.set(id, index)
      else parent[find(index)] = find(previous)
    })
  })
  const components = new Map<number, T[]>()
  rows.forEach((row, index) => {
    const root = find(index)
    const component = components.get(root) ?? []
    component.push(row)
    components.set(root, component)
  })
  return [...components.values()]
}

export interface CatalogueGroupProjection {
  sourceGroupId: string
  parentSourceGroupId: string | null
  groupType: StoredGroupType
  instructions: string | null
  attemptCount: number | null
  expectedMarks: null
  content: {
    type: StoredGroupType
    schemaVersion: 1
    sourceGroupType: string
    source: Record<string, unknown>
  }
  questionIds: string[]
}

/** A source group's printed count must agree with its converted answerable points. */
export function catalogueGroupSemanticIssues(group: CatalogueGroupProjection,
  inputs: ReadonlyMap<string, QuestionInput>): string[] {
  const issues: string[] = []
  const points = group.questionIds.reduce((count, id) => {
    const input = inputs.get(id)
    if (!input) {
      issues.push(`${id}: converted question is missing.`)
      return count
    }
    return count + (input.questionType === 'completion' ? input.completionBlankIds?.length ?? 0
      : input.questionType === 'matching' ? input.matchingLeft?.length ?? 0 : 1)
  }, 0)
  const rawCount = group.content.source.display_count
  const statedCount = Number(rawCount)
  if (rawCount === '' || rawCount === null || rawCount === undefined ||
    !Number.isSafeInteger(statedCount) || statedCount < 1) {
    issues.push('Printed display count is missing or invalid.')
  } else if (statedCount !== points) {
    issues.push(`Printed display count ${statedCount} differs from ${points} answerable points.`)
  }
  if (group.attemptCount !== null && group.attemptCount > points) {
    issues.push('Printed attempt count exceeds answerable points.')
  }
  if (group.content.source.group_completeness !== 'complete') {
    issues.push('Source group is not complete.')
  }
  if (group.content.sourceGroupType === 'passage') {
    if (!group.instructions) issues.push('Passage instruction is missing.')
    if (typeof group.content.source.passage_text !== 'string' ||
      !group.content.source.passage_text.trim()) issues.push('Passage text is missing.')
    if (group.attemptCount === null) issues.push('Passage attempt count is missing.')
  }
  return issues
}

const SOURCE_TYPES = new Set([
  'passage', 'printed_section', 'matching_set', 'completion_set',
  'alternatives', 'branch',
])

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Source group context contains a non-object.')
  }
  return value as Record<string, unknown>
}

function sourceGroups(question: StagedInterchangeQuestion): Record<string, unknown>[] {
  const encoded = question.sourceFields.group_context_json
  if (!encoded) {
    if (question.groupIds.length) throw new Error(`${question.catalogueId}: group context is missing.`)
    return []
  }
  let parsed: unknown
  try { parsed = JSON.parse(encoded) } catch {
    throw new Error(`${question.catalogueId}: group context is invalid JSON.`)
  }
  if (!Array.isArray(parsed)) throw new Error(`${question.catalogueId}: group context is not a list.`)
  const groups = parsed.map(record)
  const ids = groups.map((group) => group.group_id)
  if (ids.some((id) => typeof id !== 'string' || !id) ||
    ids.length !== new Set(ids).size ||
    ids.length !== question.groupIds.length ||
    ids.some((id) => !question.groupIds.includes(id as string))) {
    throw new Error(`${question.catalogueId}: group IDs disagree with the source context.`)
  }
  return groups
}

function mappedType(group: Record<string, unknown>): StoredGroupType {
  const sourceType = group.group_type
  if (typeof sourceType !== 'string' || !SOURCE_TYPES.has(sourceType)) {
    throw new Error(`Unsupported source group type: ${String(sourceType)}.`)
  }
  if (sourceType === 'passage') return 'passage'
  if (sourceType === 'alternatives') return 'alternative-choice'
  if (sourceType === 'printed_section' && !group.branch_label) return 'main-question'
  return 'branch'
}

/** Project source groups without interpreting printed counts as bank or exam marks. */
export function projectCatalogueGroups(questions: readonly StagedInterchangeQuestion[]): CatalogueGroupProjection[] {
  const seen = new Set<string>()
  const positions = new Map<string, string>()
  const groups = new Map<string, { source: Record<string, unknown>; canonical: string;
    questionIds: string[] }>()
  for (const question of questions) {
    const key = question.catalogueId.toLowerCase()
    if (seen.has(key)) throw new Error(`${question.catalogueId}: duplicate catalogue identity.`)
    seen.add(key)
    positions.set(question.catalogueId, question.sourceFields.item_order ?? '')
    for (const source of sourceGroups(question)) {
      const id = source.group_id as string
      const canonical = JSON.stringify(source)
      const existing = groups.get(id)
      if (existing && existing.canonical !== canonical) {
        throw new Error(`${id}: group metadata conflicts across source rows.`)
      }
      if (existing) existing.questionIds.push(question.catalogueId)
      else groups.set(id, { source, canonical, questionIds: [question.catalogueId] })
    }
  }
  // Item positions belong to the leaf branch, so do not compare restarted
  // positions across different children of a parent group.
  const parents = new Set([...groups.values()].map(({ source }) => source.parent_group_id))
  for (const [id, group] of groups) {
    if (parents.has(id)) continue
    const order = group.questionIds.map((questionId) => positions.get(questionId) ?? '')
    if (order.every((value) => !value)) continue // Interchange list order is explicit when no source positions exist.
    const numeric = order.map(Number)
    if (numeric.some((value) => !Number.isSafeInteger(value) || value < 1) ||
      new Set(numeric).size !== numeric.length) {
      throw new Error(`${id}: source member positions are missing, invalid or duplicated.`)
    }
    group.questionIds.sort((left, right) => Number(positions.get(left)) - Number(positions.get(right)))
  }
  const projected = [...groups].map(([id, { source, questionIds }]) => {
    const parent = source.parent_group_id
    if (parent && (typeof parent !== 'string' || !groups.has(parent))) {
      throw new Error(`${id}: parent group is missing from this component.`)
    }
    const groupType = mappedType(source)
    const rawInstructions = source.instructions
    const instructions = typeof rawInstructions === 'string' && rawInstructions.trim() &&
      rawInstructions.length <= 1000 ? rawInstructions : null
    const count = source.attempt_count
    const attemptCount = count === '' || count === null || count === undefined ? null : Number(count)
    if (attemptCount !== null && (!Number.isSafeInteger(attemptCount) || attemptCount < 1 || attemptCount > 100)) {
      throw new Error(`${id}: source attempt count is invalid.`)
    }
    return {
      sourceGroupId: id, parentSourceGroupId: parent ? parent as string : null,
      groupType, instructions, attemptCount, expectedMarks: null,
      content: { type: groupType, schemaVersion: 1 as const,
        sourceGroupType: source.group_type as string, source },
      questionIds,
    } satisfies CatalogueGroupProjection
  })
  const byId = new Map(projected.map((group) => [group.sourceGroupId, group]))
  for (const group of projected) {
    const seen = new Set([group.sourceGroupId])
    let parent = group.parentSourceGroupId
    while (parent) {
      if (seen.has(parent)) throw new Error(`${group.sourceGroupId}: source groups contain a cycle.`)
      seen.add(parent)
      parent = byId.get(parent)?.parentSourceGroupId ?? null
    }
  }
  return projected
}
