import { readFile } from 'node:fs/promises'
import { afterEach, expect, it, vi } from 'vitest'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import { SOURCE_STRUCTURE, SETTINGS } from './fixtures/phaseNineSource'
import { parsePhaseNineTeacherIntent, PHASE_NINE_GENERAL_INSTRUCTION, PHASE_NINE_PROFILE_ID, selectPhaseNineMarkedPaper, selectPhaseNinePaper } from './phaseNineTeacherWorkflow'
import { assignPhaseNineBranchMarks, phaseNineBranchPointIds } from './phaseNineWorkflow'
import { renderFinalizedPhaseNine } from './phaseNineDelivery'
import { inspectDocx } from './testSupport/docxPackage'

function saved(finalized = true) {
  const questions = SOURCE_STRUCTURE.branches.flatMap((b) => b.items.map((i) => i.question))
  return { id: 'snapshot', version: 1, finalized, savedAt: '2026-09-18T00:00:00Z',
    intent: parsePhaseNineTeacherIntent({ schemaVersion: 2, profileId: PHASE_NINE_PROFILE_ID, rendererVersion: 1,
      ownerId: questions[0].ownerId, bankId: questions[0].bankId, settings: { ...SETTINGS, teacherName: 'Saved Teacher', questionCount: 16 },
      filters: { lesson: '', difficulty: '' }, pageTarget: 2, generalInstruction: PHASE_NINE_GENERAL_INSTRUCTION,
      review: selectPhaseNinePaper(questions, SETTINGS.selectionSeed) }) }
}
afterEach(() => vi.unstubAllGlobals())

it('renders markless workflow 3 through production templates with separate custom point marks', async () => {
  vi.stubGlobal('DOMParser', DOMParser); vi.stubGlobal('XMLSerializer', XMLSerializer)
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, arrayBuffer: async () => Uint8Array.from(await readFile(`public${url}`)).buffer })))
  const original = saved()
  const questions = original.intent.review.snapshot.structure.branches.flatMap((b) => b.items.map((item) => ({ ...item.question, marks: null })))
  const review = selectPhaseNineMarkedPaper(questions, SETTINGS.selectionSeed)
  const branch = review.snapshot.structure.branches[0]
  original.intent = parsePhaseNineTeacherIntent({ ...original.intent, schemaVersion: 3, bankIds: [original.intent.bankId],
    review: assignPhaseNineBranchMarks(review, branch.id, 7, { mode: 'custom', marksByPoint:
      Object.fromEntries(phaseNineBranchPointIds(branch).map((id, i) => [id, [1, 2, 1, 2, 1][i]])) }) })
  const pair = await renderFinalizedPhaseNine(original)
  const student = await inspectDocx(await pair.exam.blob.arrayBuffer())
  const key = await inspectDocx(await pair.answerKey.blob.arrayBuffer())
  const table = key.tables.find((rows) => rows[0].map((cell) => cell.text).join('|') === 'Q|Part|Rule|Point|Answer|Mark|Total')!
  expect(student.text).toContain('(7 M.)')
  expect(table.slice(1, 6).map((row) => row[5].text)).toEqual(['1', '2', '1', '2', '1'])
  expect(table.slice(1).every((row) => row[5].merge === null)).toBe(true)
  expect(original.intent.review.snapshot.totalMarks).toBe(57)
})

it('renders the captured teacher intent through real production templates without bank reads', async () => {
  vi.stubGlobal('DOMParser', DOMParser); vi.stubGlobal('XMLSerializer', XMLSerializer)
  const fetchTemplate = vi.fn(async (url: string) => ({ ok: true, arrayBuffer: async () => Uint8Array.from(await readFile(`public${url}`)).buffer }))
  vi.stubGlobal('fetch', fetchTemplate)
  const original = saved()
  const pair = await renderFinalizedPhaseNine(original)
  const student = await inspectDocx(await pair.exam.blob.arrayBuffer())
  const key = await inspectDocx(await pair.answerKey.blob.arrayBuffer())
  expect(student.text).toContain('Saved Teacher')
  expect(key.text).toContain('Saved Teacher')
  const table = key.tables.find((rows) => rows[0].map((c) => c.text).join('|') === 'Q|Part|Rule|Point|Answer|Mark|Total')!
  expect(table.length).toBe(21)
  expect(table.flat().filter((c) => c.merge === 'restart')).toHaveLength(21)
  expect(fetchTemplate.mock.calls.map(([url]) => url)).toEqual(['/templates/iraqi-mainstream-phase-nine-exam-v1.docx', '/templates/iraqi-mainstream-phase-nine-answer-key-v1.docx'])
  expect(student.text).not.toContain('waiter')
  expect(key.text).toContain('waiter')
})

it('refuses unfinalized state or unsupported renderer versions before fetching', async () => {
  const fetchTemplate = vi.fn(); vi.stubGlobal('fetch', fetchTemplate)
  await expect(renderFinalizedPhaseNine(saved(false))).rejects.toThrow('finalize')
  const unsupported = saved(); Object.assign(unsupported.intent, { rendererVersion: 99 })
  await expect(renderFinalizedPhaseNine(unsupported)).rejects.toThrow('unsupported')
  expect(fetchTemplate).not.toHaveBeenCalled()
})

it('keeps finalized state available after template retrieval fails', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })))
  const original = saved(); const copy = structuredClone(original)
  await expect(renderFinalizedPhaseNine(original)).rejects.toThrow('Retry rendering')
  expect(original).toEqual(copy)
})
