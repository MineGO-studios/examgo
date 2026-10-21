import type { CSSProperties } from 'react'
import type { QuestionInput } from '../lib/questions'
import { bankQuestionCounts, browseBankQuestions, type BankQuestionFilters, type BankBrowserQuestion } from '../lib/questionBankBrowse'
import { questionAnswerPreview, questionTypeMark, unitCounts } from '../lib/questionCards'
import { ChoiceChips } from './controls'

const questionTypeLabels: Record<QuestionInput['questionType'], string> = {
  'multiple-choice': 'Multiple choice',
  binary: 'True/False or Yes/No',
  'short-answer': 'Short open answer',
  completion: 'Word-bank completion',
  'odd-word': 'Odd-word selection',
  'word-relationship': 'Word relationship / transformation',
  rewrite: 'Punctuation / capitalization rewrite',
  'extended-writing': 'Extended writing / composition',
  matching: 'Match List A and List B',
}

/** Same unit overview, filters, cards and paging for personal and published banks. */
export default function QuestionBankBrowser<T extends BankBrowserQuestion>({ questions, linkedIds, filters, setFilters, page, setPage, readOnly=false, isBusy=false, onAction, actionLabel, onAdd, onImport }: {
  questions: readonly T[]; linkedIds: ReadonlySet<string>|null; filters: BankQuestionFilters;
  setFilters: (filters: BankQuestionFilters)=>void; page:number; setPage:(page:number)=>void;
  readOnly?:boolean; isBusy?:boolean; onAction?:(question:T)=>void; actionLabel?:(question:T)=>string;
  onAdd?:()=>void; onImport?:()=>void;
}) {
        const counts = bankQuestionCounts(questions, linkedIds)
        const result = browseBankQuestions(questions, filters, linkedIds, page)
        const types = [...new Set(questions.map((question) => question.question_type))].sort()
        const setFilter = (patch: Partial<BankQuestionFilters>) => { setFilters({ ...filters, ...patch }); setPage(1) }
        const typeOptions = [{ value: '', label: 'All types' }, ...types.map((type) => ({ value: type, label: questionTypeLabels[type as QuestionInput['questionType']] ?? type }))]
        const units = unitCounts(questions)
        const largest = Math.max(1, ...units.map((entry) => entry.total))
        return <section className="question-browser" aria-labelledby="saved-questions-title">
          {units.length > 0 && <section className="qb-units" aria-labelledby="qb-units-title">
            <div className="qb-units-head">
              <h3 id="qb-units-title">Questions by unit</h3>
              {filters.unit !== undefined && filters.unit !== '' && <button type="button" className="button-quiet" onClick={() => setFilter({ unit: '' })}>Show every unit</button>}
            </div>
            <ul>
              {units.map((entry, order) => <li key={entry.unit}>
                <button type="button" aria-pressed={filters.unit === entry.unit}
                  aria-label={`Unit ${entry.unit}, ${entry.total} question${entry.total === 1 ? '' : 's'}, ${entry.usable} ${readOnly ? 'published' : 'ready'}`}
                  style={{ '--unit': `var(--eg-unit-${entry.unit >= 1 && entry.unit <= 4 ? entry.unit : 'none'})`, '--share': entry.total / largest, '--ready': entry.total ? entry.usable / entry.total : 0, '--n': order } as CSSProperties}
                  onClick={() => setFilter({ unit: filters.unit === entry.unit ? '' : entry.unit })}>
                  <span className="qb-unit-name">Unit {entry.unit}</span>
                  <span className="qb-unit-bar" aria-hidden="true"><i /></span>
                  <span className="qb-unit-count">{entry.total}</span>
                </button>
              </li>)}
            </ul>
          </section>}
          <div className="question-browser-header">
            <h3 id="saved-questions-title">Questions</h3>
            <p className="field-help">
              {counts.total} question{counts.total === 1 ? '' : 's'} · {counts.usable} {readOnly ? 'published' : 'ready for new papers'}
              {counts.inactive > 0 && ` · ${counts.inactive} switched off`}
            </p>
          </div>
          <div className="question-filters" role="search" aria-label="Find questions">
            <label className="search-field">
              <span className="visually-hidden">Search questions</span>
              <input type="search" value={filters.search} placeholder="Search questions, units or lessons"
                onChange={(event) => setFilter({ search: event.target.value })} />
            </label>
            {types.length > 1 && <ChoiceChips legend="Type" value={filters.type} options={typeOptions}
              onChange={(type) => setFilter({ type })} />}
            {counts.inactive > 0 && <ChoiceChips legend="Show" value={filters.status}
              options={[{ value: 'all', label: 'All' }, { value: 'usable', label: 'Ready' }, { value: 'inactive', label: 'Switched off' }] as { value: BankQuestionFilters['status']; label: string }[]}
              onChange={(status) => setFilter({ status })} />}
            {linkedIds && (counts.linked ?? 0) > 0 && <ChoiceChips legend="Context" value={filters.linked}
              options={[{ value: 'all', label: 'All' }, { value: 'standalone', label: 'On their own' }, { value: 'linked', label: 'In passages and exercises' }] as { value: BankQuestionFilters['linked']; label: string }[]}
              onChange={(linked) => setFilter({ linked })} />}
          </div>
          {questions.length === 0 ? (
            <div className="empty-state">
              <p>{readOnly ? 'No published questions are available in this preset bank.' : 'This bank has no questions yet. Add the first one, or import a file.'}</p>
              {!readOnly && <div className="recovery-actions">
                <button type="button" onClick={onAdd}>Add question</button>
                <button type="button" className="button-secondary" onClick={onImport}>Import file</button>
              </div>}
            </div>
          ) : result.matching === 0 ? <p role="status" className="empty-state">No questions match. Try another search or filter.</p> : <>
            <p role="status" className="visually-hidden">{`Showing ${result.first} to ${result.last} of ${result.matching} questions.`}</p>
            <ul className="question-rows">
              {result.rows.map((question) => (
                <li className="question-row" key={question.id}>
                  <span className="qcard" aria-hidden="true">
                    <span className="qcard-in">
                      <span className="qcard-front"><b>{questionTypeMark(question.question_type)}</b></span>
                      <span className="qcard-back"><i>✓</i><small>{questionAnswerPreview(question)}</small></span>
                    </span>
                  </span>
                  <div className="question-row-text">
                    <p className="question-row-prompt">{question.prompt}</p>
                    <p className="question-row-meta">
                      {questionTypeLabels[question.question_type as QuestionInput['questionType']] ?? question.question_type} · Unit {question.unit} · Lesson {question.lesson} · {question.difficulty}
                      {!question.is_active && <span className="status-chip status-chip-warning">Switched off</span>}
                      {linkedIds?.has(question.id) && <span className="status-chip">In a passage or exercise</span>}
                    </p>
                  </div>
                  {!readOnly && onAction && <button type="button" className="button-secondary" disabled={isBusy} onClick={() => onAction(question)}>{actionLabel?.(question)??'Edit'}</button>}
                </li>
              ))}
            </ul>
          </>}
          {result.pages > 1 && <div className="pager" aria-label="Question pages">
            <button type="button" className="button-secondary" disabled={result.page <= 1} onClick={() => setPage(result.page - 1)}>Previous</button>
            <span>Page {result.page} of {result.pages}</span>
            <button type="button" className="button-secondary" disabled={result.page >= result.pages} onClick={() => setPage(result.page + 1)}>Next</button>
          </div>}
        </section>

}
