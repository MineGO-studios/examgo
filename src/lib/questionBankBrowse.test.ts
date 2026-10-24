import { expect, it } from 'vitest'
import type { Question } from './questions'
import { BANK_PAGE_SIZE, EMPTY_BANK_FILTERS, bankQuestionCounts, browseBankQuestions } from './questionBankBrowse'

const question = (index: number, patch: Partial<Question> = {}): Question => ({
  id: `q${index}`, prompt: `Prompt ${index}`, external_id: `EXT-${index}`, unit: 1 + (index % 4), lesson: String(index % 7),
  question_type: index % 3 ? 'multiple-choice' : 'binary', is_active: index % 5 !== 0, ...patch,
} as Question)

const rows = Array.from({ length: 60 }, (_, index) => question(index + 1))
const linked = new Set(['q2', 'q3', 'q4'])

it('counts usable, inactive and linked questions without guessing unknown membership', () => {
  expect(bankQuestionCounts(rows, linked)).toEqual({ total: 60, usable: 48, inactive: 12, linked: 3 })
  expect(bankQuestionCounts(rows, null).linked).toBeNull()
})

it('returns a bounded page and clamps out-of-range pages', () => {
  const first = browseBankQuestions(rows, EMPTY_BANK_FILTERS, linked, 1)
  expect(first.rows).toHaveLength(BANK_PAGE_SIZE)
  expect([first.first, first.last, first.pages, first.matching]).toEqual([1, 25, 3, 60])
  const last = browseBankQuestions(rows, EMPTY_BANK_FILTERS, linked, 99)
  expect([last.page, last.first, last.last, last.rows.length]).toEqual([3, 51, 60, 10])
  expect(browseBankQuestions([], EMPTY_BANK_FILTERS, linked, 1)).toMatchObject({ rows: [], page: 1, pages: 1, first: 0, last: 0 })
})

it('searches prompt, identifier, lesson and unit, and filters by type, status and linked context', () => {
  expect(browseBankQuestions(rows, { ...EMPTY_BANK_FILTERS, search: 'ext-17' }, linked, 1).rows.map(r => r.id)).toEqual(['q17'])
  expect(browseBankQuestions(rows, { ...EMPTY_BANK_FILTERS, search: '  prompt   42 ' }, linked, 1).rows.map(r => r.id)).toEqual(['q42'])
  const binary = browseBankQuestions(rows, { ...EMPTY_BANK_FILTERS, type: 'binary' }, linked, 1)
  expect(binary.matching).toBe(20); expect(binary.rows.every(r => r.question_type === 'binary')).toBe(true)
  expect(browseBankQuestions(rows, { ...EMPTY_BANK_FILTERS, status: 'inactive' }, linked, 1).rows.every(r => !r.is_active)).toBe(true)
  expect(browseBankQuestions(rows, { ...EMPTY_BANK_FILTERS, linked: 'linked' }, linked, 1).rows.map(r => r.id)).toEqual(['q2', 'q3', 'q4'])
  expect(browseBankQuestions(rows, { ...EMPTY_BANK_FILTERS, linked: 'standalone' }, linked, 1).matching).toBe(57)
  // Unknown membership never hides questions behind the linked filter.
  expect(browseBankQuestions(rows, { ...EMPTY_BANK_FILTERS, linked: 'linked' }, null, 1).matching).toBe(60)
})
