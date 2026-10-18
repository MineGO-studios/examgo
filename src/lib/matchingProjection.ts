import { validateDomainQuestion, type DomainQuestion, type MatchingItem } from '../domain/questionDomain'

type MatchingQuestion = Extract<DomainQuestion, { type: 'matching' }>

export interface MatchingProjection {
  questionId: string
  questionRevision: number
  seed: number
  left: MatchingItem[]
  right: MatchingItem[]
  answerKey: Array<{ leftId: string; rightId: string; displayLetter: string }>
}

function seedForQuestion(seed: number, id: string): number {
  let hash = seed >>> 0
  for (let index = 0; index < id.length; index++) hash = Math.imul(hash ^ id.charCodeAt(index), 16777619) >>> 0
  return hash
}

function randomFromSeed(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

export function projectMatching(question: MatchingQuestion, seed: number): MatchingProjection {
  const validation = validateDomainQuestion(question)
  if (!validation.success) throw new Error(`Invalid matching question: ${validation.issues[0].message}`)
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('A valid saved matching seed is required.')

  const right = question.content.right.map((item) => ({ ...item }))
  const random = randomFromSeed(seedForQuestion(seed, question.id))
  for (let index = right.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1))
    ;[right[index], right[swap]] = [right[swap], right[index]]
  }
  const letterById = new Map(right.map((item, index) => [item.id, String.fromCharCode(97 + index)]))
  return {
    questionId: question.id, questionRevision: question.revision, seed,
    left: question.content.left.map((item) => ({ ...item })), right,
    answerKey: question.content.left.map((item) => {
      const pair = question.answer.pairs.find((candidate) => candidate.leftId === item.id)!
      return { ...pair, displayLetter: letterById.get(pair.rightId)! }
    }),
  }
}
