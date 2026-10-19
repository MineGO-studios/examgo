import { validatePassageGroup, type PassageGroup } from '../domain/passageGroup'
import type { CompoundSnapshot } from '../domain/compoundStructure'
import type { DomainQuestion } from '../domain/questionDomain'
import { canonicalJson, canonicalQuestionCandidates } from './canonicalQuestionCandidates'
import { makeExam002Candidate } from './fixtures/phaseTenExam002Candidate'
import { parseExam002CandidateSnapshot } from './phaseTenCandidateProfile'
import { selectQuestions } from './selectQuestions'

const reference = makeExam002Candidate('tissue')
const mcqOne = [new Set(['CAT-Q-0055', 'CAT-Q-0079']), new Set(['CAT-Q-2770', 'CAT-Q-2779'])]
const mcqTwo = [
  new Set(['CAT-Q-0008', 'CAT-Q-0157', 'CAT-Q-0159', 'CAT-Q-0189']),
  new Set(['CAT-Q-0056', 'CAT-Q-0058', 'CAT-Q-0081', 'CAT-Q-0082']),
]
const binary = new Set(['CAT-Q-0156', 'CAT-Q-0001', 'CAT-Q-0002', 'CAT-Q-0003', 'CAT-Q-0004'])
const short = new Set(['CAT-Q-0078', 'CAT-Q-0051'])
const matchingTen = new Set(['CAT-Q-0442', 'CAT-Q-0215'])
const matchingFive = new Set(['CAT-Q-0517', 'CAT-Q-0302'])
const completion = new Set(['CAT-GRP-0083', 'CAT-GRP-0074'])
const rewrite = new Set(['CAT-Q-0141', 'CAT-Q-0014'])
const relationship = new Set(['CAT-Q-0068', 'CAT-Q-0136', 'CAT-Q-0137', 'CAT-Q-0138',
  'CAT-Q-0139', 'CAT-Q-0140', 'CAT-Q-0176'])
const writingA = new Set(['CAT-Q-0042', 'CAT-Q-0181'])
const writingB = new Set(['CAT-Q-0753', 'CAT-Q-0075'])
const additional = new Set([...binary, ...short, ...matchingTen, ...matchingFive,
  ...completion, ...rewrite, ...relationship, ...writingA, ...writingB])

function reviewedUnit(externalId: string): number | null {
  if (/^Q1-A-[1-6]$/.test(externalId) || matchingFive.has(externalId) || rewrite.has(externalId) ||
    writingA.has(externalId) || externalId === 'CAT-Q-0442' ||
    ['CAT-Q-0136', 'CAT-Q-0137', 'CAT-Q-0138', 'CAT-Q-0139', 'CAT-Q-0140'].includes(externalId)) return 1
  if (binary.has(externalId) || completion.has(externalId) || externalId === 'CAT-Q-0215' ||
    externalId === 'CAT-Q-0176' || mcqTwo[0].has(externalId)) return 2
  if (/^P10D-ONLINE-[1-6]$/.test(externalId) || short.has(externalId) ||
    writingB.has(externalId) || externalId === 'CAT-Q-0068' || mcqOne[0].has(externalId) ||
    mcqTwo[1].has(externalId)) return 3
  if (mcqOne[1].has(externalId)) return 4
  return null
}

export interface MidyearSelectionControls {
  excludedQuestionIds?: readonly string[]
  excludedPassageGroupIds?: readonly string[]
  lockedQuestionIds?: Readonly<Record<string, string>>
  lockedPassageGroupId?: string
}

function slotKey(branchId: string, label: string) { return `${branchId}:${label}` }

export function selectExam002MidyearCandidate(
  questions: readonly DomainQuestion[], groups: readonly PassageGroup[],
  ownerId: string, bankId: string, seed: number, controls: MidyearSelectionControls = {},
): CompoundSnapshot {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('A valid saved paper seed is required.')
  const excluded = new Set(controls.excludedQuestionIds ?? [])
  const excludedGroups = new Set(controls.excludedPassageGroupIds ?? [])
  const locks = controls.lockedQuestionIds ?? {}
  if (excluded.size !== (controls.excludedQuestionIds ?? []).length ||
    excludedGroups.size !== (controls.excludedPassageGroupIds ?? []).length) {
    throw new Error('Selection exclusions contain a duplicate identity.')
  }
  const validSlots = new Set(reference.branches.flatMap((branch) => branch.items.map((item) => slotKey(branch.id, item.label))))
  for (const key of Object.keys(locks)) if (!validSlots.has(key) || key.startsWith('q1a:')) {
    throw new Error(`Unsupported locked slot: ${key}. Lock the whole Q1/A passage group instead.`)
  }
  const current = canonicalQuestionCandidates(questions).filter((question) =>
    question.ownerId === ownerId && question.bankId === bankId)
  if ([...excluded].some((id) => !current.some((question) => question.id === id)) ||
    [...excludedGroups].some((id) => !groups.some((group) => group.id === id && group.ownerId === ownerId && group.bankId === bankId))) {
    throw new Error('An excluded question or passage is missing from the current owned bank.')
  }
  const pool = current.filter((question) =>
    question.unit === reviewedUnit(question.externalId) &&
    !excluded.has(question.id) && (/^Q1-A-[1-6]$/.test(question.externalId) ||
      /^P10D-ONLINE-[1-6]$/.test(question.externalId) ||
      additional.has(question.externalId) || mcqOne.some((ids) => ids.has(question.externalId)) ||
      mcqTwo.some((ids) => ids.has(question.externalId))))
  const groupedChildIds = new Set(groups.flatMap((group) => group.children.map((child) => child.question.id)))
  const passageReference = reference.branches[0]
  const eligibleGroups = groups.filter((group) => {
    const validation = validatePassageGroup(group)
    if (!validation.success || group.ownerId !== ownerId || group.bankId !== bankId ||
      excludedGroups.has(group.id) || group.instruction !== passageReference.instruction ||
      group.arabicInstruction !== passageReference.arabicInstruction ||
      group.attemptCount !== passageReference.attemptCount || group.expectedMarks !== passageReference.marks ||
      group.children.length !== passageReference.items.length) return false
    return group.children.every((child, index) => {
      const current = pool.find((question) => question.id === child.question.id)
      return current && current.type === 'short-answer' && current.marks === 1 &&
        current.unit === group.children[0].question.unit &&
        passageReference.items[index].question.type === current.type &&
        canonicalJson(current) === canonicalJson(child.question)
    })
  }).sort((a, b) => a.id.localeCompare(b.id))
  const passageChoices = controls.lockedPassageGroupId
    ? eligibleGroups.filter((group) => group.id === controls.lockedPassageGroupId) : eligibleGroups
  if (!passageChoices.length) throw new Error('No current owned passage fits the mid-year Q1/A slot and controls.')
  const group = passageChoices[seed % passageChoices.length]
  const selected = new Set(group.children.map((child) => child.question.id))
  const branches = reference.branches.map((branchReference, branchIndex) => {
    const branch = structuredClone(branchReference)
    if (branchIndex === 0) {
      branch.passageGroup = structuredClone(group)
      branch.items = group.children.map((child, index) => ({ label: branchReference.items[index].label,
        question: structuredClone(child.question) }))
      return branch
    }
    branch.items = branchReference.items.map((slot, slotIndex) => {
      const key = slotKey(branch.id, slot.label)
      const unit = branch.id === 'q1b' && slotIndex >= 4 ? (slotIndex === 4 ? 3 : 4)
        : branch.id === 'q2a' ? (slotIndex < 3 ? 2 : 3) : undefined
      const allowedMcq = branch.id === 'q1b' && slotIndex >= 4 ? mcqOne[slotIndex - 4]
        : branch.id === 'q2a' ? mcqTwo[slotIndex < 3 ? 0 : 1] : undefined
      const candidates = pool.filter((question) => !selected.has(question.id) &&
        !(question.type === 'short-answer' && groupedChildIds.has(question.id)) &&
        question.type === slot.question.type && question.marks === slot.question.marks &&
        (unit === undefined || question.unit === unit) &&
        (!allowedMcq || allowedMcq.has(question.externalId)) &&
        (branch.id !== 'q1b' || slotIndex >= 4 || (slotIndex === 1 ? short : binary).has(question.externalId)) &&
        (branch.id !== 'q2b' || matchingTen.has(question.externalId)) &&
        (branch.id !== 'q3a' || matchingFive.has(question.externalId)) &&
        (branch.id !== 'q3b' || completion.has(question.externalId)) &&
        (branch.id !== 'q4a' || rewrite.has(question.externalId)) &&
        (branch.id !== 'q4b' || relationship.has(question.externalId)) &&
        (branch.id !== 'q5' || (slotIndex === 0 ? writingA : writingB).has(question.externalId)) &&
        (question.type !== 'matching' || slot.question.type === 'matching' &&
          question.content.left.length === slot.question.content.left.length &&
          question.content.right.length === slot.question.content.right.length) &&
        (question.type !== 'completion' || slot.question.type === 'completion' &&
          question.content.blankIds.length === slot.question.content.blankIds.length) &&
        (question.type !== 'rewrite' || question.content.instruction === branch.instruction))
      const lockedId = locks[key]
      const choices = lockedId ? candidates.filter((question) => question.id === lockedId) : candidates
      if (!choices.length) throw new Error(`No eligible owned question remains for ${key}. Review exclusions, locks and supply.`)
      const picked = selectQuestions(choices.map((question) => ({ ...question, unit: 0 })), {
        unit: 0, type: slot.question.type, count: 1,
        seed: (seed + branchIndex * 1_000_003 + slotIndex * 65_537) >>> 0 })[0]
      const question = choices.find((candidate) => candidate.id === picked.id)!
      selected.add(question.id)
      return { label: slot.label, question: structuredClone(question) }
    })
    return branch
  })
  const snapshot = parseExam002CandidateSnapshot({ schemaVersion: 1, ownerId, bankId,
    selectionSeed: seed, totalMarks: reference.totalMarks, branches })
  const units = new Set(snapshot.branches.flatMap((branch) => branch.items.map((item) => item.question.unit)))
  if ([1, 2, 3, 4].some((unit) => !units.has(unit))) throw new Error('A mid-year paper must contain at least one question from each Unit 1–4.')
  return snapshot
}
