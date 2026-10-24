import { describe, expect, it } from 'vitest'
import {
  parseExamgoInterchangeJson, parseLegacyQuestionCsv, parseMappedTeacherCsv, parsePapersCatalogueCsv,
  parseStoredTeacherCsvMapping, suggestTeacherCsvMapping, type TeacherCsvMapping,
} from './questionInterchange'

const papersHeaders = [
  'catalogue_id', 'question_type', 'question_text', 'unit', 'lesson',
  'group_context_json', 'group_completeness', 'structured_content_json',
  'structured_answer_json', 'answer_text', 'source_occurrences_json', 'group_marks',
]

describe('stored teacher column choices', () => {
  const headers = ['id', 'unit', 'question', 'type', 'answer', 'سؤال']
  it('loads complete and partial mappings without changing exact column text', () => {
    const mapping = { externalId: 'id', unit: 'unit', prompt: 'سؤال', questionType: 'type', answer: '' }
    expect(parseStoredTeacherCsvMapping(JSON.stringify(mapping), headers)).toEqual(mapping)
    expect(parseStoredTeacherCsvMapping('{"prompt":"question"}', headers)).toEqual({ prompt: 'question' })
    expect(parseStoredTeacherCsvMapping('{}', headers)).toEqual({})
  })

  it.each(['null', '[]', '["id"]', '"id"', '1', 'false', '{', '{"prompt":null}',
    '{"prompt":false}', '{"prompt":0}', '{"prompt":[]}', '{"prompt":{}}',
    '{"unknown":"id"}', '{"__proto__":"id"}', '{"constructor":"id"}', '{"toString":"id"}',
  ])('rejects invalid storage shape %s without echoing its contents', (text) => {
    expect(() => parseStoredTeacherCsvMapping(text, headers)).toThrow('Saved column choices are invalid. Choose the columns again for this file.')
  })

  it('rejects stale column names and still requires explicit confirmation and required columns', () => {
    expect(() => parseStoredTeacherCsvMapping('{"prompt":"private-missing-column"}', headers))
      .toThrow('A saved column is missing from this file. Choose the columns again for this file.')
    const partial = parseStoredTeacherCsvMapping('{"prompt":"question"}', headers) as TeacherCsvMapping
    const csv = 'id,unit,question,type,answer\nQ1,1,Where?,short-answer,Here'
    expect(() => parseMappedTeacherCsv(csv, partial, false, 'teacher')).toThrow(/Confirm/)
    expect(() => parseMappedTeacherCsv(csv, partial, true, 'teacher')).toThrow(/missing/)
    expect(() => parseMappedTeacherCsv(csv, [] as unknown as TeacherCsvMapping, true, 'teacher')).toThrow(/invalid/)
  })

  it('allows an optional column explicitly unset by the teacher UI', () => {
    const csv = 'id,unit,question,type,answer\nQ1,1,Where?,short-answer,Here'
    const mapping: TeacherCsvMapping = { externalId: 'id', unit: 'unit', prompt: 'question', questionType: 'type', answer: undefined }
    expect(parseMappedTeacherCsv(csv, mapping, true, 'teacher').questions[0].prompt).toBe('Where?')
    expect(parseStoredTeacherCsvMapping(JSON.stringify(mapping), headers)).not.toHaveProperty('answer')
  })
})

function csvRow(values: string[]): string {
  return values.map((value) => `"${value.replaceAll('"', '""')}"`).join(',')
}

describe('Phase 11 interchange adapters', () => {
  it('preserves mixed units, group context, source marks, Unicode, multiline text and long provenance', () => {
    const source = [csvRow(papersHeaders), csvRow([
      'Q-1', 'short-answer', 'Where?\nأين؟', '1,2', '5',
      JSON.stringify([{ group_id: 'GRP-1' }]), 'partial', '',
      JSON.stringify({ text: 'Here', status: 'reviewer_checked' }), 'Here', 'x'.repeat(37_137), '10',
    ])].join('\n')
    const result = parsePapersCatalogueCsv(source)
    expect(result.questions).toHaveLength(1)
    expect(result.questions[0]).toMatchObject({
      unitTags: [1, 2], displayUnit: 2, groupIds: ['GRP-1'],
      difficulty: 'medium', difficultyProvisional: true, selectionMarks: null,
      issues: ['group-incomplete'],
    })
    expect(result.questions[0].sourceFields.group_marks).toBe('10')
    expect(result.questions[0].sourceFields.source_occurrences_json).toHaveLength(37_137)
    expect(result.questions[0].prompt).toBe('Where?\nأين؟')
    expect(parseExamgoInterchangeJson(JSON.stringify(result))).toEqual(result)
  })

  it('requires confirmed mappings and accepts differently arranged teacher files', () => {
    const first = [
      'question_id,question,units,type,answer,points,lesson_no,extra',
      'Q1,What?,1,multiple-choice,A,2,3,retain-me',
    ].join('\n')
    const firstHeaders = first.split('\n')[0].split(',')
    const firstMapping = suggestTeacherCsvMapping(firstHeaders) as TeacherCsvMapping
    expect(firstMapping).toMatchObject({ externalId: 'question_id', prompt: 'question', unit: 'units', questionType: 'type', marks: 'points' })
    expect(() => parseMappedTeacherCsv(first, firstMapping, false, 'teacher-a')).toThrow(/Confirm/)
    const firstQuestion = parseMappedTeacherCsv(first, firstMapping, true, 'teacher-a').questions[0]
    expect(firstQuestion).toMatchObject({ catalogueId: 'Q1', selectionMarks: null, lesson: '3', difficultyProvisional: true })
    expect(firstQuestion.sourceFields.points).toBe('2')
    expect(firstQuestion.sourceFields.extra).toBe('retain-me')

    const second = 'kind,prompt,id,unit,correct_answer,level\nrewrite,Fix it,R2,"1,3",Fixed,hard'
    const secondMapping = suggestTeacherCsvMapping(second.split('\n')[0].split(',')) as TeacherCsvMapping
    const secondQuestion = parseMappedTeacherCsv(second, secondMapping, true, 'teacher-b').questions[0]
    expect(secondQuestion).toMatchObject({ catalogueId: 'R2', displayUnit: 3, unitTags: [1, 3],
      difficulty: 'hard', difficultyProvisional: false, selectionMarks: null })
  })

  it('stages source matching sets with a missing printed prompt for review', () => {
    const source = [csvRow(papersHeaders), csvRow([
      'Q-1933', 'matching', '', '2', '4',
      JSON.stringify([{ group_id: 'GRP-0620' }]), 'complete',
      JSON.stringify({ list_a: [{ label: '1', text: 'red' }],
        list_b: [{ label: 'a', text: 'blue' }] }),
      JSON.stringify({ pairs: [{ left: '1', right: 'a' }] }), '', '[]', '',
    ])].join('\n')
    const result = parsePapersCatalogueCsv(source)
    expect(result.questions[0]).toMatchObject({
      catalogueId: 'Q-1933', prompt: '', issues: ['prompt-missing'],
      selectionMarks: null, groupIds: ['GRP-0620'],
    })
  })

  it('rejects duplicate IDs, invalid versions and damaged source JSON', () => {
    const base = { format: 'examgo-question-interchange', version: 1,
      sourceNamespace: 'teacher', questions: [{ catalogueId: 'X', type: 'binary',
        prompt: 'True?', unitTags: [1], lesson: '1', difficulty: 'medium',
        selectionMarks: null, sourceFields: { id: 'X' }, groupIds: [], answer: 'True' }] }
    expect(() => parseExamgoInterchangeJson(JSON.stringify({ ...base, version: 2 }))).toThrow(/version/)
    expect(() => parseExamgoInterchangeJson(JSON.stringify({ ...base, questions: [base.questions[0], base.questions[0]] }))).toThrow(/Duplicate/)
    const damaged = [csvRow(papersHeaders), csvRow(['Q-1', 'binary', 'True?', '1', '1', '{', 'complete', '', '', 'True', '[]', ''])].join('\n')
    expect(() => parsePapersCatalogueCsv(damaged)).toThrow(/invalid JSON/)
    const unitNine = { ...base, questions: [{ ...base.questions[0], unitTags: [2, 9] }] }
    expect(() => parseExamgoInterchangeJson(JSON.stringify(unitNine))).toThrow(/1 to 8/)
    const teacher = 'id,unit,prompt,type,answer\nX,9,True?,binary,True'
    expect(() => parseMappedTeacherCsv(teacher, {
      externalId: 'id', unit: 'unit', prompt: 'prompt', questionType: 'type', answer: 'answer',
    }, true, 'teacher')).toThrow(/1 to 8/)
  })

  it('routes legacy MCQ rows through existing validation and preserves typed meaning', () => {
    const csv = 'external_id,unit,lesson,difficulty,prompt,option_a,option_b,correct_option_label\nQ1,2,3,medium,Choose,Aye,Nay,A'
    const result = parseLegacyQuestionCsv(csv, 'legacy/teacher')
    expect(result.questions[0]).toMatchObject({
      catalogueId: 'Q1', type: 'multiple-choice', unitTags: [2], displayUnit: 2,
      selectionMarks: null, difficultyProvisional: false, issues: [],
      content: { options: [{ label: 'A', text: 'Aye' }, { label: 'B', text: 'Nay' }] },
      answer: { correctOptionLabel: 'A' },
    })
    expect(parseExamgoInterchangeJson(JSON.stringify(result))).toEqual(result)
  })
})
