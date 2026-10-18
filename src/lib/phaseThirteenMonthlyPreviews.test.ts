import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import { it, vi } from 'vitest'
import { parseCompoundSnapshot } from '../domain/compoundStructure'
import type { DomainQuestion } from '../domain/questionDomain'
import { DEFAULT_EXAM_SETTINGS } from '../types/exam'
import { createCompoundDocumentBlobs, projectCompoundPaper } from './compoundWorkflow'
import { assertGradeSixPaperCoverage } from './gradeSixCoverage'
import { parsePresetExercise, presetExerciseRenderSnapshot } from './presetExerciseProjection'
import { conflictsWithSelection } from './selectQuestions'
import { inspectDocx } from './testSupport/docxPackage'

const capturePath = process.env.PHASE13_MONTHLY_CAPTURE
const outputPath = process.env.PHASE13_MONTHLY_OUTPUT
const owner = '00000000-0000-4000-8000-000000000001'
const seed = 8162026
const sha = (value: Uint8Array) => createHash('sha256').update(value).digest('hex')

const profiles = [
  {
    name: 'Unit-1-Month-One', period: 'first-term-month-one' as const, unit: 1,
    missingRoles: ['book-story'],
    slots: [
      { role: 'passage', id: '2b17a4b2-0af5-4e61-ace1-9d8342709e51', number: 1, label: null },
      { role: 'grammar', id: '02407ec7-621d-481e-b582-88f69f1b5e68', number: 2, label: 'A' },
      { role: 'matching', id: '80615293-e982-43bc-be1c-1028042ccc10', number: 2, label: 'B' },
      { role: 'vocabulary', id: '06ad50b1-df5b-42e7-af95-ab243163dafd', number: 3, label: null },
      { role: 'punctuation', id: 'f8c7bb06-6ed1-4e39-9a54-ff4fe551a7dc', number: 4, label: null },
      { role: 'writing', id: '16132992-0d76-48ed-a20f-db96f7afa962', number: 5, label: null },
    ],
  },
  {
    name: 'Unit-2-Month-Two', period: 'first-term-month-two' as const, unit: 2,
    missingRoles: ['book-story', 'writing'],
    slots: [
      { role: 'passage', id: '621bccd2-f159-4b25-b64c-66928d4f9b5d', number: 1, label: null },
      { role: 'grammar', id: '0dd72975-89f0-4338-b388-a2d59cc42e1e', number: 2, label: 'A' },
      { role: 'matching', id: '06efb80c-f624-43a3-986f-398db6021ee0', number: 2, label: 'B' },
      { role: 'vocabulary', id: '1f849e24-35bc-4f1c-9540-4b995906b7e2', number: 3, label: null },
      { role: 'punctuation', id: '44d57e2c-cf76-47cb-a939-e1b8dfca0318', number: 4, label: null },
    ],
  },
] as const

it.skipIf(!capturePath || !outputPath)('builds clearly incomplete monthly private-review papers from whole sources', async () => {
  assert.ok(!existsSync(`${outputPath}/review-acceptance.json`),
    'Accepted review artifacts are immutable. Select a new verification output directory.')
  const captureBytes = readFileSync(capturePath!)
  const api = JSON.parse(captureBytes.toString('utf8')) as {
    publisherPrivateQuestionRows: number
    projection: { nextCursor: string | null; exercises: unknown[] }
  }
  assert.equal(api.publisherPrivateQuestionRows, 0)
  assert.equal(api.projection.nextCursor, null, 'Complete exercise capture required')
  const rawById = new Map(api.projection.exercises.map(raw => {
    const exercise = parsePresetExercise(raw, owner)
    return [exercise.id, raw] as const
  }))
  assert.equal(rawById.size, api.projection.exercises.length)
  const templates = ['exam', 'answer-key'].map(kind => Uint8Array.from(readFileSync(
    `public/templates/iraqi-mainstream-phase-nine-${kind}-v1.docx`)).buffer)
  vi.stubGlobal('DOMParser', DOMParser)
  vi.stubGlobal('XMLSerializer', XMLSerializer)
  vi.stubGlobal('fetch', async () => { throw new Error('Network denied in monthly fixture verification.') })
  try {
    const records = []
    const artifacts: { path: string; bytes: Uint8Array | string }[] = []
    for (const profile of profiles) {
      const selected: (DomainQuestion & { selectionKeys: string[] })[] = []
      const branches = []
      let displayedPoints = 0
      for (const slot of profile.slots) {
        const raw = rawById.get(slot.id)
        assert.ok(raw, `Unavailable complete source: ${slot.id}`)
        const exercise = parsePresetExercise(raw, owner)
        assert.ok(exercise.members.every(member => member.question.unit === profile.unit))
        displayedPoints += exercise.displayedPointCount
        for (const member of exercise.members) {
          const candidate = { ...member.question, selectionKeys: member.selectionKeys }
          assert.ok(!selected.some(question => question.id === candidate.id), 'Repeated canonical question')
          assert.ok(!conflictsWithSelection(candidate, selected), `Repeated meaning in ${profile.name}`)
          selected.push(candidate)
        }
        const branch = presetExerciseRenderSnapshot(raw, owner, seed, exercise.attemptCount * 2).branches[0]
        branches.push({ ...branch, mainQuestionNumber: slot.number, branchLabel: slot.label })
      }
      for (const representation of ['random', 'each-selected-unit'] as const) {
        assertGradeSixPaperCoverage(selected, { period: profile.period, representation })
      }
      const snapshot = parseCompoundSnapshot({ schemaVersion: 2, ownerId: owner,
        bankId: profile.slots[0].id, bankIds: profile.slots.map(slot => slot.id),
        selectionSeed: seed, totalMarks: branches.reduce((sum, branch) => sum + branch.marks, 0), branches })
      const settings = { ...DEFAULT_EXAM_SETTINGS, schoolName: 'ExamGO verification fixture',
        teacherName: '____________________', examTitle: `${profile.name} - Incomplete Private Review`,
        unit: profile.unit, questionCount: selected.length, marksPerQuestion: 2, selectionSeed: seed }
      const projection = projectCompoundPaper(snapshot, settings, 'Answer as instructed.', [profile.unit])
      const pair = await createCompoundDocumentBlobs(snapshot, settings, 'Answer as instructed.',
        templates[0], templates[1], [profile.unit])
      const student = await inspectDocx(pair.exam)
      const key = await inspectDocx(pair.answerKey)
      assert.ok(student.text.includes('Incomplete Private Review'))
      const answerTable = key.tables.find(table =>
        table[0]?.map(cell => cell.text).join('|') === 'Q|Part|Rule|Point|Answer|Mark|Total')
      assert.equal(answerTable?.length, projection.answerKey.Answers.length + 1)
      assert.ok(answerTable)
      const headers = ['Q', 'Part', 'Rule', 'Point', 'Answer', 'Mark', 'Total'] as const
      const merged = headers.map(() => '')
      answerTable.slice(1).forEach((row, index) => {
        assert.equal(row.length, headers.length)
        const cells = row.map((cell, column) => cell.merge === 'continue'
          ? merged[column] : (merged[column] = cell.text))
        headers.forEach((header, column) => assert.equal(
          cells[column].replace(/\s+/g, ' ').trim(),
          String(projection.answerKey.Answers[index][header]).replace(/\s+/g, ' ').trim(),
          `${profile.name} answer-key ${header} row ${index + 1}`))
      })
      for (const branch of projection.exam.Branches) assert.ok(student.text.includes(branch.Heading))
      for (const member of selected) {
        assert.ok(student.text.replace(/\s+/g, ' ').includes(member.prompt.replace(/\s+/g, ' ')))
      }
      const studentBytes = Buffer.from(pair.exam)
      const keyBytes = Buffer.from(pair.answerKey)
      artifacts.push(
        { path: `${profile.name}-Student.docx`, bytes: studentBytes },
        { path: `${profile.name}-Answer-Key.docx`, bytes: keyBytes },
        { path: `${profile.name}-Snapshot.json`, bytes: `${JSON.stringify(snapshot, null, 2)}\n` },
      )
      records.push({ name: profile.name, period: profile.period, unit: profile.unit,
        status: 'INCOMPLETE PRIVATE REVIEW ONLY', selectedRoles: profile.slots.map(slot => slot.role),
        missingRoles: profile.missingRoles, sourceIds: profile.slots.map(slot => slot.id),
        branches: branches.length, displayedPoints,
        attemptedMarks: snapshot.totalMarks, fixtureMarksPerAttemptedPoint: 2,
        studentSha256: sha(studentBytes), answerKeySha256: sha(keyBytes) })
    }
    mkdirSync(outputPath!, { recursive: true })
    for (const artifact of artifacts) writeFileSync(`${outputPath}/${artifact.path}`, artifact.bytes)
    writeFileSync(`${outputPath}/verification-report.json`, `${JSON.stringify({ schemaVersion: 1,
      sourceCapture: capturePath, sourceCaptureSha256: sha(captureBytes),
      captureLayer: '13 October Development read-only saved capture; not a fresh hosted read',
      verificationLayer: 'current production document path and structural DOCX inspection; no visual rendering',
      seed, profiles: records }, null, 2)}\n`)
  } finally {
    vi.unstubAllGlobals()
  }
}, 60_000)
