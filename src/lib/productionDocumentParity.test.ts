import { readFile } from 'node:fs/promises'
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import JSZip from 'jszip'
import { createExamDocumentBlobs } from './generateExam'
import { createPhaseNineDocumentBlobs, createPhaseNineSnapshot, type PhaseNineExamSnapshot } from './phaseNineWorkflow'
import { SOURCE_STRUCTURE, SETTINGS } from './fixtures/phaseNineSource'
import { SIMPLE_SETTINGS, SIMPLE_SOURCE_QUESTIONS } from './fixtures/simpleExamSource'
import { children, inspectDocx, WORD_NS } from './testSupport/docxPackage'

async function template(name: string): Promise<ArrayBuffer> {
  return Uint8Array.from(await readFile(`public/templates/${name}.docx`)).buffer
}

let phase8: [ArrayBuffer, ArrayBuffer]
let phase9: [ArrayBuffer, ArrayBuffer]
beforeAll(async () => {
  vi.stubGlobal('DOMParser', DOMParser)
  vi.stubGlobal('XMLSerializer', XMLSerializer)
  phase8 = await Promise.all(['iraqi-mainstream-simple-types-exam-v2', 'iraqi-mainstream-simple-types-answer-key-v2'].map(template)) as typeof phase8
  phase9 = await Promise.all(['iraqi-mainstream-phase-nine-exam-v1', 'iraqi-mainstream-phase-nine-answer-key-v1'].map(template)) as typeof phase9
})
afterAll(() => vi.unstubAllGlobals())

function render9(snapshot = createPhaseNineSnapshot(SOURCE_STRUCTURE, SETTINGS.selectionSeed), templates = phase9) {
  return createPhaseNineDocumentBlobs(snapshot, SETTINGS, 'Note: Answer all the questions.', ...templates)
}

describe('production Phase 8 package parity', () => {
  it('renders the source-backed mixed pair through the real simple-type entrypoint', async () => {
    const pair = await createExamDocumentBlobs(SIMPLE_SOURCE_QUESTIONS, SIMPLE_SETTINGS, ...phase8)
    const exam = await inspectDocx(pair.exam)
    const key = await inspectDocx(pair.answerKey)
    expect(exam.text).toContain('How many buttons in a mouse? ( Two buttons / Three buttons )')
    expect(exam.text).toContain('The first paper was made in China. ( True / False )')
    expect(exam.text).toContain("Where does Wisam's father work?")
    expect(exam.text).toContain('3M')
    expect(exam.text).not.toContain('An office')
    expect(exam.text).not.toContain('A. Two buttons')
    expect(key.tables.find((rows) => rows[0].map((cell) => cell.text).join('|') === 'Q|Point|Answer|Marks')?.map((row) => row.map((cell) => cell.text))).toEqual([
      ['Q', 'Point', 'Answer', 'Marks'],
      ['Q1', '1', 'A. Two buttons', '1'],
      ['Q2', '1', 'False', '1'],
      ['Q3', '1', 'An office', '1'],
    ])
    for (const document of [exam, key]) expect(document.text).toContain('Teacher: Anonymous')
  })

  it('rejects a mismatched MCQ label/text pair before creating documents', async () => {
    const questions = structuredClone(SIMPLE_SOURCE_QUESTIONS)
    if (questions[0].type !== 'multiple-choice') throw new Error('Fixture type')
    questions[0].correctAnswer.text = 'Three buttons'
    await expect(createExamDocumentBlobs(questions, SIMPLE_SETTINGS, ...phase8).then(() => undefined)).rejects.toThrow(/answer/i)
  })

  it('preserves approved Yes/No labels and short-answer variants in paired output', async () => {
    const questions = structuredClone(SIMPLE_SOURCE_QUESTIONS)
    if (questions[1].type !== 'binary' || questions[2].type !== 'short-answer') throw new Error('Fixture type')
    questions[1].labelMode = 'yes-no'
    questions[2].approvedVariants = ['In an office']
    const pair = await createExamDocumentBlobs(questions, SIMPLE_SETTINGS, ...phase8)
    expect((await inspectDocx(pair.exam)).text).toContain('( Yes / No )')
    const key = await inspectDocx(pair.answerKey)
    expect(key.text).toContain('No')
    expect(key.text).toContain('An office / In an office')
  })
})

describe('production Phase 9 package parity', () => {
  it('renders Q3/A–Q5 with exact answers, attempt-aware marks and branch-local merges', async () => {
    const snapshot = createPhaseNineSnapshot(SOURCE_STRUCTURE, SETTINGS.selectionSeed)
    const pair = await render9(snapshot)
    const exam = await inspectDocx(pair.exam)
    const key = await inspectDocx(pair.answerKey)
    const headings = ['Q3 A)-', 'Q3 B)-', 'Q4 A)-', 'Q4 B)-', 'Q5)-']
    const positions = headings.map((heading) => exam.text.indexOf(heading))
    expect(positions.every((position, index) => position >= 0 && (index === 0 || position > positions[index - 1]))).toBe(true)
    expect(snapshot.totalMarks).toBe(60)
    expect((exam.text.match(/\(10 M\.\)/g) ?? []).length).toBe(4)
    expect((exam.text.match(/\(20 M\.\)/g) ?? []).length).toBe(1)
    expect(exam.text).toContain('A- Write two notes to your brother and sister.')
    expect(exam.text).toContain('B- Write an email to your friend.')
    for (const answer of ['waiter', 'nicer', 'bought', 'on Saturday', 'expensive', 'Are Basim and Hiba twins ?', 'Manual marking']) expect(exam.text).not.toContain(answer)
    expect(exam.paragraphs.filter((p) => /_{20,}/.test(p.textContent ?? ''))).toHaveLength(1)
    const bank = exam.paragraphs.find((p) => p.textContent?.includes('{planets,  grater,  prices,  mall,  denim}'))
    expect(bank?.getElementsByTagNameNS(WORD_NS, 'jc')[0]?.getAttributeNS(WORD_NS, 'val')).toBe('center')
    const rows = key.tables.find((table) => table[0].map((cell) => cell.text).join('|') === 'Q|Part|Rule|Point|Answer|Mark|Total')!
    expect(rows).toHaveLength(21)
    const expectedAnswers = ['mall', 'planets', 'denim', 'prices', 'grater', 'saucepan', 'potato', 'wash', 'boy', 'jug', 'bread', 'waiter', 'nicer', 'bought', 'metre', 'on Saturday', 'expensive', 'Are Basim and Hiba twins ?', 'Manual marking — no approved model provided', '']
    expect(rows.slice(1).map((row) => row[4].text)).toEqual(expectedAnswers)
    const groups = [
      { start: 0, length: 5, q: '3', part: 'A', rule: 'Answer all 5', mark: '2', total: '10' },
      { start: 5, length: 6, q: '3', part: 'B', rule: 'Answer 5 of 6', mark: '2', total: '10' },
      { start: 11, length: 6, q: '4', part: 'A', rule: 'Answer 5 of 6', mark: '2', total: '10' },
      { start: 17, length: 1, q: '4', part: 'B', rule: 'Answer 1', mark: '10', total: '10' },
      { start: 18, length: 2, q: '5', part: '—', rule: 'Choose A or B', mark: '20', total: '20' },
    ]
    for (const group of groups) {
      const top = rows[group.start + 1]
      expect([top[0].text, top[1].text, top[2].text, top[5].text, top[6].text]).toEqual([group.q, group.part, group.rule, group.mark, group.total])
      for (let offset = 0; offset < group.length; offset++) {
        const row = rows[group.start + offset + 1]
        expect(row).toHaveLength(7)
        const merged = group.q === '5' ? [0, 1, 2, 4, 5, 6] : [0, 1, 2, 5, 6]
        for (const column of merged) {
          expect(row[column].merge).toBe(group.length === 1 ? null : offset === 0 ? 'restart' : 'continue')
          if (offset > 0) expect(row[column].text).toBe('')
        }
        expect(row[3].merge).toBeNull()
        expect(row[3].text).toBe(group.q === '5' ? ['A', 'B'][offset] : group.length === 1 ? 'Main' : String(offset + 1))
      }
    }
    expect(rows.flat().filter((cell) => cell.merge === 'restart')).toHaveLength(21)
    expect(rows.flat().filter((cell) => cell.merge === 'continue')).toHaveLength(76)
    for (const document of [exam, key]) expect(document.text).toContain('Teacher: Anonymous')
  })

  it('rejects a wrong answer-key template rather than returning a malformed pair', async () => {
    await expect(render9(undefined, [phase9[0], phase8[1]])).rejects.toThrow(/answer table/i)
  })

  it('rejects corrupted ZIP input', async () => {
    await expect(render9(undefined, [new ArrayBuffer(0), phase9[1]])).rejects.toThrow()
  })

  it('rejects inconsistent snapshot marks and unsupported versions', async () => {
    const snapshot = createPhaseNineSnapshot(SOURCE_STRUCTURE, SETTINGS.selectionSeed)
    await expect(render9({ ...snapshot, totalMarks: 80 })).rejects.toThrow(/total marks/i)
    await expect(render9({ ...snapshot, schemaVersion: 2 } as unknown as PhaseNineExamSnapshot)).rejects.toThrow(/version/i)
  })

  it('fails closed when the answer table loses a column', async () => {
    const zip = await JSZip.loadAsync(phase9[1])
    const xml = await zip.file('word/document.xml')!.async('string')
    const document = new DOMParser().parseFromString(xml, 'application/xml')
    const table = Array.from(document.getElementsByTagNameNS(WORD_NS, 'tbl')).find((candidate) => candidate.textContent?.includes('{#Answers}'))!
    const row = children(table, 'tr')[1]
    row.removeChild(children(row, 'tc')[5])
    zip.file('word/document.xml', new XMLSerializer().serializeToString(document))
    await expect(render9(undefined, [phase9[0], await zip.generateAsync({ type: 'arraybuffer' })])).rejects.toThrow(/seven cells/i)
  })

  it('uses blank identities rather than answer-map insertion order', async () => {
    const snapshot = createPhaseNineSnapshot(SOURCE_STRUCTURE, SETTINGS.selectionSeed)
    const question = snapshot.structure.branches[0].items[0].question
    if (question.type !== 'completion') throw new Error('Fixture type')
    question.answer.answers = Object.fromEntries(Object.entries(question.answer.answers).reverse())
    const pair = await render9(snapshot)
    const key = await inspectDocx(pair.answerKey)
    const rows = key.tables.find((table) => table[0].map((cell) => cell.text).join('|') === 'Q|Part|Rule|Point|Answer|Mark|Total')!
    expect(rows.slice(1, 6).map((row) => row[4].text)).toEqual(['mall', 'planets', 'denim', 'prices', 'grater'])
  })

  it('captures one validated aggregate before asynchronous template work', async () => {
    const snapshot = createPhaseNineSnapshot(SOURCE_STRUCTURE, SETTINGS.selectionSeed)
    const pending = render9(snapshot)
    snapshot.structure.branches[1].items[0].question.prompt = 'MUTATED AFTER START'
    snapshot.structure.branches[0].marks = 100
    const result = await pending
    expect((await inspectDocx(result.exam)).text).not.toContain('MUTATED AFTER START')
  })
})

describe('completion display/blank/answer alignment at the production boundary', () => {
  const cases = ['missing line', 'extra line', 'empty line', 'missing blank', 'extra blank', 'misaligned blank ids', 'missing answer', 'extra answer', 'duplicate blank id', 'missing visible blank', 'two blanks in one item']
  it.each(cases)('rejects %s before producing either document', async (problem) => {
    const snapshot = createPhaseNineSnapshot(SOURCE_STRUCTURE, SETTINGS.selectionSeed)
    const question = snapshot.structure.branches[0].items[0].question
    if (question.type !== 'completion') throw new Error('Fixture type')
    switch (problem) {
      case 'missing line': question.content.text = question.content.text.split('\n').slice(1).join('\n'); break
      case 'extra line': question.content.text += '\nExtra ..........'; break
      case 'empty line': question.content.text = question.content.text.replace('\n', '\n\n'); break
      case 'missing blank': question.content.blankIds.pop(); break
      case 'extra blank': question.content.blankIds.push('blank-6'); break
      case 'misaligned blank ids': question.content.blankIds.reverse(); break
      case 'missing answer': delete question.answer.answers['blank-1']; break
      case 'extra answer': question.answer.answers['unknown'] = 'mall'; break
      case 'duplicate blank id': question.content.blankIds[1] = 'blank-1'; break
      case 'missing visible blank': question.content.text = question.content.text.replace('..........', 'mall'); break
      case 'two blanks in one item': question.content.text = question.content.text.replace('We are', '.......... are'); break
    }
    await expect(render9(snapshot)).rejects.toThrow(/completion|blank|answer|display/i)
  })
})
