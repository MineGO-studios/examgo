import { readFile } from 'node:fs/promises'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createExamDocumentBlobs } from './generateExam'
import { renderBlueprintPaper } from './blueprintPaperDelivery'
import { createBlueprintPaperIntent } from './examBlueprintPaper'
import { makeBlueprintPaperFixture } from './fixtures/blueprintPaper'
import { inspectDocx, WORD_NS } from './testSupport/docxPackage'
import type { ExamQuestion } from '../types/question'
import { validateDocumentText } from './documentText'
import { createPhaseNineDocumentBlobs, createPhaseNineSnapshot } from './phaseNineWorkflow'
import { SOURCE_STRUCTURE, SETTINGS } from './fixtures/phaseNineSource'

afterEach(() => vi.unstubAllGlobals())

function useLocalTemplates() {
  vi.stubGlobal('DOMParser', DOMParser)
  vi.stubGlobal('XMLSerializer', XMLSerializer)
  vi.stubGlobal('fetch', async (url: string) => ({
    ok: true, arrayBuffer: async () => Uint8Array.from(await readFile('public' + url)).buffer,
  }))
}

const settings = { schoolName: 'School', examTitle: 'Security fixture', teacherName: 'Teacher',
  grade: 6, unit: 1, marksPerQuestion: 1, questionCount: 1, selectionSeed: 17 }
const question: ExamQuestion = { id: 'hostile-text', unit: 1, lesson: '1', type: 'short-answer', difficulty: 'easy',
  prompt: '<w:injected> & ]]> ‏سؤال', marks: 1, answerLines: 1,
  canonicalAnswer: 'KEY_ONLY <w:injected> & ]]> ‏جواب', approvedVariants: [], caseSensitive: false }

async function simplePair(questions: readonly ExamQuestion[]) {
  const templates = await Promise.all(['exam', 'answer-key'].map(async kind =>
    Uint8Array.from(await readFile(`public/templates/iraqi-mainstream-simple-types-${kind}-v2.docx`)).buffer))
  return createExamDocumentBlobs(questions, settings, templates[0], templates[1])
}

describe('hostile text through production document entrypoints', () => {
  it('keeps XML-like question/answer text literal and answers isolated in the simple pair', async () => {
    useLocalTemplates()
    const pair = await simplePair([question])
    const [student, key] = await Promise.all([
      inspectDocx(pair.exam), inspectDocx(pair.answerKey),
    ])
    expect(student.text).toContain(question.prompt)
    expect(student.text).not.toContain('KEY_ONLY')
    expect(key.text).toContain(question.canonicalAnswer)
    for (const doc of [student, key]) {
      expect(doc.document.getElementsByTagNameNS(WORD_NS, 'injected')).toHaveLength(0)
      expect(doc.xml).toContain('&lt;w:injected&gt;')
    }
  })

  it('keeps XML-like instructions and RTL marks literal in an immutable blueprint pair', async () => {
    useLocalTemplates()
    const { intent, review } = makeBlueprintPaperFixture()
    intent.generalInstruction = 'Follow <w:injected> & ]]> ‏تعليمات'
    const paper = createBlueprintPaperIntent(intent, review, 'unchanged-two-page')
    const pair = await renderBlueprintPaper({ id: '33333333-3333-4333-8333-333333333333', savedAt: '2026-10-18T08:00:00Z', intent: paper })
    const student = await inspectDocx(await pair.exam.blob.arrayBuffer())
    const key = await inspectDocx(await pair.answerKey.blob.arrayBuffer())
    expect(student.text).toContain(intent.generalInstruction)
    for (const doc of [student, key]) expect(doc.document.getElementsByTagNameNS(WORD_NS, 'injected')).toHaveLength(0)
  })

  it('rejects illegal XML controls before preparing either simple document', async () => {
    useLocalTemplates()
    await expect(simplePair([{ ...question, prompt: 'Before\u0001after' }]).then(() => 'pair prepared'))
      .rejects.toThrow(/unsupported.*character/i)
    await expect(simplePair([{ ...question, canonicalAnswer: 'Before\u0000after' }]).then(() => 'pair prepared'))
      .rejects.toThrow(/unsupported.*character/i)
    expect(question.prompt).toContain('<w:injected>')
  })

  it('rejects invalid XML characters in both structured production paths without rewriting captured intent', async () => {
    useLocalTemplates()
    const { intent, review } = makeBlueprintPaperFixture()
    intent.generalInstruction = 'Before\u0001after'
    const paper = createBlueprintPaperIntent(intent, review, 'unchanged-two-page')
    const before = structuredClone(paper)
    await expect(renderBlueprintPaper({ id: '33333333-3333-4333-8333-333333333333', savedAt: '2026-10-18T08:00:00Z', intent: paper })
      .then(() => 'pair prepared')).rejects.toThrow(/unsupported.*character/i)
    expect(paper).toEqual(before)
    const templates = await Promise.all(['exam', 'answer-key'].map(async kind =>
      Uint8Array.from(await readFile(`public/templates/iraqi-mainstream-phase-nine-${kind}-v1.docx`)).buffer))
    await expect(createPhaseNineDocumentBlobs(createPhaseNineSnapshot(SOURCE_STRUCTURE, 17), SETTINGS,
      'Before\u0001after', templates[0], templates[1]).then(() => 'pair prepared')).rejects.toThrow(/unsupported.*character/i)
  })

  it('allows XML whitespace, Arabic, RTL marks and supplementary characters while rejecting invalid code points', () => {
    expect(() => validateDocumentText({ text: ['Tab\tLine\nReturn\rعربي ‏ ‮ 😀'] })).not.toThrow()
    for (const value of ['\u0000', '\u0001', '\u000b', '\u000c', '\u001f', '\ud800', '\udfff', '\ufffe', '\uffff']) {
      expect(() => validateDocumentText({ text: [value] })).toThrow(/unsupported.*character/i)
    }
  })
})
