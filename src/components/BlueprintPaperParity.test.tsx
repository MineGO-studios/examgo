import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import type { CompoundSnapshot } from '../domain/compoundStructure'
import { makeBlueprintPaperFixture } from '../lib/fixtures/blueprintPaper'
import { createBlueprintPaperIntent, blueprintPaperSettings, parseBlueprintPaperIntent } from '../lib/examBlueprintPaper'
import { createCompoundDocumentBlobs } from '../lib/compoundWorkflow'
import { inspectDocx } from '../lib/testSupport/docxPackage'
import type { ExamSettings } from '../types/exam'
import BlueprintPaperReview from './BlueprintPaperReview'

afterEach(() => vi.unstubAllGlobals())

const squash = (value: string) => value.replace(/\s+/g, '')
const decode = (value: string) => value.replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')

/** Expands rowSpan cells so a preview table compares row-by-row with the DOCX vMerge table. */
function previewKeyGrid(html: string) {
  const table = html.slice(html.indexOf('<table>'), html.indexOf('</table>') + 8)
  const document = new DOMParser().parseFromString(table, 'text/xml')
  const rows = Array.from(document.getElementsByTagName('tr'))
  const grid: string[][] = [], pending = new Map<number, { value: string; left: number }>()
  for (const row of rows) {
    const cells = Array.from(row.childNodes).filter(node => node.nodeType === 1) as Element[]
    const out: string[] = []
    for (let column = 0, next = 0; column < 7; column++) {
      const carried = pending.get(column)
      if (carried) { out.push(carried.value); if (--carried.left === 0) pending.delete(column); continue }
      const cell = cells[next++]; if (!cell) break
      const value = decode(cell.textContent ?? ''), span = Number(cell.getAttribute('rowSpan') || cell.getAttribute('rowspan') || 1)
      if (span > 1) pending.set(column, { value, left: span - 1 })
      out.push(value)
    }
    grid.push(out)
  }
  return grid
}

async function production(snapshot: CompoundSnapshot, settings: ExamSettings, instruction: string) {
  vi.stubGlobal('DOMParser', DOMParser); vi.stubGlobal('XMLSerializer', XMLSerializer)
  const units = [...new Set(snapshot.branches.flatMap(b => b.items.map(i => i.question.unit)))].sort((a, b) => a - b)
  const templates = await Promise.all(['exam', 'answer-key'].map(async kind => Uint8Array.from(await readFile(`public/templates/iraqi-mainstream-phase-nine-${kind}-v1.docx`)).buffer))
  const pair = await createCompoundDocumentBlobs(snapshot, settings, instruction, templates[0], templates[1], units)
  return Promise.all([inspectDocx(pair.exam), inspectDocx(pair.answerKey)])
}

function expectParity(snapshot: CompoundSnapshot, settings: ExamSettings, instruction: string, student: Awaited<ReturnType<typeof production>>[0], key: Awaited<ReturnType<typeof production>>[1]) {
  const render = (mode: 'student' | 'key') => renderToStaticMarkup(<BlueprintPaperReview snapshot={snapshot} settings={settings} generalInstruction={instruction} initialMode={mode} />)
  const studentHtml = render('student'), visible = squash(decode(studentHtml.replace(/<[^>]+>/g, '')))
  // Every printed student cell and paragraph (order, numbering, passages, options, matching identities, point marks, footer) appears in order.
  const printed = [...student.tables.slice(1).flatMap(table => table.flatMap(row => row.map(cell => cell.text))), ...student.text.split(/\n+/)]
    .map(text => squash(text)).filter(Boolean)
  for (const text of printed) expect(visible).toContain(text)
  let cursor = 0
  for (const table of student.tables.slice(1)) {
    const first = squash(table[0][0].text), at = visible.indexOf(first, cursor)
    expect(at).toBeGreaterThanOrEqual(cursor); cursor = at
  }
  expect(visible).toContain(squash(`Teacher: ${settings.teacherName ?? ''}`))
  // The answer key preview has the production columns, order, rows, answers, rules, marks and totals.
  const docxKey = key.tables.find(table => table[0].map(cell => cell.text).join('|') === 'Q|Part|Rule|Point|Answer|Mark|Total')!
  const expanded: string[] = []
  const docxGrid = docxKey.map(row => row.map((cell, column) => cell.merge === 'continue' ? expanded[column] : (expanded[column] = cell.text)))
  expect(previewKeyGrid(render('key'))).toEqual(docxGrid)
}

it('keeps live and reopened student and answer-key previews identical in content to the production DOCX pair', async () => {
  // Full 60-mark fixture: passage group, MCQ, binary, bracket choice, wide and narrow matching, completion word bank, rewrite task, writing alternatives.
  for (const { intent, review } of [makeBlueprintPaperFixture()]) {
    const live = createBlueprintPaperIntent(intent, review, 'unchanged-two-page'), settings = blueprintPaperSettings(live)
    const [student, key] = await production(live.snapshot, settings, live.intent.generalInstruction)
    expectParity(live.snapshot, settings, live.intent.generalInstruction, student, key)
    // Reopened finalized paper: the immutable envelope after a JSON round-trip renders the same content.
    const reopened = parseBlueprintPaperIntent(JSON.parse(JSON.stringify(live)))
    expectParity(reopened.snapshot, blueprintPaperSettings(reopened), reopened.intent.generalInstruction, student, key)
  }
})

it('detects a stale preview: an edited mark changes the production key and no longer matches the old preview', async () => {
  const { intent, review } = makeBlueprintPaperFixture()
  const live = createBlueprintPaperIntent(intent, review, 'unchanged-two-page'), settings = blueprintPaperSettings(live)
  const [student, key] = await production(live.snapshot, settings, live.intent.generalInstruction)
  const edited = structuredClone(live.snapshot), branch = edited.branches.find(b => b.kind === 'questions' && b.marks >= 10)!
  const marks = branch.pointMarks!, points = Object.keys(marks)
  marks[points[0]] += 1; marks[points[1]] -= 1
  expect(() => expectParity(edited, settings, live.intent.generalInstruction, student, key)).toThrow()
})
