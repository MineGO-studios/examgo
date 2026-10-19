import { expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import { compoundBranchPointIds } from '../domain/compoundStructure'
import { makeExam002Candidate } from './fixtures/phaseTenExam002Candidate'
import { parseExamBlueprint, selectBlueprintPaper, type BlueprintPool, type ExamBlueprint } from './examBlueprint'
import { assignBlueprintMarks, clearBlueprintOrder, getBlueprintReplacementChoices, moveBlueprintQuestion, removeBlueprintSelection,
  replaceBlueprintQuestion, toggleBlueprintLock } from './examBlueprintReview'
import { createCompoundDocumentBlobs, projectCompoundPaper } from './compoundWorkflow'
import { inspectDocx } from './testSupport/docxPackage'

function fixture() {
  const source = structuredClone(makeExam002Candidate('tissue'))
  const questions = source.branches.flatMap(b => b.items.map(i => i.question))
  const pool: BlueprintPool = { bankIds: [source.bankId], questions, passages: [source.branches[0].passageGroup!],
    completionGroups: [], standaloneQuestionIds: questions.map(q => q.id) }
  const blueprint: ExamBlueprint = { schemaVersion: 1, version: 1, ownerId: source.ownerId, bankIds: [source.bankId],
    selectionSeed: 42, totalMarks: source.totalMarks, branches: source.branches.map(b => ({
      id: b.id, mainQuestionNumber: b.mainQuestionNumber, branchLabel: b.branchLabel, kind: b.kind,
      instruction: b.instruction, arabicInstruction: b.arabicInstruction, questionTypes: [...new Set(b.items.map(i => i.question.type))],
      quantity: b.items.length, displayedPointCount: compoundBranchPointIds(b).length,
      answerRule: b.kind === 'alternatives' ? { kind: 'choose-one' } : b.id === 'q4a' ? { kind: 'task' } : { kind: 'points', pointsToAnswer: b.attemptCount },
      marks: b.marks, distribution: { mode: 'equal' }, units: [1], lessons: [], difficulties: [],
      includedQuestionIds: b.items.map(i => i.question.id), excludedQuestionIds: [], lockedQuestionIds: [],
    })) }
  return { pool, blueprint, snapshot: selectBlueprintPaper(blueprint, pool) }
}

it('moves only within the branch and reproduces exact selected order after configuration roundtrip', () => {
  const { blueprint, snapshot, pool } = fixture(), before = structuredClone({ blueprint, snapshot, pool })
  const branch = snapshot.branches.find(b => b.kind === 'questions' && b.items.length > 1)!
  blueprint.branches.find(b => b.id === branch.id)!.lockedQuestionIds = [branch.items[0].question.id]
  const changed = moveBlueprintQuestion(blueprint, snapshot, pool, branch.id, branch.items[0].question.id, 1)
  const result = changed.snapshot.branches.find(b => b.id === branch.id)!
  expect(result.items[1].question.id).toBe(branch.items[0].question.id)
  expect(result.items.map(i => i.label)).toEqual(branch.items.map(i => i.label))
  expect(changed.blueprint.branches.find(b => b.id === branch.id)!.lockedQuestionIds).toEqual([branch.items[0].question.id])
  expect(selectBlueprintPaper(JSON.parse(JSON.stringify(changed.blueprint)), pool)).toEqual(changed.snapshot)
  expect(changed.snapshot.branches.filter(b => b.id !== branch.id)).toEqual(snapshot.branches.filter(b => b.id !== branch.id))
  expect(snapshot).toEqual(before.snapshot); expect(pool).toEqual(before.pool)
  const settings = { schoolName: 'School', examTitle: 'Ordered paper', teacherName: '', grade: 6, unit: 1,
    marksPerQuestion: 1, questionCount: changed.snapshot.branches.reduce((n, b) => n + b.items.length, 0), selectionSeed: 42 }
  const projection = projectCompoundPaper(changed.snapshot, settings, 'Follow each instruction.', [1])
  const belongs = (row: { Q: string; Part: string }) => String(row.Q) === String(branch.mainQuestionNumber) && row.Part === (branch.branchLabel ?? '—')
  const beforeAnswers = projectCompoundPaper(snapshot, settings, 'Follow each instruction.', [1]).answerKey.Answers.filter(belongs)
  const answers = projection.answerKey.Answers.filter(belongs)
  expect(answers.map(row => row.Answer)).toEqual([beforeAnswers[1].Answer, beforeAnswers[0].Answer, ...beforeAnswers.slice(2).map(row => row.Answer)])
  const body = projection.exam.Branches[snapshot.branches.findIndex(b => b.id === branch.id)].Body
  expect(body.indexOf(result.items[0].question.prompt)).toBeGreaterThanOrEqual(0)
  expect(body.indexOf(result.items[1].question.prompt)).toBeGreaterThan(body.indexOf(result.items[0].question.prompt))
})

it('rejects moves across branch boundaries or inside complete groups', () => {
  const { blueprint, snapshot, pool } = fixture(), passage = snapshot.branches[0]
  expect(() => moveBlueprintQuestion(blueprint, snapshot, pool, passage.id, passage.items[0].question.id, 1)).toThrow('original order')
  const branch = snapshot.branches.find(b => b.kind === 'questions' && b.items.length > 1)!
  expect(() => moveBlueprintQuestion(blueprint, snapshot, pool, branch.id, branch.items[0].question.id, -1)).toThrow('leave the question branch')
})

it('rejects repeated, partial or excluded persisted order before reading candidates', () => {
  const { blueprint } = fixture(), branch = blueprint.branches.find(b => b.kind === 'questions' && b.quantity > 1)!
  branch.orderedQuestionIds = [branch.includedQuestionIds[0]]
  expect(() => parseExamBlueprint(blueprint)).toThrow('every selected question once')
  branch.orderedQuestionIds = [...branch.includedQuestionIds]
  branch.excludedQuestionIds = [branch.orderedQuestionIds[0]]
  expect(() => parseExamBlueprint(blueprint)).toThrow('excluded')
})

it('withholds edits when current source revisions or the reviewed blueprint changed', () => {
  const { blueprint, snapshot, pool } = fixture(), branch = snapshot.branches.find(b => b.kind === 'questions' && b.items.length > 1)!
  const current = structuredClone(pool.questions.find(q => q.id === branch.items[0].question.id)!)
  current.revision++; current.prompt += ' Updated'
  pool.questions.push(current)
  expect(() => moveBlueprintQuestion(blueprint, snapshot, pool, branch.id, branch.items[0].question.id, 1)).toThrow('changed since this review')
  blueprint.selectionSeed++
  expect(() => moveBlueprintQuestion(blueprint, snapshot, pool, branch.id, branch.items[0].question.id, 1)).toThrow('no longer matches')
})

it('replaces one question explicitly without changing the other branches or their order', () => {
  const { blueprint, snapshot, pool } = fixture()
  const branch = snapshot.branches.find(b => b.kind === 'questions' && b.items.length > 1)!
  blueprint.branches.find(b => b.id === branch.id)!.includedQuestionIds = []
  const replacement = { ...structuredClone(branch.items[0].question), id: '6f8b145f-9350-438b-813c-12517b810190', prompt: 'Replacement question?' }
  pool.questions.push(replacement); pool.standaloneQuestionIds.push(replacement.id)
  const before = structuredClone({ blueprint, snapshot, pool })
  const changed = replaceBlueprintQuestion(blueprint, snapshot, pool, branch.id, branch.items[0].question.id, replacement.id)
  const after = changed.snapshot.branches.find(b => b.id === branch.id)!
  expect(after.items[0].question).toEqual(replacement)
  expect(after.items.slice(1)).toEqual(branch.items.slice(1))
  expect(changed.snapshot.branches.filter(b => b.id !== branch.id)).toEqual(snapshot.branches.filter(b => b.id !== branch.id))
  expect(after.marks).toBe(branch.marks)
  expect(selectBlueprintPaper(JSON.parse(JSON.stringify(changed.blueprint)), pool)).toEqual(changed.snapshot)
  expect({ blueprint, snapshot, pool }).toEqual(before)
})

it('does not bypass include, lock, exclusion or canonical uniqueness for replacement', () => {
  const { blueprint, snapshot, pool } = fixture(), branch = snapshot.branches.find(b => b.kind === 'questions' && b.items.length > 1)!
  const planBranch = blueprint.branches.find(b => b.id === branch.id)!
  const replacement = { ...structuredClone(branch.items[0].question), id: '6f8b145f-9350-438b-813c-12517b810191' }
  pool.questions.push(replacement); pool.standaloneQuestionIds.push(replacement.id)
  expect(() => replaceBlueprintQuestion(blueprint, snapshot, pool, branch.id, branch.items[0].question.id, replacement.id)).toThrow('Remove Include')
  planBranch.includedQuestionIds = []; planBranch.lockedQuestionIds = [branch.items[0].question.id]
  expect(() => replaceBlueprintQuestion(blueprint, snapshot, pool, branch.id, branch.items[0].question.id, replacement.id)).toThrow('Unlock')
  planBranch.lockedQuestionIds = []; planBranch.excludedQuestionIds = [replacement.id]
  expect(() => replaceBlueprintQuestion(blueprint, snapshot, pool, branch.id, branch.items[0].question.id, replacement.id)).toThrow('no eligible replacement')
  planBranch.excludedQuestionIds = []
  expect(getBlueprintReplacementChoices(blueprint, snapshot, pool, branch.id, branch.items[0].question.id).map(choice => choice.id)).not.toContain(branch.items[1].question.id)
})

it('replaces a whole passage with exact ordered members and rejects partial-child replacement', () => {
  const { blueprint, snapshot, pool } = fixture(), branch = snapshot.branches[0]
  blueprint.branches[0].includedQuestionIds = []
  const replacement = structuredClone(pool.passages[0]); replacement.id = '6f8b145f-9350-438b-813c-12517b810199'
  replacement.children.forEach((child, index) => { child.question.id = `6f8b145f-9350-438b-813c-12517b8101${String(index).padStart(2, '0')}` })
  pool.passages.push(replacement); pool.questions.push(...replacement.children.map(child => child.question))
  expect(() => replaceBlueprintQuestion(blueprint, snapshot, pool, branch.id, branch.items[0].question.id, replacement.id)).toThrow('complete passage')
  const changed = replaceBlueprintQuestion(blueprint, snapshot, pool, branch.id, null, replacement.id)
  expect(changed.snapshot.branches[0].passageGroup).toEqual(replacement)
  expect(changed.snapshot.branches[0].items.map(i => i.question.id)).toEqual(replacement.children.map(c => c.question.id))
  expect(changed.snapshot.branches.slice(1)).toEqual(snapshot.branches.slice(1))
})

it('keeps custom marks with their question when moved and carries positional marks to a deliberate replacement', () => {
  const { blueprint, snapshot, pool } = fixture(), branch = snapshot.branches.find(b => b.kind === 'questions' && b.items.length > 1)!
  const planBranch = blueprint.branches.find(b => b.id === branch.id)!
  planBranch.includedQuestionIds = []; planBranch.answerRule = { kind: 'points', pointsToAnswer: branch.items.length }
  planBranch.instruction = 'Answer the questions.'; planBranch.arabicInstruction = null; blueprint.totalMarks += branch.items.length - planBranch.marks; planBranch.marks = branch.items.length
  const requiredReview = selectBlueprintPaper(blueprint, pool)
  const points = compoundBranchPointIds(branch)
  const assigned = assignBlueprintMarks(blueprint, requiredReview, pool, branch.id, branch.items.length + 1,
    { mode: 'custom', marksByPoint: Object.fromEntries(points.map((id, index) => [id, index ? 1 : 2])) })
  const moved = moveBlueprintQuestion(assigned.blueprint, assigned.snapshot, pool, branch.id, branch.items[0].question.id, 1)
  expect(moved.snapshot.branches.find(b => b.id === branch.id)!.pointMarks![points[0]]).toBe(2)
  const replacement = { ...structuredClone(branch.items[0].question), id: '6f8b145f-9350-438b-813c-12517b810192', prompt: 'Replacement with two marks?' }
  pool.questions.push(replacement); pool.standaloneQuestionIds.push(replacement.id)
  const changed = replaceBlueprintQuestion(moved.blueprint, moved.snapshot, pool, branch.id, branch.items[0].question.id, replacement.id)
  expect(changed.snapshot.branches.find(b => b.id === branch.id)!.pointMarks![replacement.id]).toBe(2)
  expect(selectBlueprintPaper(JSON.parse(JSON.stringify(changed.blueprint)), pool)).toEqual(changed.snapshot)
})

it('rejects fractional, incomplete and unequal optional custom point marks', () => {
  const { blueprint, snapshot, pool } = fixture(), branch = snapshot.branches[0], points = compoundBranchPointIds(branch)
  expect(() => assignBlueprintMarks(blueprint, snapshot, pool, branch.id, 10,
    { mode: 'custom', marksByPoint: Object.fromEntries(points.map((id, index) => [id, index ? 2 : 1])) })).toThrow('Optional points')
  expect(() => assignBlueprintMarks(blueprint, snapshot, pool, branch.id, 10,
    { mode: 'custom', marksByPoint: { [points[0]]: 1.5 } })).toThrow('every point')
  const required = snapshot.branches.find(b => b.kind === 'matching')!
  expect(() => assignBlueprintMarks(blueprint, snapshot, pool, required.id, 5,
    { mode: 'custom', marksByPoint: Object.fromEntries(compoundBranchPointIds(required).map((id, index) => [id, index ? 1 : 1.5])) })).toThrow('positive whole')
})

it('removes only an extra optional question and keeps the required count, total and paired ordering', () => {
  const { blueprint, snapshot, pool } = fixture(), branch = snapshot.branches.find(b => b.kind === 'questions' && b.items.length > b.attemptCount)!
  blueprint.branches.find(b => b.id === branch.id)!.includedQuestionIds = []
  const changed = removeBlueprintSelection(blueprint, snapshot, pool, branch.id, branch.items[0].question.id)
  const after = changed.snapshot.branches.find(b => b.id === branch.id)!
  expect(after.items).toHaveLength(branch.items.length - 1); expect(after.attemptCount).toBe(branch.attemptCount)
  expect(after.marks).toBe(branch.marks); expect(changed.snapshot.totalMarks).toBe(snapshot.totalMarks)
  expect(changed.blueprint.branches.find(b => b.id === branch.id)!.excludedQuestionIds).toContain(branch.items[0].question.id)
  expect(() => removeBlueprintSelection(changed.blueprint, changed.snapshot, pool, branch.id, after.items[0].question.id)).toThrow('extra optional')
})

it('keeps whole-group locks atomic and removes complete sections only after explicit unlocking', () => {
  const { blueprint, snapshot, pool } = fixture(), branch = snapshot.branches[0]
  blueprint.branches[0].includedQuestionIds = []
  const locked = toggleBlueprintLock(blueprint, snapshot, pool, branch.id, null)
  expect(locked.blueprint.branches[0].lockedQuestionIds).toEqual(branch.items.map(item => item.question.id))
  expect(() => removeBlueprintSelection(locked.blueprint, locked.snapshot, pool, branch.id, null)).toThrow('Unlock')
  const unlocked = toggleBlueprintLock(locked.blueprint, locked.snapshot, pool, branch.id, null)
  const removed = removeBlueprintSelection(unlocked.blueprint, unlocked.snapshot, pool, branch.id, null)
  expect(removed.snapshot.branches).toEqual(snapshot.branches.slice(1)); expect(removed.snapshot.totalMarks).toBe(snapshot.totalMarks - branch.marks)
  expect(clearBlueprintOrder(removed.blueprint).branches.every(b => b.orderedQuestionIds === undefined)).toBe(true)
})

it('regenerates paired production packages with chosen order and custom marks after replacement and reopening', async () => {
  const { blueprint, pool } = fixture()
  const branch = blueprint.branches.find(b => b.kind === 'questions' && b.quantity > 1)!
  branch.includedQuestionIds = []; branch.instruction = 'Answer all questions.'; branch.arabicInstruction = null
  branch.answerRule = { kind: 'points', pointsToAnswer: branch.displayedPointCount }
  branch.marks = branch.displayedPointCount; blueprint.totalMarks = blueprint.branches.reduce((n, b) => n + b.marks, 0)
  const initial = selectBlueprintPaper(blueprint, pool), selected = initial.branches.find(b => b.id === branch.id)!
  const points = compoundBranchPointIds(selected)
  const marked = assignBlueprintMarks(blueprint, initial, pool, branch.id, points.length + 1,
    { mode: 'custom', marksByPoint: Object.fromEntries(points.map((id, index) => [id, index ? 1 : 2])) })
  const moved = moveBlueprintQuestion(marked.blueprint, marked.snapshot, pool, branch.id, selected.items[0].question.id, 1)
  const replacement = { ...structuredClone(selected.items[0].question), id: '6f8b145f-9350-438b-813c-12517b810193', prompt: 'Replacement package question?' }
  pool.questions.push(replacement); pool.standaloneQuestionIds.push(replacement.id)
  const changed = replaceBlueprintQuestion(moved.blueprint, moved.snapshot, pool, branch.id, selected.items[0].question.id, replacement.id)
  const reopened = selectBlueprintPaper(JSON.parse(JSON.stringify(changed.blueprint)), pool)
  expect(reopened).toEqual(changed.snapshot)
  const settings = { schoolName: 'Synthetic school', examTitle: 'Edited paper', teacherName: 'Synthetic teacher', grade: 6,
    unit: 1, marksPerQuestion: 1, questionCount: reopened.branches.reduce((n, b) => n + b.items.length, 0), selectionSeed: reopened.selectionSeed }
  const projection = projectCompoundPaper(reopened, settings, 'Follow each instruction.', [1])
  vi.stubGlobal('DOMParser', DOMParser); vi.stubGlobal('XMLSerializer', XMLSerializer)
  try {
    const templates = await Promise.all(['exam', 'answer-key'].map(kind => readFile(`public/templates/iraqi-mainstream-phase-nine-${kind}-v1.docx`)))
    const pair = await createCompoundDocumentBlobs(reopened, settings, 'Follow each instruction.',
      Uint8Array.from(templates[0]).buffer, Uint8Array.from(templates[1]).buffer, [1])
    const [student, key] = await Promise.all([inspectDocx(pair.exam), inspectDocx(pair.answerKey)])
    const rows = key.tables.find(table => table[0].map(cell => cell.text).join('|') === 'Q|Part|Rule|Point|Answer|Mark|Total')!
    const mergedValues: string[] = []
    expect(rows.slice(1).map(row => row.map((cell, column) => {
      if (cell.merge === 'continue') { expect(mergedValues[column]).toBeTruthy(); return mergedValues[column] }
      mergedValues[column] = cell.text; return cell.text
    }))).toEqual(projection.answerKey.Answers.map(row =>
      [row.Q, row.Part, row.Rule, row.Point, row.Answer, String(row.Mark), String(row.Total)]))
    const edited = reopened.branches.find(b => b.id === branch.id)!
    const projected = projection.exam.Branches[reopened.branches.findIndex(b => b.id === branch.id)]
    for (const line of projected.Body.split(/\r?\n/).filter(Boolean)) expect(student.text).toContain(line)
    expect(student.text.indexOf(edited.items[0].question.prompt)).toBeLessThan(student.text.indexOf(replacement.prompt))
    expect(edited.pointMarks![replacement.id]).toBe(2)
    expect(student.text).toContain('Teacher: Synthetic teacher')
  } finally { vi.unstubAllGlobals() }
})
