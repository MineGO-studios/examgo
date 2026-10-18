import { readFile } from 'node:fs/promises'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import JSZip from 'jszip'
import { expect, it, vi } from 'vitest'
import { compoundBranchPointIds, parseCompoundSnapshot } from '../domain/compoundStructure'
import { assignAttemptMarks } from '../domain/markAllocation'
import { PHASE_TEN_Q1_Q2_EXCERPT } from './fixtures/phaseTenQ1Q2'
import { makeExam002Candidate } from './fixtures/phaseTenExam002Candidate'
import { SOURCE_STRUCTURE } from './fixtures/phaseNineSource'
import { createCompoundDocumentBlobs, projectCompoundPaper } from './compoundWorkflow'
import { projectMatching } from './matchingProjection'
import { inspectDocx } from './testSupport/docxPackage'

const settings = { schoolName: 'Anonymous', examTitle: 'Mid-Year (2025-2024)', teacherName: 'Anonymous', grade: 6,
  unit: 1, marksPerQuestion: 1, questionCount: 7, selectionSeed: 8162026 }
const fullSettings = { ...settings, questionCount: 30 }

it('round-trips passage, matching and branch identities and projects the paired source answers', () => {
  const snapshot = parseCompoundSnapshot(JSON.parse(JSON.stringify(PHASE_TEN_Q1_Q2_EXCERPT)))
  expect(snapshot).toEqual(PHASE_TEN_Q1_Q2_EXCERPT)
  const projected = projectCompoundPaper(snapshot, settings, 'Answer all questions.')
  expect(projected.exam.Branches.map((branch) => branch.Heading)).toEqual([
    'Q1-A/ Read the passage and answer the questions. (5 only)',
    'Q2-B/ Match the question in list ( A ) with their answer in list  ( B )',
  ])
  expect(projected.exam.Branches[0].Body).toContain('6. Where does Wisam’s mother work?')
  expect(projected.exam.Branches[1].Body).toContain('List (B)')
  expect(projected.answerKey.Answers).toHaveLength(11)
  expect(projected.answerKey.Answers[0]).toMatchObject({ Q: '1', Part: 'A', Rule: 'Answer 5 of 6', Answer: 'An office', Mark: 1, Total: 5 })
  expect(projected.answerKey.Answers[6]).toMatchObject({ Q: '2', Part: 'B', Mark: 2, Total: 10 })
  expect(projectCompoundPaper(snapshot, settings, 'Answer all questions.')).toEqual(projected)
})

it('creates a synchronized DOCX pair through the accepted structured template path', async () => {
  vi.stubGlobal('DOMParser', DOMParser); vi.stubGlobal('XMLSerializer', XMLSerializer)
  const [examTemplate, keyTemplate] = await Promise.all([
    readFile('public/templates/iraqi-mainstream-phase-nine-exam-v1.docx'),
    readFile('public/templates/iraqi-mainstream-phase-nine-answer-key-v1.docx'),
  ])
  const callerSnapshot = JSON.parse(JSON.stringify(PHASE_TEN_Q1_Q2_EXCERPT))
  const pendingPair = createCompoundDocumentBlobs(callerSnapshot, settings, 'Answer all questions.',
    Uint8Array.from(examTemplate).buffer, Uint8Array.from(keyTemplate).buffer)
  callerSnapshot.branches[1].items[0].question.content.left[0].text = 'CHANGED AFTER CAPTURE'
  const pair = await pendingPair
  const [examZip, keyZip] = await Promise.all([JSZip.loadAsync(pair.exam), JSZip.loadAsync(pair.answerKey)])
  const [examXml, keyXml] = await Promise.all([
    examZip.file('word/document.xml')!.async('string'), keyZip.file('word/document.xml')!.async('string'),
  ])
  expect(examXml).toContain('Where does Wisam')
  expect(examXml).toContain('List (B)')
  expect(examXml).toContain('Can I help you?')
  expect(examXml).not.toContain('CHANGED AFTER CAPTURE')
  expect(keyXml).toContain('An office')
  expect(keyXml).toContain('Answer 5 of 6')
  expect(keyXml).not.toContain('{#Answers}')
  vi.unstubAllGlobals()
})

it('prepares the complete 60-mark Exam_002 candidate with fixed branch topology', () => {
  const candidate = parseCompoundSnapshot(makeExam002Candidate('tissue'))
  const projected = projectCompoundPaper(candidate, fullSettings, 'Answer all questions.')
  expect(candidate.branches.map((branch) => `${branch.mainQuestionNumber}${branch.branchLabel ?? ''}`))
    .toEqual(['1A', '1B', '2A', '2B', '3A', '3B', '4A', '4B', '5'])
  expect(candidate.branches.map((branch) => branch.marks)).toEqual([5, 5, 10, 10, 5, 5, 5, 5, 10])
  expect(projected.answerKey.Answers.find((row) => row.Q === '3' && row.Part === 'B' && row.Point === '6')?.Answer).toBe('tissue')
  expect(projected.answerKey.Answers.filter((row) => row.Q === '5')).toHaveLength(2)
  expect(() => makeExam002Candidate('')).toThrow('owner decision')
})

it('generates a structurally complete candidate pair with aligned branch-local key rows', async () => {
  vi.stubGlobal('DOMParser', DOMParser); vi.stubGlobal('XMLSerializer', XMLSerializer)
  const templates = await Promise.all([
    readFile('public/templates/iraqi-mainstream-phase-nine-exam-v1.docx'),
    readFile('public/templates/iraqi-mainstream-phase-nine-answer-key-v1.docx'),
  ])
  const candidate = makeExam002Candidate('tissue')
  const pair = await createCompoundDocumentBlobs(candidate, fullSettings, 'Answer all questions.',
    Uint8Array.from(templates[0]).buffer, Uint8Array.from(templates[1]).buffer)
  const [student, key] = await Promise.all([inspectDocx(pair.exam), inspectDocx(pair.answerKey)])
  const studentZip = await JSZip.loadAsync(pair.exam)
  const studentXml = await studentZip.file('word/document.xml')!.async('string')
  expect((studentXml.match(/w:line="120"/g) ?? [])).toHaveLength(8)
  expect(student.text).toContain('Q5/ Writing (Choose either A or B)')
  expect(student.text).toContain('You should use a ______ when you sneeze')
  expect(student.text).toContain('Match family members')
  expect(student.text).toContain('what do basim and hiba do on monday')
  expect(student.text).not.toContain('Match Similar words')
  expect(student.text).not.toContain('what do basim ang hiba')
  expect(student.text).not.toContain('Main. what do basim')
  const matchingTables = student.tables.filter((rows) => rows[0].map((cell) => cell.text).join('|') === 'List (A)|List (B)')
  expect(matchingTables).toHaveLength(2)
  expect(matchingTables.map((rows) => rows.length)).toEqual([6, 6])
  const parsedStudent = new DOMParser().parseFromString(studentXml, 'application/xml')
  const namespace = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
  const matchingXmlTables = Array.from(parsedStudent.getElementsByTagNameNS(namespace, 'tbl'))
    .filter((table) => table.textContent?.startsWith('List (A)'))
  expect(matchingXmlTables.map((table) => table.getElementsByTagNameNS(namespace, 'tblBorders').length))
    .toEqual([0, 1])
  expect(matchingXmlTables.map((table) => table.getElementsByTagNameNS(namespace, 'tblW')[0].getAttributeNS(namespace, 'w')))
    .toEqual(['10800', '5400'])
  expect(Array.from(matchingXmlTables[1].getElementsByTagNameNS(namespace, 'gridCol'))
    .map((column) => column.getAttributeNS(namespace, 'w'))).toEqual(['2700', '2700'])
  const projected = projectCompoundPaper(candidate, fullSettings, 'Answer all questions.')
  candidate.branches.filter((branch) => branch.kind === 'matching').forEach((branch, matchingIndex) => {
    const question = branch.items[0].question
    if (question.type !== 'matching') throw new Error('Test fixture lost its matching question.')
    const mapping = projectMatching(question, candidate.selectionSeed)
    const tableRows = matchingTables[matchingIndex].slice(1)
    mapping.left.forEach((left, index) => {
      expect(tableRows[index][0].text).toBe(`${index + 1}. ${left.text}`)
      expect(tableRows[index][1].text).toBe(`${String.fromCharCode(97 + index)}. ${mapping.right[index].text}`)
    })
    const keyRows = projected.answerKey.Answers.filter((row) => row.Q === String(branch.mainQuestionNumber) && row.Part === branch.branchLabel)
    expect(keyRows.map((row) => row.Answer)).toEqual(mapping.answerKey.map((pair) => pair.displayLetter))
  })
  expect(key.text).toContain('tissue')
  const table = key.tables.find((rows) => rows[0].map((cell) => cell.text).join('|') === 'Q|Part|Rule|Point|Answer|Mark|Total')!
  expect(table.length).toBe(projected.answerKey.Answers.length + 1)
  expect(table.flat().filter((cell) => cell.merge === 'restart').length).toBeGreaterThan(0)
  vi.unstubAllGlobals()
})

it('renders all nine markless question types with exam-owned point marks in both DOCX files', async () => {
  // Synthetic renderer coverage; this is not an approved source profile or imported-content acceptance.
  const value = makeExam002Candidate('tissue')
  value.schemaVersion = 2
  value.bankIds = [value.bankId]
  const completion = structuredClone(SOURCE_STRUCTURE.branches[0].items[0].question)
  completion.ownerId = value.ownerId; completion.bankId = value.bankId
  value.branches.push({ id: 'custom-completion', mainQuestionNumber: 6, branchLabel: 'A',
    kind: 'completion', instruction: completion.prompt, arabicInstruction: null,
    marks: 7, attemptCount: 5, items: [{ label: '1–5', question: completion }] })
  const odd = structuredClone(SOURCE_STRUCTURE.branches[1].items[0].question)
  odd.ownerId = value.ownerId; odd.bankId = value.bankId
  value.branches.push({ id: 'odd', mainQuestionNumber: 6, branchLabel: 'B', kind: 'questions',
    instruction: 'Write the odd word.', arabicInstruction: null,
    marks: 3, attemptCount: 1, items: [{ label: '1', question: odd }] })
  for (const branch of value.branches) {
    branch.items.forEach(({ question }) => { question.marks = null })
    if (branch.passageGroup) {
      branch.passageGroup.expectedMarks = null
      branch.passageGroup.children.forEach(({ question }) => { question.marks = null })
    }
    const ids = compoundBranchPointIds(branch)
    const distribution = branch.id === 'custom-completion'
      ? { mode: 'custom' as const, marksByPoint: Object.fromEntries(ids.map((id, index) => [id, [1, 2, 1, 2, 1][index]])) }
      : branch.id === 'q2b'
        ? { mode: 'custom' as const, marksByPoint: Object.fromEntries(ids.map((id, index) => [id, [1, 3, 2, 1, 3][index]])) }
        : { mode: 'equal' as const }
    branch.pointMarks = Object.fromEntries(assignAttemptMarks(ids, branch.marks, branch.attemptCount, distribution)
      .pointMarks.map(({ pointId, marks }) => [pointId, marks]))
  }
  value.totalMarks = value.branches.reduce((sum, branch) => sum + branch.marks, 0)
  const captured = structuredClone(value)
  const questionCount = value.branches.reduce((sum, branch) => sum + branch.items.length, 0)
  const paperSettings = { ...settings, questionCount }
  expect(new Set(value.branches.flatMap((branch) => branch.items.map((item) => item.question.type))).size).toBe(9)
  const projected = projectCompoundPaper(value, paperSettings, 'Answer the required points.')
  expect(projected.answerKey.Answers.filter((row) => row.Q === '2' && row.Part === 'B').map((row) => row.Mark)).toEqual([1, 3, 2, 1, 3])
  expect(projected.answerKey.Answers.filter((row) => row.Q === '6' && row.Part === 'A').map((row) => row.Mark)).toEqual([1, 2, 1, 2, 1])
  expect(projected.answerKey.Answers.filter((row) => row.Q === '5').map((row) => row.Mark)).toEqual([10, 10])
  vi.stubGlobal('DOMParser', DOMParser); vi.stubGlobal('XMLSerializer', XMLSerializer)
  try {
    const templates = await Promise.all([
      readFile('public/templates/iraqi-mainstream-phase-nine-exam-v1.docx'),
      readFile('public/templates/iraqi-mainstream-phase-nine-answer-key-v1.docx'),
    ])
    const pair = await createCompoundDocumentBlobs(value, paperSettings, 'Answer the required points.',
      Uint8Array.from(templates[0]).buffer, Uint8Array.from(templates[1]).buffer)
    const [student, key] = await Promise.all([inspectDocx(pair.exam), inspectDocx(pair.answerKey)])
    const matching = student.tables.find((rows) => rows[1]?.[0].text.includes('Can I help you?'))!
    expect(matching.slice(1).map((row) => row[0].text.match(/\((\d+)M\)$/)?.[1])).toEqual(['1', '3', '2', '1', '3'])
    const keyTable = key.tables.find((rows) => rows[0].map((cell) => cell.text).join('|') === 'Q|Part|Rule|Point|Answer|Mark|Total')!
    expect(keyTable.slice(1).map((row) => [row[3].text, row[4].text, row[5].text])).toEqual(
      projected.answerKey.Answers.map((row) => [row.Point, row.Answer, String(row.Mark)]))
    for (const branch of projected.exam.Branches.filter((branch) => !branch.Body.startsWith('List (A)'))) {
      let previous = -1
      for (const line of branch.Body.split('\n').filter(Boolean)) {
        const position = student.text.indexOf(line, previous + 1)
        expect(position).toBeGreaterThan(previous)
        previous = position
      }
      if (branch.AlternativeA) expect(student.text).toContain(branch.AlternativeA)
      if (branch.AlternativeB) expect(student.text).toContain(branch.AlternativeB)
    }
    expect(value).toEqual(captured)
    expect(value.branches.every((branch) => branch.items.every((item) => item.question.marks === null))).toBe(true)
  } finally { vi.unstubAllGlobals() }
})
