import { afterEach, expect, it, vi } from 'vitest'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import { getStructuredQuestionPoolForBanks } from './passageGroupRepository'
import { selectBlueprintPaper } from './examBlueprint'
import { duplicateExamBlueprintIntent, parseExamBlueprintIntent } from './examBlueprintWorkflow'
import { getBlueprintSourceIssues } from './examBlueprintRecovery'
import { createBlueprintPaperIntent, blueprintPaperSettings, parseBlueprintPaperIntent } from './examBlueprintPaper'
import { renderBlueprintPaper } from './blueprintPaperDelivery'
import { projectCompoundPaper } from './compoundWorkflow'
import { inspectDocx } from './testSupport/docxPackage'

// Read-only Development readback of a persisted duplicated configuration and its owner's current banks.
const readbackPath = process.env.EXAMGO_DUPLICATE_READBACK
const originalPath = process.env.EXAMGO_DUPLICATE_ORIGINAL

type Row = Record<string, unknown>
vi.mock('./supabase', async () => {
  const path = process.env.EXAMGO_DUPLICATE_READBACK, { readFileSync } = await import('node:fs')
  const tables: Record<string, Row[]> = path ? JSON.parse(readFileSync(path, 'utf8')) : {}
  const from = (table: string) => {
    let rows = [...(tables[table] ?? [])]
    const orders: string[] = []
    let window: [number, number] | undefined
    const builder = {
      select: () => builder,
      in: (column: string, values: unknown[]) => { rows = rows.filter(row => values.includes(row[column])); return builder },
      eq: (column: string, value: unknown) => { rows = rows.filter(row => row[column] === value); return builder },
      order: (column: string) => { orders.push(column); return builder },
      range: (first: number, last: number) => { window = [first, last]; return builder },
      abortSignal: () => builder,
      then: (resolve: (value: { data: Row[]; error: null }) => unknown) => {
        const sorted = rows.sort((a, b) => {
          for (const column of orders) { const order = String(a[column]).localeCompare(String(b[column])); if (order) return order }
          return 0
        })
        return Promise.resolve(resolve({ data: window ? sorted.slice(window[0], window[1] + 1) : sorted, error: null }))
      },
    }
    return builder
  }
  return { supabase: { from } }
})

afterEach(() => vi.unstubAllGlobals())

it.skipIf(!readbackPath)('renders the paired DOCX packages for a persisted duplicated and repaired configuration from current Development sources', async () => {
  const readback = JSON.parse(await readFile(readbackPath!, 'utf8'))
  const draft = readback.draft, copy = parseExamBlueprintIntent(draft.workflow)
  // The persisted copy is new editable work: version 1, own identity, no generated snapshot reused.
  expect(copy.blueprint.version).toBe(1)
  expect(draft.workflow).not.toHaveProperty('snapshot')
  expect(readback.snapshotsFromDraft).toBe(0)
  if (originalPath) {
    const original = JSON.parse(await readFile(originalPath, 'utf8')).recoveryDrafts.find((row: { title: string }) => `${row.title} (copy)` === draft.exam_title)
    expect(original.id).not.toBe(draft.id)
    expect(duplicateExamBlueprintIntent(original.workflow)).toEqual(copy)
  }

  const pool = { ...await getStructuredQuestionPoolForBanks(copy.blueprint.bankIds), bankIds: copy.blueprint.bankIds }
  expect(getBlueprintSourceIssues(copy.blueprint, pool)).toEqual([])
  const current = selectBlueprintPaper(copy.blueprint, pool)
  copy.blueprint.branches.forEach((branch, index) => {
    expect(current.branches[index].items.map(item => item.question.id)).toEqual(branch.orderedQuestionIds)
    for (const item of current.branches[index].items) expect(item.question.revision).toBe(branch.reviewedQuestionRevisions?.[item.question.id])
  })
  const paper = createBlueprintPaperIntent(copy, current, 'unchanged-two-page')
  const projection = projectCompoundPaper(current, blueprintPaperSettings(paper), paper.intent.generalInstruction,
    [...new Set(current.branches.flatMap(b => b.items.map(i => i.question.unit)))].sort((a, b) => a - b))

  vi.stubGlobal('DOMParser', DOMParser); vi.stubGlobal('XMLSerializer', XMLSerializer)
  vi.stubGlobal('fetch', async (url: string) => ({ ok: true, arrayBuffer: async () => Uint8Array.from(await readFile('public' + url)).buffer }))
  const receipt = { draftId: draft.id, draftUpdatedAt: draft.updated_at, readAt: readback.readAt, blueprintVersion: copy.blueprint.version,
    persistedSnapshotsFromCopy: readback.snapshotsFromDraft, sourceIssues: 0, duplicateMatchesOriginal: !!originalPath,
    orderedQuestionIds: copy.blueprint.branches.map(b => b.orderedQuestionIds),
    packages: [] as { kind: string; path: string; bytes: number; sha256: string }[],
    studentContentMatchesProjection: false, answerKeyMatchesProjection: false, regenerationSemanticExact: false,
    layoutDecision: 'unchanged-two-page (package generation only; layout status NEEDS_REVIEW, fit not measured)',
    finalization: 'not-run', visualRendering: 'not-run', humanTargetApplicationAcceptance: 'pending' }
  let first: { student: string; key: string } | undefined
  for (let retry = 0; retry < 2; retry++) {
    const pair = await renderBlueprintPaper({ id: draft.id, savedAt: draft.updated_at, intent: JSON.parse(JSON.stringify(paper)) })
    const [student, key] = await Promise.all([inspectDocx(await pair.exam.blob.arrayBuffer()), inspectDocx(await pair.answerKey.blob.arrayBuffer())])
    expect(student.text).toContain(copy.settings.examTitle)
    for (const branch of projection.exam.Branches) {
      for (const text of [branch.Heading, branch.ArabicInstruction, branch.Body, branch.WordBank, branch.AlternativeA, branch.AlternativeB]) {
        for (const line of text.split(/\r?\n/).filter(Boolean)) expect(student.text).toContain(line)
      }
    }
    const rows = key.tables.find(table => table[0].map(cell => cell.text).join('|') === 'Q|Part|Rule|Point|Answer|Mark|Total')!
    const merged: string[] = []
    expect(rows.slice(1).map(row => row.map((cell, column) => {
      if (cell.merge === 'continue') return merged[column]
      merged[column] = cell.text; return cell.text
    }))).toEqual(projection.answerKey.Answers.map(row => [row.Q, row.Part, row.Rule, row.Point, row.Answer, String(row.Mark), String(row.Total)]))
    if (!retry) {
      receipt.studentContentMatchesProjection = receipt.answerKeyMatchesProjection = true
      first = { student: student.text, key: key.text }
      for (const [kind, document] of [['student', pair.exam], ['answer-key', pair.answerKey]] as const) {
        const bytes = Buffer.from(await document.blob.arrayBuffer()), path = `output/phase14/phase14c-duplicate-${kind}.docx`
        await writeFile(path, bytes)
        receipt.packages.push({ kind, path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })
      }
    } else { expect({ student: student.text, key: key.text }).toEqual(first); receipt.regenerationSemanticExact = true }
  }
  await writeFile('output/phase14/phase14c-duplicate-package-verification.json', JSON.stringify(receipt, null, 2) + '\n')
})

const finalizedPath = process.env.EXAMGO_DUPLICATE_FINALIZED
it.skipIf(!finalizedPath)('matches browser downloads of the finalized duplicate to its sealed snapshot and the reviewed pre-finalization pair', async () => {
  const captured = JSON.parse(await readFile(finalizedPath!, 'utf8')), row = captured.papers[0]
  expect(captured.papers).toHaveLength(1); expect(row.sealed).toBe(true)
  const paper = parseBlueprintPaperIntent(row.workflow)
  const fetcher = vi.fn(async (url: string) => ({ ok: true, arrayBuffer: async () => Uint8Array.from(await readFile('public' + url)).buffer }))
  vi.stubGlobal('fetch', fetcher); vi.stubGlobal('DOMParser', DOMParser); vi.stubGlobal('XMLSerializer', XMLSerializer)
  const pair = await renderBlueprintPaper({ id: row.id, savedAt: '2026-10-17T17:12:54Z', intent: paper })
  const text = async (bytes: ArrayBuffer) => { const docx = await inspectDocx(bytes); return { text: docx.text, tables: docx.tables } }
  const sealed = { student: await text(await pair.exam.blob.arrayBuffer()), key: await text(await pair.answerKey.blob.arrayBuffer()) }
  for (const branch of paper.snapshot.branches) if (branch.passageGroup) expect(sealed.student.text).toContain(branch.passageGroup.passage)
  const load = async (path: string) => text(Uint8Array.from(await readFile(path)).buffer)
  // Prefix of the browser-downloaded pair, plus an optional earlier reviewed pair that must also match.
  const prefix = process.env.EXAMGO_FINALIZED_PREFIX ?? 'output/phase14/phase14c-duplicate'
  const reviewedPrefix = process.env.EXAMGO_FINALIZED_PREFIX ? process.env.EXAMGO_REVIEWED_PREFIX : prefix
  const browser = { student: await load(`${prefix}-browser-student.docx`), key: await load(`${prefix}-browser-answer-key.docx`) }
  expect(browser).toEqual(sealed)
  if (reviewedPrefix) expect({ student: await load(`${reviewedPrefix}-student.docx`), key: await load(`${reviewedPrefix}-answer-key.docx`) }).toEqual(sealed)
  expect(fetcher).toHaveBeenCalledTimes(2)
  await writeFile(`${prefix}-finalized-verification.json`, JSON.stringify({ snapshotId: row.id, sourceDraftVersion: row.sourceDraftVersion,
    passageGroups: paper.snapshot.branches.flatMap(b => b.passageGroup ? [{ id: b.passageGroup.id, revision: b.passageGroup.revision }] : []),
    browserDownloadsSemanticExact: true, reviewedPairSemanticExact: !!reviewedPrefix, regeneratedWithoutBankFetch: true, visualRendering: 'not-run' }, null, 2) + '\n')
})
