import { validatePassageGroup, type PassageGroup } from '../domain/passageGroup'
import type { CompoundSnapshot } from '../domain/compoundStructure'
import type { DomainQuestion } from '../domain/questionDomain'
import { canonicalJson, canonicalQuestionCandidates } from './canonicalQuestionCandidates'
import { makeExam002Candidate } from './fixtures/phaseTenExam002Candidate'
import { parseExam002CandidateSnapshot } from './phaseTenCandidateProfile'
import { selectQuestions } from './selectQuestions'

const source = makeExam002Candidate('tissue')

export function selectExam002Candidate(
  questions: readonly DomainQuestion[], groups: readonly PassageGroup[],
  ownerId: string, bankId: string, seed: number,
): CompoundSnapshot {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('A valid saved paper seed is required.')
  const pool = canonicalQuestionCandidates(questions).filter((question) =>
    question.ownerId === ownerId && question.bankId === bankId && question.unit === 1)
  const passageReference = source.branches[0]
  const eligibleGroups = groups.filter((group) => {
    const validation = validatePassageGroup(group)
    if (!validation.success || group.ownerId !== ownerId || group.bankId !== bankId ||
      group.instruction !== passageReference.instruction || group.arabicInstruction !== passageReference.arabicInstruction ||
      group.attemptCount !== passageReference.attemptCount || group.expectedMarks !== passageReference.marks ||
      group.children.length !== passageReference.items.length) return false
    return group.children.every((child, index) => {
      const current = pool.find((question) => question.id === child.question.id)
      return current && current.unit === 1 && current.type === passageReference.items[index].question.type &&
        current.marks === passageReference.items[index].question.marks && canonicalJson(current) === canonicalJson(child.question)
    })
  }).sort((a, b) => a.id.localeCompare(b.id))
  if (!eligibleGroups.length) throw new Error('No current owned passage fits the Exam_002 candidate Q1/A slot.')
  const group = eligibleGroups[seed % eligibleGroups.length]
  const selected = new Set(group.children.map((child) => child.question.id))
  const branches = source.branches.map((reference, branchIndex) => {
    const branch = structuredClone(reference)
    if (branchIndex === 0) {
      branch.passageGroup = structuredClone(group)
      branch.items = group.children.map((child, index) => ({ label: reference.items[index].label, question: structuredClone(child.question) }))
      return branch
    }
    branch.items = reference.items.map((slot, slotIndex) => {
      const candidates = pool.filter((question) => !selected.has(question.id) &&
        question.type === slot.question.type && question.marks === slot.question.marks &&
        (question.type !== 'matching' && question.type !== 'rewrite' || question.prompt === slot.question.prompt) &&
        (question.type !== 'matching' || (slot.question.type === 'matching' &&
          question.content.left.length === slot.question.content.left.length && question.content.right.length === slot.question.content.right.length)) &&
        (question.type !== 'completion' || (slot.question.type === 'completion' &&
          question.content.blankIds.length === slot.question.content.blankIds.length)) &&
        (question.type !== 'rewrite' || question.content.instruction === reference.instruction))
      if (!candidates.length) throw new Error(`No eligible owned question remains for Q${reference.mainQuestionNumber}/${reference.branchLabel ?? ''} slot ${slotIndex + 1}.`)
      const question = selectQuestions(candidates, { unit: 1, type: slot.question.type, count: 1,
        seed: (seed + branchIndex * 1_000_003 + slotIndex * 65_537) >>> 0 })[0]
      selected.add(question.id)
      return { label: slot.label, question: structuredClone(question) }
    })
    return branch
  })
  return parseExam002CandidateSnapshot({ schemaVersion: 1, ownerId, bankId, selectionSeed: seed,
    totalMarks: source.totalMarks, branches })
}
