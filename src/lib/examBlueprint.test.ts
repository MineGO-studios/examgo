import { expect, it } from 'vitest'
import { compoundBranchPointIds, parseCompoundSnapshot } from '../domain/compoundStructure'
import { assignCandidateExamMarks } from './phaseTenCandidateProfile'
import { makeExam002Candidate } from './fixtures/phaseTenExam002Candidate'
import { parseExamBlueprint, selectBlueprintPaper, type ExamBlueprint, type BlueprintPool } from './examBlueprint'
import { readFile } from 'node:fs/promises'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import { vi } from 'vitest'
import { createCompoundDocumentBlobs, projectCompoundPaper } from './compoundWorkflow'
import { inspectDocx } from './testSupport/docxPackage'

function fixture() {
  const source = structuredClone(makeExam002Candidate('tissue'))
  const questions = source.branches.flatMap((b) => b.items.map((i) => i.question))
  const pool: BlueprintPool = { bankIds: [source.bankId], questions, passages: [source.branches[0].passageGroup!],
    completionGroups: [], standaloneQuestionIds: questions.map((q) => q.id) }
  const blueprint: ExamBlueprint = { schemaVersion: 1, version: 1, ownerId: source.ownerId, bankIds: [source.bankId],
    selectionSeed: 42, totalMarks: source.totalMarks, branches: source.branches.map((b) => ({
      id: b.id, mainQuestionNumber: b.mainQuestionNumber, branchLabel: b.branchLabel, kind: b.kind,
      instruction: b.instruction, arabicInstruction: b.arabicInstruction,
      questionTypes: [...new Set(b.items.map((i) => i.question.type))], quantity: b.items.length,
      displayedPointCount: compoundBranchPointIds(b).length,
      answerRule: b.kind === 'alternatives' ? { kind: 'choose-one' } : b.id === 'q4a' ? { kind: 'task' }
        : { kind: 'points', pointsToAnswer: b.attemptCount },
      marks: b.marks, distribution: { mode: 'equal' }, units: [1], lessons: [], difficulties: [],
      includedQuestionIds: b.items.map((i) => i.question.id), excludedQuestionIds: [], lockedQuestionIds: [],
    })) }
  return { source, pool, blueprint }
}

it('selects a general Q1–Q5 blueprint through the existing snapshot validator without changing source content', () => {
  const { source, pool, blueprint } = fixture(); const before = structuredClone(pool)
  const paper = selectBlueprintPaper(blueprint, pool)
  expect(paper.branches.map((b) => b.id)).toEqual(source.branches.map((b) => b.id))
  expect(paper.totalMarks).toBe(source.totalMarks)
  expect(parseCompoundSnapshot(JSON.parse(JSON.stringify(paper)))).toEqual(paper)
  expect(pool).toEqual(before)
})

it('requires explicit valid Points to answer and rejects count/mark/placement conflicts before selecting', () => {
  for (const count of [undefined, null, '', 0, 7, 1.5]) {
    const { blueprint } = fixture()
    blueprint.branches[0].answerRule = { kind: 'points', pointsToAnswer: count as number }
    expect(() => parseExamBlueprint(blueprint)).toThrow('Points to answer')
  }
  const { blueprint } = fixture()
  blueprint.branches[0].marks = 9; blueprint.totalMarks--
  expect(() => parseExamBlueprint(blueprint)).toThrow('whole marks')
  blueprint.branches[0].marks = 10; blueprint.totalMarks++
  blueprint.branches[1].mainQuestionNumber = 2
  expect(() => parseExamBlueprint(blueprint)).toThrow('ordered')
})

it('keeps original passage counts and instructions while applying teacher choice to exam-owned scoring', () => {
  const { source, pool, blueprint } = fixture()
  blueprint.branches[0].answerRule = { kind: 'points', pointsToAnswer: 3 }
  blueprint.branches[0].arabicInstruction = 'أجب عن ثلاثة أسئلة فقط'
  blueprint.totalMarks += 6 - blueprint.branches[0].marks; blueprint.branches[0].marks = 6
  blueprint.branches[0].instruction = 'Read and answer.'
  const paper = selectBlueprintPaper(blueprint, pool)
  expect(paper.branches[0].attemptCount).toBe(3)
  expect(paper.branches[0].instruction).toBe('Read and answer.\nAnswer 3 of 6.')
  expect(paper.branches[0].passageGroup).toEqual(source.branches[0].passageGroup)
  expect(paper.branches[0].passageGroup!.attemptCount).toBe(5)
})

it('rejects stale or missing passage members, excluded locks and wrong bank supply', () => {
  const { pool, blueprint } = fixture()
  pool.questions = pool.questions.filter((q) => q.id !== pool.passages[0].children[0].question.id)
  expect(() => selectBlueprintPaper(blueprint, pool)).toThrow('Q1/A')
  const next = fixture(); next.blueprint.branches[1].excludedQuestionIds = [next.blueprint.branches[1].includedQuestionIds[0]]
  expect(() => selectBlueprintPaper(next.blueprint, next.pool)).toThrow('conflicting')
  next.pool.bankIds = []
  expect(() => selectBlueprintPaper(blueprint, next.pool)).toThrow('Reload')
})

it('selects deterministically when candidate and group order changes', () => {
  const { pool, blueprint } = fixture()
  const first = selectBlueprintPaper(blueprint, pool)
  expect(selectBlueprintPaper(blueprint, { ...pool, questions: [...pool.questions].reverse(), passages: [...pool.passages].reverse() })).toEqual(first)
})

it('does not offer the same printed writing topic twice and can select a distinct alternative', () => {
  const { pool, blueprint } = fixture()
  const branch = blueprint.branches.find(b => b.kind === 'alternatives')!
  blueprint.branches = [branch]; blueprint.totalMarks = branch.marks
  const writing = pool.questions.filter(q => q.type === 'extended-writing')
  expect(writing).toHaveLength(2)
  writing[1].prompt = `  ${writing[0].prompt.toUpperCase()}  `
  expect(() => selectBlueprintPaper(blueprint, pool)).toThrow(/writing topic|without repeating/)
  const distinct = { ...structuredClone(writing[1]), id: '6f8b145f-9350-438b-813c-12517b810178', prompt: 'Write about your school.' }
  pool.questions.push(distinct); pool.standaloneQuestionIds.push(distinct.id)
  branch.includedQuestionIds = [writing[0].id]
  const paper = selectBlueprintPaper(blueprint, pool)
  expect(paper.branches[0].items.map(i => i.question.id)).toContain(distinct.id)
  const forged = structuredClone(paper); forged.branches[0].items[1].question.prompt = forged.branches[0].items[0].question.prompt
  expect(() => parseCompoundSnapshot(forged)).toThrow('distinct printed prompts')
})

it('does not repeat canonical identities across overlapping branches', () => {
  const { pool, blueprint } = fixture()
  const first = blueprint.branches[1]
  blueprint.branches = [first, { ...structuredClone(first), id: 'second', mainQuestionNumber: 2 }]
  blueprint.totalMarks = first.marks * 2
  expect(() => selectBlueprintPaper(blueprint, pool)).toThrow('without repeating')
})

it('preserves fixed historical profile validation and rejects non-writing count exemptions', () => {
  const { source, blueprint, pool } = fixture()
  const historical = assignCandidateExamMarks(source, [source.bankId], Object.fromEntries(source.branches.map((b) =>
    [b.id, { totalMarks: b.marks, distribution: { mode: 'equal' as const } }])))
  expect(parseCompoundSnapshot(historical)).toEqual(historical)
  const branch = blueprint.branches[1]
  branch.quantity = 1; branch.displayedPointCount = 1; branch.answerRule = { kind: 'task' }; branch.includedQuestionIds = []
  expect(() => selectBlueprintPaper(blueprint, pool)).toThrow('Q1/B')
})

it('backtracks across overlapping filters instead of reporting a greedy false shortage', () => {
  const { pool, blueprint } = fixture()
  const original = blueprint.branches[1]
  const questions = pool.questions.filter((q) => original.questionTypes.includes(q.type))
  const first = { ...structuredClone(original), quantity: 1, displayedPointCount: 1, marks: 1,
    instruction: 'Answer the following question.', arabicInstruction: null,
    mainQuestionNumber: 1, branchLabel: null, answerRule: { kind: 'points' as const, pointsToAnswer: 1 }, includedQuestionIds: [] }
  const selectedFirst = selectBlueprintPaper({ ...blueprint, branches: [first], totalMarks: 1 }, pool).branches[0].items[0].question.id
  const second = { ...structuredClone(first), id: 'restricted', mainQuestionNumber: 2, includedQuestionIds: [selectedFirst] }
  blueprint.branches = [first, second]; blueprint.totalMarks = 2
  const paper = selectBlueprintPaper(blueprint, pool)
  expect(questions.length).toBeGreaterThan(1)
  expect(paper.branches[1].items[0].question.id).toBe(selectedFirst)
  expect(paper.branches[0].items[0].question.id).not.toBe(selectedFirst)
})

it('rejects inactive latest revisions, inconsistent quantities and impossible required-point marks', () => {
  const { blueprint, pool } = fixture()
  const targetId = blueprint.branches[1].includedQuestionIds[0]
  const question = pool.questions.find((q) => q.id === targetId)!
  pool.questions.push({ ...structuredClone(question), revision: question.revision + 1, isActive: false })
  expect(() => selectBlueprintPaper(blueprint, pool)).toThrow('an included, locked or chosen question no longer fits')
  const next = fixture()
  next.blueprint.branches[1].displayedPointCount++
  expect(() => selectBlueprintPaper(next.blueprint, next.pool)).toThrow()
  const final = fixture(); final.blueprint.branches[1].marks = 6; final.blueprint.totalMarks++
  expect(() => parseExamBlueprint(final.blueprint)).toThrow('whole marks')
})

it('rejects a recognizable contradictory printed count instead of printing both rules', () => {
  const { blueprint } = fixture()
  blueprint.branches[0].answerRule = { kind: 'points', pointsToAnswer: 3 }
  blueprint.totalMarks += 6 - blueprint.branches[0].marks; blueprint.branches[0].marks = 6
  blueprint.branches[0].instruction = 'Read the passage and answer the questions. (5 only)'
  expect(() => parseExamBlueprint(blueprint)).toThrow('printed instruction conflicts')
})

it('requires explicit Arabic answer counts to agree without rewriting source wording', () => {
  for (const instruction of ['خمسة فقط', '(٥ فقط)', 'أجب عن خمسة أسئلة', 'أجِب عن خَمْسَة أسئلة']) {
    const { blueprint } = fixture()
    blueprint.branches[0].arabicInstruction = instruction
    blueprint.branches[0].answerRule = { kind: 'points', pointsToAnswer: 3 }
    blueprint.branches[0].instruction = 'Answer the questions.'
    blueprint.totalMarks += 6 - blueprint.branches[0].marks; blueprint.branches[0].marks = 6
    const before = structuredClone(blueprint)
    expect(() => parseExamBlueprint(blueprint)).toThrow('Arabic instruction conflicts')
    expect(blueprint).toEqual(before)
  }
})

it('rejects an oversized complete plan before reading any bank candidates', () => {
  const { blueprint, pool } = fixture()
  const branch = blueprint.branches[1]
  branch.quantity = 31; branch.displayedPointCount = 31; branch.marks = 31
  branch.instruction = 'Answer the questions.'; branch.arabicInstruction = null; branch.answerRule = { kind: 'points', pointsToAnswer: 31 }
  blueprint.totalMarks = blueprint.branches.reduce((sum, b) => sum + b.marks, 0)
  Object.defineProperty(pool, 'questions', { get() { throw new Error('Bank candidates were read too early.') } })
  expect(() => selectBlueprintPaper(blueprint, pool)).toThrow('50')
})

it.each([1, 8])('generates synchronized packages for changed teacher points in Unit %i through the production renderer', async (unit) => {
  const { blueprint, pool } = fixture()
  pool.questions.forEach((question) => { question.unit = unit })
  pool.passages.forEach((group) => group.children.forEach(({ question }) => { question.unit = unit }))
  blueprint.branches.forEach((branch) => { branch.units = [unit] })
  blueprint.totalMarks += 6 - blueprint.branches[0].marks; blueprint.branches[0].marks = 6
  blueprint.branches[0].instruction = 'Read the passage.'
  blueprint.branches[0].answerRule = { kind: 'points', pointsToAnswer: 3 }
  blueprint.branches[0].arabicInstruction = 'أجب عن ثلاثة أسئلة فقط'
  const paper = selectBlueprintPaper(blueprint, pool)
  const settings = { schoolName: 'Synthetic school', examTitle: 'Blueprint verification', teacherName: 'Synthetic teacher',
    grade: 6, unit, marksPerQuestion: 1, questionCount: paper.branches.reduce((n, b) => n + b.items.length, 0), selectionSeed: blueprint.selectionSeed }
  const before = structuredClone(paper)
  const projection = projectCompoundPaper(paper, settings, 'Follow each question instruction.', [unit])
  vi.stubGlobal('DOMParser', DOMParser); vi.stubGlobal('XMLSerializer', XMLSerializer)
  try {
    const templates = await Promise.all(['exam', 'answer-key'].map((kind) => readFile(`public/templates/iraqi-mainstream-phase-nine-${kind}-v1.docx`)))
    const pair = await createCompoundDocumentBlobs(paper, settings, 'Follow each question instruction.',
      Uint8Array.from(templates[0]).buffer, Uint8Array.from(templates[1]).buffer, [unit])
    const [student, key] = await Promise.all([inspectDocx(pair.exam), inspectDocx(pair.answerKey)])
    expect(student.text).toContain('Answer 3 of 6.')
    const table = key.tables.find((rows) => rows[0].map((c) => c.text).join('|') === 'Q|Part|Rule|Point|Answer|Mark|Total')!
    expect(table.slice(1).map((row) => [row[3].text, row[4].text, row[5].text])).toEqual(
      projection.answerKey.Answers.map((row) => [row.Point, row.Answer, String(row.Mark)]))
    expect(projection.answerKey.Answers.slice(0, 6).every((row) => row.Rule === 'Answer 3 of 6' && row.Mark === 2)).toBe(true)
    expect(paper).toEqual(before)
  } finally { vi.unstubAllGlobals() }
})
