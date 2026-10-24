import { expect, it } from 'vitest'
import { makeExam002Candidate } from './fixtures/phaseTenExam002Candidate'
import { PHASE_TEN_CANDIDATE_PROFILE_ID, PHASE_TEN_GENERAL_INSTRUCTION, parsePhaseTenTeacherIntent } from './phaseTenTeacherWorkflow'
import { assignCandidateExamMarks } from './phaseTenCandidateProfile'

function intent() {
  const snapshot = makeExam002Candidate('tissue')
  return { schemaVersion: 1, profileId: PHASE_TEN_CANDIDATE_PROFILE_ID, rendererVersion: 1,
    ownerId: snapshot.ownerId, bankId: snapshot.bankId, generalInstruction: PHASE_TEN_GENERAL_INSTRUCTION,
    settings: { schoolName: 'Anonymous', examTitle: 'Mid-Year', teacherName: '', grade: 6, unit: 1,
      marksPerQuestion: 1, questionCount: 30, selectionSeed: snapshot.selectionSeed }, snapshot }
}

it('captures a versioned candidate intent with every branch and exact question revision', () => {
  const saved = parsePhaseTenTeacherIntent(intent())
  expect(saved.snapshot.branches).toHaveLength(9)
  expect(saved.snapshot.totalMarks).toBe(60)
  expect(parsePhaseTenTeacherIntent(JSON.parse(JSON.stringify(saved)))).toEqual(saved)
})

it('rejects a mismatched seed, owner, free quantity or altered branch', () => {
  const seed = intent(); seed.settings.selectionSeed++
  expect(() => parsePhaseTenTeacherIntent(seed)).toThrow('disagree')
  const owner = intent(); owner.ownerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  expect(() => parsePhaseTenTeacherIntent(owner)).toThrow('disagree')
  const quantity = { ...intent(), settings: { ...intent().settings, questionQuantities: { 'multiple-choice': 30, binary: 0, 'short-answer': 0 } } }
  expect(() => parsePhaseTenTeacherIntent(quantity)).toThrow('disagree')
  const branch = intent(); branch.snapshot.branches[8].items[1].label = 'C'
  expect(() => parsePhaseTenTeacherIntent(branch)).toThrow('Alternatives')
})

it('round-trips version 2 teacher scoring and rejects a mismatched historical envelope', () => {
  const original = intent()
  const snapshot = assignCandidateExamMarks(original.snapshot, [original.bankId],
    Object.fromEntries(original.snapshot.branches.map((branch) => [branch.id,
      { totalMarks: branch.marks, distribution: { mode: 'equal' } }])))
  const scored = { ...original, schemaVersion: 2, snapshot }
  expect(parsePhaseTenTeacherIntent(JSON.parse(JSON.stringify(scored)))).toEqual(scored)
  expect(() => parsePhaseTenTeacherIntent({ ...scored, schemaVersion: 1 })).toThrow('versions disagree')
  expect(() => parsePhaseTenTeacherIntent({ ...original, schemaVersion: 2 })).toThrow('versions disagree')
})
