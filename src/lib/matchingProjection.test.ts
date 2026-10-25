import { expect, it } from 'vitest'
import type { DomainQuestion } from '../domain/questionDomain'
import { projectMatching } from './matchingProjection'

// Q2-B: Papers/representative/Exam_002.docx and Answers_001.docx.
const source: Extract<DomainQuestion, { type: 'matching' }> = {
  id: '11111111-1111-4111-8111-111111111111', ownerId: '22222222-2222-4222-8222-222222222222',
  bankId: '33333333-3333-4333-8333-333333333333', externalId: 'Q2-B', unit: 1, lesson: 'representative',
  difficulty: 'medium', prompt: 'Match the question in list ( A ) with their answer in list  ( B )',
  marks: 10, isActive: true, revision: 1, type: 'matching', schemaVersion: 1,
  content: { type: 'matching', schemaVersion: 1,
    left: [
      { id: 'l1', text: 'Can I help you?' },
      { id: 'l2', text: "What's the matter?" },
      { id: 'l3', text: "What's your dad job?" },
      { id: 'l4', text: 'My leg is broken?' },
      { id: 'l5', text: 'Where’s the watches shop?' },
    ],
    right: [
      { id: 'r1', text: 'I have a headache' },
      { id: 'r2', text: "Yes, please. I'm looking for dress" },
      { id: 'r3', text: "It's on the first floor" },
      { id: 'r4', text: 'My dad is a teacher' },
      { id: 'r5', text: 'You shouldn’t stand on it.' },
    ] },
  answer: { type: 'matching', schemaVersion: 1, pairs: [
    { leftId: 'l1', rightId: 'r2' }, { leftId: 'l2', rightId: 'r1' },
    { leftId: 'l3', rightId: 'r4' }, { leftId: 'l4', rightId: 'r5' },
    { leftId: 'l5', rightId: 'r3' },
  ] },
}

it('keeps source pair identities and answer meaning after reproducible List B shuffling', () => {
  const first = projectMatching(source, 8162026)
  expect(projectMatching(structuredClone(source), 8162026)).toEqual(first)
  const reorderedPairs = structuredClone(source)
  reorderedPairs.answer.pairs.reverse()
  expect(projectMatching(reorderedPairs, 8162026)).toEqual(first)
  expect(first.left.map((item) => item.text)).toEqual(source.content.left.map((item) => item.text))
  expect(first.answerKey.map((pair) => pair.rightId)).toEqual(['r2', 'r1', 'r4', 'r5', 'r3'])
  expect(first.answerKey.map((pair) => first.right.find((item) => item.id === pair.rightId)?.text)).toEqual([
    "Yes, please. I'm looking for dress", 'I have a headache', 'My dad is a teacher',
    'You shouldn’t stand on it.', "It's on the first floor",
  ])
  expect(first.answerKey.every((pair) => first.right['abcdefghijklmnopqrstuvwxyz'.indexOf(pair.displayLetter)].id === pair.rightId)).toBe(true)
  expect(new Set(first.right.map((item) => item.id)).size).toBe(5)
})

it('rejects distractors, reused targets and invalid seeds before projection', () => {
  const extra = structuredClone(source)
  extra.content.right.push({ id: 'r6', text: 'Unused answer' })
  expect(() => projectMatching(extra, 1)).toThrow('Invalid matching')
  const duplicate = structuredClone(source)
  duplicate.answer.pairs[1].rightId = 'r2'
  expect(() => projectMatching(duplicate, 1)).toThrow('Invalid matching')
  expect(() => projectMatching(source, -1)).toThrow('seed')
})
