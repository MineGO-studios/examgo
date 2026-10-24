import { assertDomainQuestion, type DomainQuestion } from '../domain/questionDomain'

// JSON object key order is not semantic. Array order is (options, blanks, etc.).
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value).filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export function canonicalQuestionCandidates<Q extends DomainQuestion>(questions: readonly Q[]): Q[] {
  const latest = new Map<string, Q>()
  const revisions = new Map<string, string>()
  for (const question of questions) {
    assertDomainQuestion(question)
    const key = `${question.id}:${question.revision}`
    const encoded = canonicalJson(question)
    const previous = revisions.get(key)
    if (previous !== undefined && previous !== encoded) {
      throw new Error(`Conflicting contents for question ${question.id}, revision ${question.revision}. Reload the bank.`)
    }
    revisions.set(key, encoded)
    const current = latest.get(question.id)
    if (!current || current.revision < question.revision) latest.set(question.id, question)
  }
  // Resolve revisions before eligibility: withdrawal cannot revive an old revision.
  return [...latest.values()].filter((q) => q.isActive)
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}
