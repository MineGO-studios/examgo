import type { Question } from './questions'

export const BANK_PAGE_SIZE = 25

export interface BankQuestionFilters {
  search: string
  type: string
  status: 'all' | 'usable' | 'inactive'
  linked: 'all' | 'standalone' | 'linked'
  /** Narrow to one unit, from the coverage strip; empty for every unit. */
  unit?: number | ''
}

export const EMPTY_BANK_FILTERS: BankQuestionFilters = { search: '', type: '', status: 'all', linked: 'all' }

export interface BankQuestionCounts {
  total: number
  /** Active questions: can enter new papers (linked children only with their complete passage or exercise). */
  usable: number
  /** Inactive questions stay in the bank and in saved papers but are excluded from new papers. */
  inactive: number
  /** Children of a passage or completion exercise; null when membership could not be loaded. */
  linked: number | null
}

const normalize = (value: string) => value.toLocaleLowerCase().replace(/\s+/g, ' ').trim()

export function bankQuestionCounts(questions: readonly Question[], linkedIds: ReadonlySet<string> | null): BankQuestionCounts {
  const usable = questions.filter(question => question.is_active).length
  return { total: questions.length, usable, inactive: questions.length - usable,
    linked: linkedIds ? questions.filter(question => linkedIds.has(question.id)).length : null }
}

/** Search and filter in memory, then return one bounded page; never more than BANK_PAGE_SIZE rows. */
export function browseBankQuestions(questions: readonly Question[], filters: BankQuestionFilters, linkedIds: ReadonlySet<string> | null, page: number) {
  const search = normalize(filters.search)
  const matches = questions.filter(question =>
    (!search || normalize(`${question.prompt} ${question.external_id ?? ''} ${question.lesson} unit ${question.unit}`).includes(search)) &&
    (!filters.type || question.question_type === filters.type) &&
    (filters.unit === undefined || filters.unit === '' || question.unit === filters.unit) &&
    (filters.status === 'all' || (filters.status === 'usable') === question.is_active) &&
    (filters.linked === 'all' || !linkedIds || (filters.linked === 'linked') === linkedIds.has(question.id)))
  const pages = Math.max(1, Math.ceil(matches.length / BANK_PAGE_SIZE))
  const current = Math.min(Math.max(1, Math.trunc(page) || 1), pages)
  const start = (current - 1) * BANK_PAGE_SIZE
  return { rows: matches.slice(start, start + BANK_PAGE_SIZE), matching: matches.length, page: current, pages,
    first: matches.length ? start + 1 : 0, last: Math.min(start + BANK_PAGE_SIZE, matches.length) }
}
