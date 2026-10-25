import { expect, it } from 'vitest'
import { parseMappedTeacherCsv } from './questionInterchange'
import { prepareCataloguePromotion } from './cataloguePromotion'
import { importOutcomeTotals, importReviewMessage, reviewImportQuestion } from './importInterpretation'

const BANK = '123e4567-e89b-42d3-a456-426614174000'
const csv = 'qid,units,question,kind,lesson,left,right,correct,notes\nQ1,"1,2",Choose,multiple-choice,1,Yes,No,B,"original\ncontext"'
const mapping = { externalId: 'qid', unit: 'units', prompt: 'question', questionType: 'kind',
  lesson: 'lesson', optionA: 'left', optionB: 'right', correctOptionLabel: 'correct' }

it('shows original unfamiliar fields beside the actual interpreted options and answer without marks', () => {
  const doc = parseMappedTeacherCsv(csv, mapping, true, 'review')
  const before = structuredClone(doc)
  const result = reviewImportQuestion(doc.questions[0], BANK, prepareCataloguePromotion(doc.questions, BANK))
  expect(result.original.notes).toBe('original\ncontext')
  expect(result.content).toMatchObject({ options: [{ label: 'A', text: 'Yes' }, { label: 'B', text: 'No' }] })
  expect(result.answer).toMatchObject({ correctOptionLabel: 'B' })
  expect(result.heldForReview).toBe(false)
  expect(doc).toEqual(before)
})

it('keeps a group-held row visible and gives field, cause and remedy for unresolved interpretation', () => {
  const doc = parseMappedTeacherCsv(csv, mapping, true, 'review')
  const row = { ...doc.questions[0], lesson: null }
  const result = reviewImportQuestion(row, BANK, prepareCataloguePromotion([row], BANK))
  expect(result.heldForReview).toBe(true)
  expect(result.interpreted).toBe(false)
  expect(result.messages).toContainEqual(expect.objectContaining({ field: 'lesson', status: 'missing',
    cause: 'Lesson is missing.', remedy: expect.stringContaining('map the lesson') }))
  expect(importReviewMessage('Source group is incomplete.')).toMatchObject({ field: 'group/context', status: 'missing',
    cause: 'Some linked questions in this passage or exercise are missing from the file.',
    remedy: expect.stringContaining('Include every question') })
  expect(importReviewMessage('Q1/A: Source group is incomplete.').cause).toBe('Q1/A: Some linked questions in this passage or exercise are missing from the file.')
  const incomplete = { ...doc.questions[0], groupCompleteness: 'incomplete' as const, issues: ['group-incomplete'] }
  const problems = reviewImportQuestion(incomplete, BANK).messages
  expect(problems.filter(message => message.cause.includes('linked questions'))).toHaveLength(1)
  expect(incomplete.issues).toEqual(['group-incomplete'])
})

it('reports retries as unchanged rather than updating source questions or inventing duplicate writes', () => {
  expect(importOutcomeTotals(1605, 1209, 1605)).toEqual({ added: 0, updated: 0, unchanged: 1605,
    duplicate: 0, rejected: 0, review: 1209 })
})
