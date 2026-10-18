import { assertDomainQuestion, isUuid, type DomainQuestion } from '../domain/questionDomain'
import { questionPointIds } from '../domain/markAllocation'
import { questionSelectionKeys } from './selectQuestions'

export type PresetPointIdeas = {
  schemaVersion: 1
  revisionId: string
  points: Array<{ pointId: string; ideaKeys: string[] }>
}

function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
    Object.keys(value).length !== keys.length || Object.keys(value).some(key => !keys.includes(key))) {
    throw new Error('Invalid preset point-idea fields.')
  }
  return value as Record<string, unknown>
}

/** Reviewed identity for every matching pair or blank in a multi-blank question.
 * This validates captured metadata, not publication or current database authority.
 */
export function parsePresetPointIdeas(question: DomainQuestion, revisionId: string, value: unknown): PresetPointIdeas {
  assertDomainQuestion(question)
  if (!isUuid(revisionId) || question.unit < 1 || question.unit > 4 ||
    !(question.type === 'matching' || (question.type === 'completion' && question.content.blankIds.length > 1))) {
    throw new Error('Point-level preset review requires a matching or multi-blank question in initial Units 1-4.')
  }
  const input = record(value, ['schemaVersion', 'revisionId', 'points'])
  const pointIds = questionPointIds(question)
  if (input.schemaVersion !== 1 || input.revisionId !== revisionId || !Array.isArray(input.points) ||
    input.points.length !== pointIds.length || pointIds.length < 1 || pointIds.length > 200 ||
    JSON.stringify(input).length > 100_000) {
    throw new Error('Review every source point on the exact revision without dropping or adding a point.')
  }
  const points = input.points.map((value, index) => {
    const point = record(value, ['pointId', 'ideaKeys'])
    if (point.pointId !== pointIds[index] || !Array.isArray(point.ideaKeys) ||
      point.ideaKeys.length < 1 || point.ideaKeys.length > 20 || new Set(point.ideaKeys).size !== point.ideaKeys.length ||
      point.ideaKeys.some(key => typeof key !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,119}$/.test(key))) {
      throw new Error('Preserve source point order and supply distinct reviewed meaning keys for every point.')
    }
    return { pointId: point.pointId as string, ideaKeys: [...point.ideaKeys] as string[] }
  })
  return { schemaVersion: 1, revisionId, points }
}

/** Readiness excludes internal repeats; metadata may still record the true repeat.
 * Context keys come from the protected source projection, never from answer equality.
 */
export function presetPointSelectionKeys(question: DomainQuestion, revisionId: string, value: unknown,
  contextKeys: readonly string[]): string[] {
  const mapping = parsePresetPointIdeas(question, revisionId, value)
  if (!Array.isArray(contextKeys) || contextKeys.length < 1 || contextKeys.length > 20 ||
    contextKeys.filter(key => typeof key === 'string' && key.startsWith('wording:')).length !== 1 ||
    contextKeys.some(key => typeof key !== 'string' || !/^(wording|family):[a-f0-9]{32}$/.test(key)) ||
    new Set(contextKeys).size !== contextKeys.length) throw new Error('Exact source wording and family identities are required.')
  const ideas = mapping.points.flatMap(point => point.ideaKeys)
  if (new Set(ideas).size !== ideas.length) {
    throw new Error('The complete question repeats a reviewed idea across its displayed points.')
  }
  const keys = [...ideas.map(key => `idea:${key}`), ...contextKeys]
  questionSelectionKeys({ ...question, selectionKeys: keys })
  return keys
}
