import { readFile } from 'node:fs/promises'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import { expect, it, vi } from 'vitest'
import { makeExam002Candidate } from './fixtures/phaseTenExam002Candidate'
import { inspectDocx } from './testSupport/docxPackage'
import { renderPhaseTenCandidate } from './phaseTenDelivery'
import { assignCandidateExamMarks } from './phaseTenCandidateProfile'
import { compoundBranchPointIds } from '../domain/compoundStructure'
import { projectCompoundPaper } from './compoundWorkflow'
import { PHASE_TEN_CANDIDATE_PROFILE_ID, PHASE_TEN_GENERAL_INSTRUCTION } from './phaseTenTeacherWorkflow'

it('routes the captured candidate through the paired production document delivery path', async () => {
  const snapshot = makeExam002Candidate('tissue')
  const files = await Promise.all(['exam', 'answer-key'].map((kind) =>
    readFile(`public/templates/iraqi-mainstream-phase-nine-${kind}-v1.docx`)))
  const requested: string[] = []
  vi.stubGlobal('DOMParser', DOMParser)
  vi.stubGlobal('XMLSerializer', XMLSerializer)
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    requested.push(url)
    const file = url.includes('answer-key') ? files[1] : files[0]
    return { ok: true, arrayBuffer: async () => Uint8Array.from(file).buffer }
  }))
  try {
    const pair = await renderPhaseTenCandidate({ schemaVersion: 1, profileId: PHASE_TEN_CANDIDATE_PROFILE_ID,
      rendererVersion: 1, ownerId: snapshot.ownerId, bankId: snapshot.bankId, generalInstruction: PHASE_TEN_GENERAL_INSTRUCTION,
      settings: { schoolName: 'Anonymous', examTitle: 'Mid-Year', teacherName: '', grade: 6, unit: 1,
        marksPerQuestion: 1, questionCount: 30, selectionSeed: snapshot.selectionSeed }, snapshot })
    expect(requested).toEqual([
      '/templates/iraqi-mainstream-phase-nine-exam-v1.docx',
      '/templates/iraqi-mainstream-phase-nine-answer-key-v1.docx',
    ])
    expect(pair.exam.filename).toBe('ExamGO-Unit1-Exam.docx')
    const [student, key] = await Promise.all([inspectDocx(await pair.exam.blob.arrayBuffer()), inspectDocx(await pair.answerKey.blob.arrayBuffer())])
    expect(student.text).toContain('Q5/ Writing (Choose either A or B)')
    expect(key.text).toContain('tissue')
    expect(key.text).toContain('Manual marking')
    const historical = makeExam002Candidate('tissue', true)
    const oldPair = await renderPhaseTenCandidate({ schemaVersion: 1, profileId: PHASE_TEN_CANDIDATE_PROFILE_ID,
      rendererVersion: 1, ownerId: historical.ownerId, bankId: historical.bankId, generalInstruction: PHASE_TEN_GENERAL_INSTRUCTION,
      settings: { schoolName: 'Anonymous', examTitle: 'Mid-Year', teacherName: '', grade: 6, unit: 1,
        marksPerQuestion: 1, questionCount: 30, selectionSeed: historical.selectionSeed }, snapshot: historical })
    const oldStudent = await inspectDocx(await oldPair.exam.blob.arrayBuffer())
    expect(oldStudent.text).toContain('Match Similar words')
    expect(oldStudent.text).toContain('what do basim ang hiba do on monday')
  } finally { vi.unstubAllGlobals() }
})

it('delivers captured teacher scoring with custom point marks using the existing template version', async () => {
  const source = makeExam002Candidate('tissue')
  source.branches.forEach((branch) => {
    branch.items.forEach(({ question }) => { question.marks = null })
    branch.passageGroup?.children.forEach(({ question }) => { question.marks = null })
  })
  const points = compoundBranchPointIds(source.branches[4])
  const allocations = Object.fromEntries(source.branches.map((branch) => [branch.id,
    { totalMarks: branch.marks, distribution: { mode: 'equal' as const } }]))
  const snapshot = assignCandidateExamMarks(source, [source.bankId], {
    ...allocations,
    q3a: { totalMarks: 7, distribution: { mode: 'custom', marksByPoint:
      Object.fromEntries(points.map((id, index) => [id, [1, 2, 1, 2, 1][index]])) } },
    q3b: { totalMarks: 10, distribution: { mode: 'equal' } },
    q5: { totalMarks: 20, distribution: { mode: 'equal' } },
  })
  const settings = { schoolName: 'Anonymous', examTitle: 'Scored paper', teacherName: '', grade: 6,
    unit: 1, marksPerQuestion: 1, questionCount: 30, selectionSeed: snapshot.selectionSeed }
  const files = await Promise.all(['exam', 'answer-key'].map((kind) =>
    readFile(`public/templates/iraqi-mainstream-phase-nine-${kind}-v1.docx`)))
  const fetchTemplate = vi.fn(async (url: string) => ({ ok: true,
    arrayBuffer: async () => Uint8Array.from(url.includes('answer-key') ? files[1] : files[0]).buffer }))
  vi.stubGlobal('DOMParser', DOMParser)
  vi.stubGlobal('XMLSerializer', XMLSerializer)
  vi.stubGlobal('fetch', fetchTemplate)
  try {
    const pair = await renderPhaseTenCandidate({ schemaVersion: 2, profileId: PHASE_TEN_CANDIDATE_PROFILE_ID,
      rendererVersion: 1, ownerId: snapshot.ownerId, bankId: snapshot.bankId,
      generalInstruction: PHASE_TEN_GENERAL_INSTRUCTION, settings, snapshot })
    const [student, key] = await Promise.all([inspectDocx(await pair.exam.blob.arrayBuffer()),
      inspectDocx(await pair.answerKey.blob.arrayBuffer())])
    const projected = projectCompoundPaper(snapshot, settings, PHASE_TEN_GENERAL_INSTRUCTION)
    const keyTable = key.tables.find((rows) => rows[0].map((cell) => cell.text).join('|') === 'Q|Part|Rule|Point|Answer|Mark|Total')!
    expect(keyTable.slice(1).map((row) => [row[3].text, row[4].text, row[5].text])).toEqual(
      projected.answerKey.Answers.map((row) => [row.Point, row.Answer, String(row.Mark)]))
    expect(student.text).toContain('(20M)')
    expect(keyTable.slice(1).reduce((total, row) => total + Number(row[6].text || 0), 0)).toBe(77)
    expect(fetchTemplate.mock.calls.map(([url]) => url)).toEqual([
      '/templates/iraqi-mainstream-phase-nine-exam-v1.docx', '/templates/iraqi-mainstream-phase-nine-answer-key-v1.docx',
    ])
    expect(snapshot.branches.flatMap((branch) => branch.items).every(({ question }) => question.marks === null)).toBe(true)
  } finally { vi.unstubAllGlobals() }
})
