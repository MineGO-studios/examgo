import { expect, it } from 'vitest'
import { duplicateExamBlueprintIntent, EXAM_BLUEPRINT_PROFILE_ID, parseExamBlueprintIntent } from './examBlueprintWorkflow'

function intent() {
  const id = '11111111-1111-4111-8111-111111111111'
  return { schemaVersion: 1, profileId: EXAM_BLUEPRINT_PROFILE_ID, rendererVersion: 1,
    settings: { schoolName: 'Synthetic school', examTitle: 'Monthly paper', teacherName: '', grade: 6 },
    generalInstruction: 'Follow each question instruction.',
    blueprint: { schemaVersion: 1, version: 1, ownerId: id, bankIds: [id], selectionSeed: 42, totalMarks: 4,
      branches: [{ id: 'question-1-b', mainQuestionNumber: 1, branchLabel: 'B', kind: 'questions',
        instruction: 'Answer the questions.', arabicInstruction: null, questionTypes: ['short-answer'],
        quantity: 5, displayedPointCount: 5, answerRule: { kind: 'points', pointsToAnswer: 4 },
        marks: 4, distribution: { mode: 'equal' }, units: [8], lessons: [], difficulties: [],
        includedQuestionIds: [], excludedQuestionIds: [], lockedQuestionIds: [] }] } }
}

it('round-trips reusable placement, Points to answer, marks and filters without capturing selected source content', () => {
  const value = intent(); const before = structuredClone(value)
  const parsed = parseExamBlueprintIntent(JSON.parse(JSON.stringify(value)))
  expect(parsed).toEqual(value)
  expect(parsed).not.toHaveProperty('snapshot')
  parsed.blueprint.branches[0].units.push(1)
  expect(value).toEqual(before)
})

it('rejects a stale captured snapshot smuggled into an editable configuration', () => {
  expect(() => parseExamBlueprintIntent({ ...intent(), snapshot: {} })).toThrow('unsupported format')
  const value = intent()
  expect(() => parseExamBlueprintIntent({ ...value, settings: { ...value.settings, selectionSeed: 99 } })).toThrow('teacher details')
  expect(() => parseExamBlueprintIntent({ ...value, blueprint: { ...value.blueprint, snapshot: {} } })).toThrow('unsupported captured content')
  const branch = value.blueprint.branches[0]
  expect(() => parseExamBlueprintIntent({ ...value, blueprint: { ...value.blueprint, branches: [{ ...branch, questions: [] }] } })).toThrow('unsupported captured content')
})

it('rejects unsupported versions, invalid headers and count conflicts before a save request', () => {
  for (const value of [null, { ...intent(), rendererVersion: 2 }, { ...intent(), profileId: 'legacy' }]) {
    expect(() => parseExamBlueprintIntent(value)).toThrow('unsupported format')
  }
  const value = intent(); value.settings.schoolName = ''
  expect(() => parseExamBlueprintIntent(value)).toThrow('School name')
  const wrongCount = intent(); wrongCount.blueprint.branches[0].answerRule.pointsToAnswer = 0
  expect(() => parseExamBlueprintIntent(wrongCount)).toThrow('Points to answer')
  expect(() => parseExamBlueprintIntent({ ...intent(), generalInstruction: ' ' })).toThrow('general paper instruction')
  const overflow = intent(); overflow.blueprint.version = 2147483648
  expect(() => parseExamBlueprintIntent(overflow)).toThrow('version')
})

it('duplicates a configuration with version one and no captured snapshot without changing the original', () => {
  const original = parseExamBlueprintIntent(intent()); original.blueprint.version = 6
  original.settings.examTitle = 'A'.repeat(80)
  const before = structuredClone(original), copied = duplicateExamBlueprintIntent(original)
  expect(copied.blueprint).toEqual({ ...original.blueprint, version: 1 })
  expect(copied.settings.examTitle).toHaveLength(80)
  expect(copied.settings.examTitle).toContain('(copy)')
  expect(copied).not.toHaveProperty('snapshot')
  copied.blueprint.branches[0].units.push(1)
  expect(original).toEqual(before)
})
