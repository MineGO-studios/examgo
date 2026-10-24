import { afterEach, expect, it, vi } from 'vitest'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import { makeBlueprintPaperFixture } from './fixtures/blueprintPaper'
import { createBlueprintPaperIntent, blueprintPaperSettings, parseBlueprintPaperIntent } from './examBlueprintPaper'
import { blueprintDownloadAllowed, renderBlueprintPaper } from './blueprintPaperDelivery'
import { assessBlueprintFit } from './examBlueprintFit'
import { projectCompoundPaper } from './compoundWorkflow'
import { inspectDocx } from './testSupport/docxPackage'
import { acceptBlueprintSourceUpdates, recordBlueprintSourceReview } from './examBlueprintRecovery'
import { selectBlueprintPaper } from './examBlueprint'
import { duplicateExamBlueprintIntent } from './examBlueprintWorkflow'

afterEach(() => vi.unstubAllGlobals())

it('renders a deliberately repaired and duplicated configuration from the current source revision instead of its old captured paper', async () => {
  const { intent, review, pool } = makeBlueprintPaperFixture()
  const original = structuredClone(review), chosen = review.branches[1].items.find(item => item.question.type === 'binary')!
  const question = pool.questions.find(q => q.id === chosen.question.id)!
  expect(question.type).toBe('binary')
  question.revision++; question.prompt += ' Current reviewed source.'
  if (question.type === 'binary') question.answer.isTrue = !question.answer.isTrue
  const repaired = { ...intent, blueprint: acceptBlueprintSourceUpdates(intent.blueprint, pool, intent.blueprint.branches[1].id) }
  const copy = duplicateExamBlueprintIntent(repaired), current = selectBlueprintPaper(copy.blueprint, pool)
  const paper = createBlueprintPaperIntent(copy, current, 'unchanged-two-page')
  expect(copy).not.toHaveProperty('snapshot')
  expect(original.branches[1].items.find(item => item.question.id === question.id)!.question.revision).toBe(question.revision - 1)
  vi.stubGlobal('DOMParser', DOMParser); vi.stubGlobal('XMLSerializer', XMLSerializer)
  vi.stubGlobal('fetch', async (url: string) => ({ ok: true, arrayBuffer: async () => Uint8Array.from(await readFile('public' + url)).buffer }))
  const pair = await renderBlueprintPaper({ id: '33333333-3333-4333-8333-333333333333', savedAt: '2026-10-17T12:00:00Z', intent: paper })
  const [student, key] = await Promise.all([inspectDocx(await pair.exam.blob.arrayBuffer()), inspectDocx(await pair.answerKey.blob.arrayBuffer())])
  expect(student.text).toContain(question.prompt)
  expect(student.text).toContain(copy.settings.examTitle)
  const projected = projectCompoundPaper(current, blueprintPaperSettings(paper), paper.intent.generalInstruction, [1])
  const rows = key.tables.find(table => table[0].map(cell => cell.text).join('|') === 'Q|Part|Rule|Point|Answer|Mark|Total')!
  const merged: string[] = []
  expect(rows.slice(1).map(row => row.map((cell, column) => {
    if (cell.merge === 'continue') return merged[column]
    merged[column] = cell.text; return cell.text
  }))).toEqual(projected.answerKey.Answers.map(row => [row.Q, row.Part, row.Rule, row.Point, row.Answer, String(row.Mark), String(row.Total)]))
  expect(repaired.blueprint.version).toBe(intent.blueprint.version)
})

it('regenerates both production DOCX packages from the immutable captured review with no bank fetch', async () => {
  const { intent, review, pool } = makeBlueprintPaperFixture()
  const captured = process.env.EXAMGO_CAPTURED_PAPER ? JSON.parse(await readFile(process.env.EXAMGO_CAPTURED_PAPER, 'utf8')) : null
  const captureDirectory = process.env.EXAMGO_CAPTURED_OUTPUT ?? 'output/phase14'
  if (captured) { expect(captured.papers).toHaveLength(1); expect(captured.papers[0].sealed).toBe(true) }
  const paper = captured ? parseBlueprintPaperIntent(captured.papers[0].workflow) : createBlueprintPaperIntent(intent, review, 'unchanged-two-page')
  pool.questions.length = 0; pool.passages.length = 0
  const fetcher = vi.fn(async (url: string) => {
    expect(url).toMatch(/^\/templates\/iraqi-mainstream-phase-nine-(exam|answer-key)-v1.docx$/)
    const bytes = await readFile('public' + url)
    return { ok: true, arrayBuffer: async () => Uint8Array.from(bytes).buffer }
  })
  vi.stubGlobal('fetch', fetcher); vi.stubGlobal('DOMParser', DOMParser); vi.stubGlobal('XMLSerializer', XMLSerializer)
  const units = [...new Set(paper.snapshot.branches.flatMap(b => b.items.map(i => i.question.unit)))].sort((a, b) => a - b)
  const projection = projectCompoundPaper(paper.snapshot, blueprintPaperSettings(paper), paper.intent.generalInstruction, units)
  const receipt = { snapshotId: captured?.papers[0].id, blueprintVersion: paper.intent.blueprint.version, packages: [] as { kind: string; path: string; bytes: number; sha256: string }[], regenerationSemanticExact: false, browserDownloadsSemanticExact: false, visualRendering: 'not-run', humanTargetApplicationAcceptance: 'pending' }
  let first: { student: string; key: string } | undefined
  for (let retry = 0; retry < 2; retry++) {
    const pair = await renderBlueprintPaper({ id: '33333333-3333-4333-8333-333333333333', savedAt: '2026-10-17T12:00:00Z', intent: JSON.parse(JSON.stringify(paper)) })
    const [student, key] = await Promise.all([inspectDocx(await pair.exam.blob.arrayBuffer()), inspectDocx(await pair.answerKey.blob.arrayBuffer())])
    for (const branch of projection.exam.Branches) {
      for (const text of [branch.Heading, branch.ArabicInstruction, branch.Body, branch.WordBank, branch.AlternativeA, branch.AlternativeB]) {
        for (const line of text.split(/\r?\n/).filter(Boolean)) expect(student.text).toContain(line)
      }
    }
    const rows = key.tables.find(table => table[0].map(cell => cell.text).join('|') === 'Q|Part|Rule|Point|Answer|Mark|Total')!
    const mergedValues: string[] = []
    expect(rows.slice(1).map(row => row.map((cell, column) => {
      if (cell.merge === 'continue') return mergedValues[column]
      mergedValues[column] = cell.text; return cell.text
    }))).toEqual(projection.answerKey.Answers.map(row => [row.Q, row.Part, row.Rule, row.Point, row.Answer, String(row.Mark), String(row.Total)]))
    expect(student.text).toContain('Teacher:' + (paper.intent.settings.teacherName ? ' ' + paper.intent.settings.teacherName : ''))
    expect(key.text).toContain('Teacher:' + (paper.intent.settings.teacherName ? ' ' + paper.intent.settings.teacherName : ''))
    expect(student.text).not.toContain('Manual marking required')
    if (!retry) {
      first = { student: student.text, key: key.text }
      if (captured) for (const [kind, document] of [['student', pair.exam], ['answer-key', pair.answerKey]] as const) {
        const bytes = Buffer.from(await document.blob.arrayBuffer()), path = `${captureDirectory}/phase14c-${kind}.docx`
        await writeFile(path, bytes)
        receipt.packages.push({ kind, path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })
      }
    } else { expect({ student: student.text, key: key.text }).toEqual(first); receipt.regenerationSemanticExact = true }
  }
  if (process.env.EXAMGO_BROWSER_EXAM && process.env.EXAMGO_BROWSER_KEY) {
    const [exam, key] = await Promise.all([readFile(process.env.EXAMGO_BROWSER_EXAM), readFile(process.env.EXAMGO_BROWSER_KEY)])
    const [studentPackage, keyPackage] = await Promise.all([inspectDocx(Uint8Array.from(exam).buffer), inspectDocx(Uint8Array.from(key).buffer)])
    expect({ student: studentPackage.text, key: keyPackage.text }).toEqual(first)
    receipt.browserDownloadsSemanticExact = true
  }
  if (captured) await writeFile(`${captureDirectory}/phase14c-captured-package-verification.json`, JSON.stringify(receipt, null, 2) + '\n')
  expect(fetcher).toHaveBeenCalledTimes(4)
})

it('needs no two-page exception within the verified one-page volume, but refuses larger or historical papers without one', async () => {
  const full = makeBlueprintPaperFixture()
  // The full 60-mark blueprint adds "Answer N of M." lines and exceeds the verified volume; four sections stay within it.
  expect(assessBlueprintFit(createBlueprintPaperIntent(full.intent, full.review, 'review-required')).estimatedPages).toBe(2)
  const plan = structuredClone(full.intent.blueprint); plan.branches = plan.branches.slice(0, 4)
  plan.totalMarks = plan.branches.reduce((sum, branch) => sum + branch.marks, 0)
  const review = selectBlueprintPaper(plan, full.pool)
  const intent = { ...full.intent, blueprint: recordBlueprintSourceReview(plan, review, full.pool) }
  const within = createBlueprintPaperIntent(intent, review, 'review-required')
  expect(within.layout.estimateVersion).toBe(2)
  expect(assessBlueprintFit(within).estimatedPages).toBe(1)
  expect(blueprintDownloadAllowed(within)).toBe(true)
  const historical = structuredClone(within); historical.layout.estimateVersion = 1
  expect(blueprintDownloadAllowed(historical)).toBe(false)
  const larger = structuredClone(within)
  larger.snapshot.branches[0].passageGroup!.passage = 'Long unchanged passage line for layout review.\n'.repeat(100)
  expect(assessBlueprintFit(larger).estimatedPages).toBeGreaterThan(1)
  expect(blueprintDownloadAllowed(larger)).toBe(false)
  const fetcher = vi.fn(async () => ({ ok: false }))
  vi.stubGlobal('fetch', fetcher)
  for (const intent of [historical, larger]) {
    await expect(renderBlueprintPaper({ id: '33333333-3333-4333-8333-333333333333', savedAt: '2026-10-17T12:00:00Z', intent })).rejects.toThrow('exception')
  }
  expect(fetcher).not.toHaveBeenCalled()
  await expect(renderBlueprintPaper({ id: '33333333-3333-4333-8333-333333333333', savedAt: '2026-10-17T12:00:00Z', intent: within })).rejects.toThrow('template')
  larger.layout.decision = 'unchanged-two-page'
  expect(blueprintDownloadAllowed(larger)).toBe(true)
  await expect(renderBlueprintPaper({ id: '33333333-3333-4333-8333-333333333333', savedAt: '2026-10-17T12:00:00Z', intent: larger })).rejects.toThrow('template')
})
