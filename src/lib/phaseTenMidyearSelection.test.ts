import { expect, it } from 'vitest'
import type { DomainQuestion } from '../domain/questionDomain'
import { makeExam002Candidate } from './fixtures/phaseTenExam002Candidate'
import { projectCompoundPaper } from './compoundWorkflow'
import { selectExam002MidyearCandidate } from './phaseTenMidyearSelection'
import { PHASE_TEN_CANDIDATE_PROFILE_ID, PHASE_TEN_GENERAL_INSTRUCTION,
  PHASE_TEN_MIDYEAR_UNITS, parsePhaseTenTeacherIntent } from './phaseTenTeacherWorkflow'

const source = makeExam002Candidate('tissue')
const id = (n: number) => `99999999-9999-4999-8999-${String(n).padStart(12, '0')}`
const original = source.branches.flatMap((branch) => branch.items.map((item) => item.question))
const by = (branch: number, item: number) => source.branches[branch].items[item].question
function copy(question: DomainQuestion, n: number, externalId: string, unit: number): DomainQuestion {
  return { ...structuredClone(question), id: id(n), externalId, unit }
}

const extra: DomainQuestion[] = [
  copy(by(1, 0), 1, 'CAT-Q-0156', 2),
  copy(by(1, 1), 2, 'CAT-Q-0078', 3),
  copy(by(3, 0), 3, 'CAT-Q-0442', 1),
  copy(by(4, 0), 4, 'CAT-Q-0517', 1),
  copy(by(6, 0), 5, 'CAT-Q-0141', 1),
  copy(by(7, 0), 6, 'CAT-Q-0068', 3),
  copy(by(8, 0), 7, 'CAT-Q-0753', 3),
  copy(by(8, 0), 9, 'CAT-Q-0042', 1),
  copy(by(5, 0), 8, 'CAT-GRP-0083', 2),
  ...(['CAT-Q-0055', 'CAT-Q-0079'] as const).map((externalId, index) =>
    copy(by(1, 4), 10 + index, externalId, 3)),
  ...(['CAT-Q-2770', 'CAT-Q-2779'] as const).map((externalId, index) =>
    copy(by(1, 5), 12 + index, externalId, 4)),
  ...(['CAT-Q-0008', 'CAT-Q-0157', 'CAT-Q-0159', 'CAT-Q-0189'] as const).map((externalId, index) =>
    copy(by(2, index), 20 + index, externalId, 2)),
  ...(['CAT-Q-0056', 'CAT-Q-0058', 'CAT-Q-0081', 'CAT-Q-0082'] as const).map((externalId, index) =>
    copy(by(2, index), 24 + index, externalId, 3)),
  ...(['CAT-Q-0001', 'CAT-Q-0002', 'CAT-Q-0003', 'CAT-Q-0004'] as const).map((externalId, index) =>
    copy(by(1, 0), 30 + index, externalId, 2)),
  copy(by(1, 1), 34, 'CAT-Q-0051', 3),
  copy(by(3, 0), 35, 'CAT-Q-0215', 2),
  copy(by(4, 0), 36, 'CAT-Q-0302', 1),
  copy(by(5, 0), 37, 'CAT-GRP-0074', 2),
  copy(by(6, 0), 38, 'CAT-Q-0014', 1),
  ...(['CAT-Q-0136', 'CAT-Q-0137', 'CAT-Q-0138', 'CAT-Q-0139', 'CAT-Q-0140'] as const).map((externalId, index) =>
    copy(by(7, index), 40 + index, externalId, 1)),
  copy(by(7, 5), 45, 'CAT-Q-0176', 2),
  copy(by(8, 0), 46, 'CAT-Q-0181', 1),
  copy(by(8, 1), 47, 'CAT-Q-0075', 3),
]
const firstGroup = source.branches[0].passageGroup!
const secondGroup = { ...structuredClone(firstGroup), id: id(100), title: 'Online safety',
  children: firstGroup.children.map((child, index) => ({ position: child.position,
    question: copy(child.question, 101 + index, `P10D-ONLINE-${index + 1}`, 3) })) }
const pool = [...original, ...extra, ...secondGroup.children.map((child) => child.question)]
const groups = [firstGroup, secondGroup]

it('selects a deterministic 60-mark paper with all four units and intact passage membership', () => {
  const first = selectExam002MidyearCandidate(pool, groups, source.ownerId, source.bankId, 17)
  const reordered = selectExam002MidyearCandidate([...pool].reverse(), [...groups].reverse(), source.ownerId, source.bankId, 17)
  expect(first).toEqual(reordered)
  expect(first.totalMarks).toBe(60)
  expect(new Set(first.branches.flatMap((branch) => branch.items.map((item) => item.question.unit)))).toEqual(new Set([1, 2, 3, 4]))
  expect(first.branches[0].items.map((item) => item.question.id)).toEqual(
    first.branches[0].passageGroup?.children.map((child) => child.question.id))
  expect(new Set(first.branches.flatMap((branch) => branch.items.map((item) => item.question.id))).size).toBe(30)
  expect(['CAT-Q-0042', 'CAT-Q-0181']).toContain(first.branches[8].items[0].question.externalId)
  expect(['CAT-Q-0075', 'CAT-Q-0753']).toContain(first.branches[8].items[1].question.externalId)
  const settings = { schoolName: 'Anonymous', examTitle: 'Mid-Year', teacherName: '', grade: 6, unit: 1,
    marksPerQuestion: 1, questionCount: 30, selectionSeed: 17 }
  const intent = parsePhaseTenTeacherIntent({ schemaVersion: 1, profileId: PHASE_TEN_CANDIDATE_PROFILE_ID,
    rendererVersion: 1, ownerId: source.ownerId, bankId: source.bankId,
    generalInstruction: PHASE_TEN_GENERAL_INSTRUCTION, coverageUnits: PHASE_TEN_MIDYEAR_UNITS,
    settings, snapshot: first })
  expect(projectCompoundPaper(first, settings, intent.generalInstruction, intent.coverageUnits).answerKey.Answers.length).toBeGreaterThan(30)
  expect(() => parsePhaseTenTeacherIntent({ ...intent, coverageUnits: [1, 2, 3] })).toThrow('exactly Units 1–4')
  expect(() => parsePhaseTenTeacherIntent({ ...intent, selectionControls: {
    excludedQuestionIds: [first.branches[1].items[0].question.id],
  } })).toThrow('disagree')
  expect(parsePhaseTenTeacherIntent({ ...intent, selectionControls: {
    lockedQuestionIds: { 'q1b:5': first.branches[1].items[4].question.id },
  } }).selectionControls?.lockedQuestionIds?.['q1b:5']).toBe(first.branches[1].items[4].question.id)
})

it('honors a locked passage, a locked question, and exclusions without losing unit coverage', () => {
  const locked = selectExam002MidyearCandidate(pool, groups, source.ownerId, source.bankId, 17, {
    lockedPassageGroupId: secondGroup.id,
    lockedQuestionIds: { 'q1b:5': id(10) },
    excludedQuestionIds: [id(12), id(20)],
  })
  expect(locked.branches[0].passageGroup?.id).toBe(secondGroup.id)
  expect(locked.branches[1].items[4].question.id).toBe(id(10))
  expect(locked.branches.flatMap((branch) => branch.items.map((item) => item.question.id))).not.toContain(id(12))
  expect(locked.branches.flatMap((branch) => branch.items.map((item) => item.question.id))).not.toContain(id(20))
  expect(() => selectExam002MidyearCandidate(pool, groups, source.ownerId, source.bankId, 17, {
    excludedQuestionIds: [id(12), id(13)],
  })).toThrow('No eligible owned question remains for q1b:6')
})
