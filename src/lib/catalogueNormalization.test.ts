import { describe, expect, it } from 'vitest'
import { normalizeCatalogueQuestion } from './catalogueNormalization'
import { parseExamgoInterchangeJson, parseMappedTeacherCsv, type StagedInterchangeQuestion } from './questionInterchange'
import { makeExam002Candidate } from './fixtures/phaseTenExam002Candidate'
import { SOURCE_STRUCTURE } from './fixtures/phaseNineSource'
import { questionInputPayload } from './questions'

const BANK_ID = '123e4567-e89b-42d3-a456-426614174000'

function staged(overrides: Partial<StagedInterchangeQuestion> = {}): StagedInterchangeQuestion {
  return {
    catalogueId: 'Q-1', type: 'multiple-choice', prompt: 'Choose a word.',
    unitTags: [1, 2], displayUnit: 2, lesson: '3', difficulty: 'medium',
    difficultyProvisional: true, selectionMarks: null, content: null,
    answer: { text: 'blue', option_label: 'B' }, groupIds: ['GRP-1'],
    groupCompleteness: 'complete',
    sourceFields: { option_a: 'red', option_b: 'blue', group_marks: '5' },
    issues: [], ...overrides,
  }
}

describe('catalogue conversion candidates', () => {
  it('maps an explicit colon relationship without altering wording or inventing its answer', () => {
    const source = staged({ type: 'word-relationship', prompt: 'father, dad : mother ______',
      content: null, answer: { text: 'mum' } })
    const before = JSON.stringify(source)
    const result = normalizeCatalogueQuestion(source, BANK_ID)
    expect(result.status).toBe('ready')
    if (result.status === 'ready') {
      expect(result.input.prompt).toBe(source.prompt)
      expect(result.input.relationshipWords).toEqual(['father, dad', 'mother ______'])
      expect(result.input.relationshipAcceptedAnswers).toEqual(['mum'])
    }
    expect(JSON.stringify(source)).toBe(before)
    expect(normalizeCatalogueQuestion({ ...source, prompt: 'one : two : three' }, BANK_ID).status).toBe('review')
  })
  it('preserves canonical typed meaning for all nine authorable types', () => {
    const fixture = [...makeExam002Candidate('tissue').branches, ...SOURCE_STRUCTURE.branches]
      .flatMap((branch) => branch.items.map((item) => item.question))
    const questions = [...new Map(fixture.map((question) => [question.type, question])).values()]
    expect(questions).toHaveLength(9)
    for (const question of questions) {
      const source = staged({ type: question.type, prompt: question.prompt, lesson: question.lesson,
        groupIds: [], groupCompleteness: null, content: question.content, answer: question.answer,
        sourceFields: { original: 'retained' } })
      const result = normalizeCatalogueQuestion(source, BANK_ID)
      expect(result.status, question.type).toBe('ready')
      if (result.status === 'ready') {
        const payload = questionInputPayload(result.input)
        expect(payload.content).toMatchObject(question.content)
        expect(payload.answer).toMatchObject(question.answer)
        expect(result.input.marks).toBeNull()
        const canonical = parseExamgoInterchangeJson(JSON.stringify({ format: 'examgo-question-interchange',
          version: 1, sourceNamespace: 'canonical-nine-types', questions: [source] }))
        const cell = (value: unknown) => `"${String(value).replaceAll('"', '""')}"`
        const csv = 'qid,units,question,kind,lesson,typed_question,typed_answer\n' +
          [source.catalogueId, '1,2', source.prompt, source.type, source.lesson,
            JSON.stringify(source.content), JSON.stringify(source.answer)].map(cell).join(',')
        const mapped = parseMappedTeacherCsv(csv, { externalId: 'qid', unit: 'units', prompt: 'question',
          questionType: 'kind', lesson: 'lesson', structuredContent: 'typed_question', structuredAnswer: 'typed_answer' },
        true, 'mapped-nine-types')
        expect(normalizeCatalogueQuestion(canonical.questions[0], BANK_ID)).toEqual(result)
        expect(normalizeCatalogueQuestion(mapped.questions[0], BANK_ID)).toEqual(result)
      }
    }
  })

  it('does not silently reinterpret invalid typed binary answers from legacy text', () => {
    expect(normalizeCatalogueQuestion(staged({ type: 'binary', content: { type: 'binary', schemaVersion: 1,
      labelMode: 'true-false' }, answer: { type: 'binary', schemaVersion: 1, text: 'True' } }), BANK_ID))
      .toMatchObject({ status: 'review' })
  })
  it('converts a reviewed MCQ without adopting source group marks', () => {
    const result = normalizeCatalogueQuestion(staged(), BANK_ID)
    expect(result.status).toBe('ready')
    if (result.status === 'ready') {
      expect(result.input).toMatchObject({ bankId: BANK_ID, externalId: 'Q-1',
        unit: 2, marks: null, difficulty: 'medium', correctOptionLabel: 'B' })
      expect(result.input.options).toEqual([{ label: 'A', text: 'red' }, { label: 'B', text: 'blue' }])
    }
  })

  it('maps matching pairs to separate stable answerable points', () => {
    const result = normalizeCatalogueQuestion(staged({
      type: 'matching', prompt: 'Match List A with List B.',
      content: { list_a: [{ label: '1', text: 'red' }, { label: '2', text: 'blue' }],
        list_b: [{ label: 'a', text: 'blue' }, { label: 'b', text: 'red' }] },
      answer: { pairs: [{ left: '1', right: 'b' }, { left: '2', right: 'a' }] },
    }), BANK_ID)
    expect(result.status).toBe('ready')
    if (result.status === 'ready') {
      expect(result.input.matchingPairs).toEqual([
        { leftId: 'left:1', rightId: 'right:b' },
        { leftId: 'left:2', rightId: 'right:a' },
      ])
      expect(result.input.marks).toBeNull()
    }
  })

  it('keeps a source writing model while leaving exam marks to the teacher', () => {
    const result = normalizeCatalogueQuestion(staged({
      type: 'extended-writing', prompt: 'Write about your school.',
      answer: { text: 'My school is in Baghdad.' },
    }), BANK_ID)
    expect(result.status).toBe('ready')
    if (result.status === 'ready') {
      expect(result.input.writingGuidance).toMatchObject({
        modelAnswer: 'My school is in Baghdad.', manualOnly: false,
      })
      expect(result.input.marks).toBeNull()
    }
  })

  it('leaves incomplete groups and missing source prompts in review', () => {
    expect(normalizeCatalogueQuestion(staged({ groupCompleteness: 'partial' }), BANK_ID))
      .toMatchObject({ status: 'review', reason: 'Source group is incomplete.' })
    expect(normalizeCatalogueQuestion(staged({ type: 'matching', prompt: '' }), BANK_ID))
      .toMatchObject({ status: 'review', reason: 'Source question prompt is missing.' })
  })

  it('accepts an ungrouped teacher question without invented group completeness', () => {
    const result = normalizeCatalogueQuestion(staged({ groupIds: [],
      groupCompleteness: null }), BANK_ID)
    expect(result.status).toBe('ready')
  })

  it('converts mapped teacher choice columns without requiring source marks', () => {
    const csv = 'qid,units,question,kind,lesson_no,choice_a,choice_b,correct_option\n' +
      'T-1,"1,2",Choose a color,multiple-choice,3,red,blue,B'
    const document = parseMappedTeacherCsv(csv, {
      externalId: 'qid', unit: 'units', prompt: 'question', questionType: 'kind',
      lesson: 'lesson_no', optionA: 'choice_a', optionB: 'choice_b',
      correctOptionLabel: 'correct_option',
    }, true, 'teacher-example')
    const result = normalizeCatalogueQuestion(document.questions[0], BANK_ID)
    expect(result.status).toBe('ready')
    if (result.status === 'ready') {
      expect(result.input).toMatchObject({ marks: null, unit: 2, correctOptionLabel: 'B' })
      expect(result.input.options).toHaveLength(2)
    }
  })

  it('keeps a printed arrow relationship as two answerable halves', () => {
    const result = normalizeCatalogueQuestion(staged({ type: 'word-relationship',
      prompt: 'Foot → ______', answer: { text: 'feet' } }), BANK_ID)
    expect(result.status).toBe('ready')
    if (result.status === 'ready') {
      expect(result.input.relationshipWords).toEqual(['Foot', '______'])
      expect(result.input.relationshipAcceptedAnswers).toEqual(['feet'])
    }
  })
})
