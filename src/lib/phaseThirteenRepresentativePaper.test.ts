import { existsSync } from 'node:fs'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import { it, vi } from 'vitest'
import { DEFAULT_EXAM_SETTINGS } from '../types/exam'
import { parseCompoundSnapshot } from '../domain/compoundStructure'
import { assertGradeSixPaperCoverage } from './gradeSixCoverage'
import { createCompoundDocumentBlobs, projectCompoundPaper } from './compoundWorkflow'
import { inspectDocx } from './testSupport/docxPackage'

it.skipIf(!existsSync('docs/fixtures/phase-13/representative-2026-10-13-v2'))('preserves accepted Units 1-4 representative paper through the current document path', async () => {
  const base = 'docs/fixtures/phase-13/representative-2026-10-13-v2'
  const snapshot = parseCompoundSnapshot(JSON.parse(readFileSync(
    `${base}/Midyear-Units-1-4-Review-Only-V2-Snapshot.json`, 'utf8')))
  const branchShape = snapshot.branches.map(branch => [branch.mainQuestionNumber, branch.branchLabel])
  assert.deepEqual(branchShape, [[1, 'A'], [1, 'B'], [2, 'A'], [2, 'B'], [3, null], [4, null], [5, null]])
  assert.equal(snapshot.branches.length, 7)
  assert.equal(snapshot.totalMarks, 54)
  assert.equal(new Set(snapshot.bankIds).size, 7)
  for (const representation of ['random', 'each-selected-unit'] as const) {
    assertGradeSixPaperCoverage(snapshot.branches.flatMap(branch => branch.items.map(item => item.question)),
      { period: 'mid-year', includeRevisionUnit: true, representation })
  }

  const settings = { ...DEFAULT_EXAM_SETTINGS,
    schoolName: 'ExamGO verification fixture', teacherName: '____________________',
    examTitle: 'Mid-year Units 1-4 - Review Only', unit: 1,
    questionCount: snapshot.branches.reduce((sum, branch) => sum + branch.items.length, 0),
    marksPerQuestion: 2, selectionSeed: snapshot.selectionSeed }
  const templates = ['exam', 'answer-key'].map(kind => Uint8Array.from(readFileSync(
    `public/templates/iraqi-mainstream-phase-nine-${kind}-v1.docx`)).buffer)
  vi.stubGlobal('DOMParser', DOMParser)
  vi.stubGlobal('XMLSerializer', XMLSerializer)
  vi.stubGlobal('fetch', async () => { throw new Error('Network denied in representative paper test.') })
  try {
    const paper = projectCompoundPaper(snapshot, settings, 'Answer as instructed.', [1, 2, 3, 4])
    const generated = await createCompoundDocumentBlobs(snapshot, settings, 'Answer as instructed.',
      templates[0], templates[1], [1, 2, 3, 4])
    const expectedPaths = ['Student', 'Answer-Key'].map(kind =>
      `${base}/Midyear-Units-1-4-Review-Only-V2-${kind}.docx`)
    const [student, key, expectedStudent, expectedKey] = await Promise.all([
      inspectDocx(generated.exam), inspectDocx(generated.answerKey),
      inspectDocx(Uint8Array.from(readFileSync(expectedPaths[0])).buffer),
      inspectDocx(Uint8Array.from(readFileSync(expectedPaths[1])).buffer),
    ])
    assert.equal(student.text, expectedStudent.text)
    assert.equal(key.text, expectedKey.text)
    assert.deepEqual(key.tables, expectedKey.tables)
    assert.ok(!student.text.includes('Q6'))
    const answerTable = key.tables.find(table =>
      table[0]?.map(cell => cell.text).join('|') === 'Q|Part|Rule|Point|Answer|Mark|Total')
    assert.equal(answerTable?.length, paper.answerKey.Answers.length + 1)
  } finally {
    vi.unstubAllGlobals()
  }
}, 60_000)
