import { expect, it } from 'vitest'
import { QUESTION_INTERCHANGE_FORMAT, QUESTION_INTERCHANGE_VERSION, parseLegacyQuestionCsv, recognizeImportFile, suggestTeacherCsvMapping } from './questionInterchange'
import { prepareCataloguePromotion } from './cataloguePromotion'

const legacy = '\uFEFFexternal_id,unit,lesson,difficulty,prompt,option_a,option_b,correct_option_label\nQ-1,1,2,easy,Pick one,yes,no,A\n'
const papersHeaders = ['catalogue_id', 'question_type', 'question_text', 'unit', 'lesson', 'group_context_json',
  'group_completeness', 'structured_content_json', 'structured_answer_json', 'answer_text', 'source_occurrences_json']

it('recognises the legacy multiple-choice template, including a byte-order mark', () => {
  const result = recognizeImportFile('bank.csv', legacy)
  expect(result.format).toBe('legacy')
  expect(result.label).toContain('legacy template')
  expect(result.example.prompt).toBe('Pick one')
})

it('keeps legacy files importable through the same reviewed intake: a recognised legacy row passes conversion checks', () => {
  const recognized = recognizeImportFile('bank.csv', legacy)
  const document = parseLegacyQuestionCsv(legacy, 'legacy/teacher')
  const plan = prepareCataloguePromotion(document.questions, '11111111-1111-4111-8111-111111111111')
  expect(recognized.format).toBe('legacy')
  expect([plan.readyRows, plan.reviewRows]).toEqual([1, 0])
})

it('recognises the Papers master catalogue by its complete header set', () => {
  const csv = `${papersHeaders.join(',')}\n${papersHeaders.map(() => 'x').join(',')}\n`
  expect(recognizeImportFile('master.csv', csv).format).toBe('papers')
  // An incomplete Papers header set is not silently treated as Papers.
  expect(recognizeImportFile('master.csv', `${papersHeaders.slice(0, 5).join(',')}\n${papersHeaders.slice(0, 5).map(() => 'x').join(',')}\n`).format).toBe('teacher')
})

it('recognises versioned ExamGO JSON and rejects invalid JSON instead of guessing', () => {
  const file = JSON.stringify({ format: QUESTION_INTERCHANGE_FORMAT, version: QUESTION_INTERCHANGE_VERSION, sourceNamespace: 'unit-test',
    questions: [{ catalogueId: 'Q-1', type: 'multiple-choice', prompt: 'Pick', unitTags: [1], lesson: '1', difficulty: 'easy',
      content: { options: [{ label: 'A', text: 'yes' }, { label: 'B', text: 'no' }] }, answer: { correctOptionLabel: 'A' }, sourceFields: {} }] })
  expect(recognizeImportFile('export.json', file).format).toBe('examgo')
  expect(() => recognizeImportFile('export.json', '{ not json')).toThrow()
})

it('asks for readable confirmation on unfamiliar or ambiguous CSV columns', () => {
  const csv = 'qid,question,type,unit,answer,correct_answer,lesson\nA1,Where is it?,short-answer,2,In Baghdad,In Baghdad,4\n'
  const result = recognizeImportFile('teacher.csv', csv)
  expect(result.format).toBe('teacher')
  expect(result.missing).toEqual([])
  expect(result.ambiguous).toEqual(['answer'])
  expect(suggestTeacherCsvMapping(result.headers).answer).toBeUndefined()
  expect(result.example.question).toBe('Where is it?')
  const unfamiliar = recognizeImportFile('other.csv', 'Col 1,Col 2\nx,y\n')
  expect(unfamiliar.format).toBe('teacher')
  expect(unfamiliar.missing).toEqual(['externalId', 'unit', 'prompt', 'questionType'])
})
