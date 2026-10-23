import type { CSSProperties } from 'react'
import { bankQuestionCounts, browseBankQuestions, type BankQuestionFilters, type BankBrowserQuestion } from '../lib/questionBankBrowse'
import { questionAnswerPreview, questionTypeMark, unitCounts } from '../lib/questionCards'
import { ChoiceChips } from './controls'
import { questionTypeLabel } from '../lib/questionTypeLabels'
import { useI18n } from '../lib/i18n'
import { QUESTION_BANK_STRINGS } from './QuestionBanks.strings'

/** Same unit overview, filters, cards and paging for personal and published banks. */
export default function QuestionBankBrowser<T extends BankBrowserQuestion>({ questions, linkedIds, filters, setFilters, page, setPage, readOnly=false, isBusy=false, onAction, actionLabel, onAdd, onImport }: {
  questions: readonly T[]; linkedIds: ReadonlySet<string>|null; filters: BankQuestionFilters;
  setFilters: (filters: BankQuestionFilters)=>void; page:number; setPage:(page:number)=>void;
  readOnly?:boolean; isBusy?:boolean; onAction?:(question:T)=>void; actionLabel?:(question:T)=>string;
  onAdd?:()=>void; onImport?:()=>void;
}) {
        const { language } = useI18n()
        const s = QUESTION_BANK_STRINGS[language]
        const difficulty = (value: string) => value === 'easy' || value === 'medium' || value === 'hard' ? s[value] : value
        const counts = bankQuestionCounts(questions, linkedIds)
        const result = browseBankQuestions(questions, filters, linkedIds, page)
        const types = [...new Set(questions.map((question) => question.question_type))].sort()
        const setFilter = (patch: Partial<BankQuestionFilters>) => { setFilters({ ...filters, ...patch }); setPage(1) }
        const typeOptions = [{ value: '', label: s.allTypes }, ...types.map((type) => ({ value: type, label: questionTypeLabel(type, language) }))]
        const units = unitCounts(questions)
        const largest = Math.max(1, ...units.map((entry) => entry.total))
        return <section className="question-browser" aria-labelledby="saved-questions-title">
          {units.length > 0 && <section className="qb-units" aria-labelledby="qb-units-title">
            <div className="qb-units-head">
              <h3 id="qb-units-title">{s.byUnit}</h3>
              {filters.unit !== undefined && filters.unit !== '' && <button type="button" className="button-quiet" onClick={() => setFilter({ unit: '' })}>{s.everyUnit}</button>}
            </div>
            <ul>
              {units.map((entry, order) => <li key={entry.unit}>
                <button type="button" aria-pressed={filters.unit === entry.unit}
                  aria-label={s.unitButton(entry.unit, entry.total, entry.usable, readOnly)}
                  style={{ '--unit': `var(--eg-unit-${entry.unit >= 1 && entry.unit <= 4 ? entry.unit : 'none'})`, '--share': entry.total / largest, '--ready': entry.total ? entry.usable / entry.total : 0, '--n': order } as CSSProperties}
                  onClick={() => setFilter({ unit: filters.unit === entry.unit ? '' : entry.unit })}>
                  <span className="qb-unit-name">{s.unitName(entry.unit)}</span>
                  <span className="qb-unit-bar" aria-hidden="true"><i /></span>
                  <span className="qb-unit-count">{entry.total}</span>
                </button>
              </li>)}
            </ul>
          </section>}
          <div className="question-browser-header">
            <h3 id="saved-questions-title">{s.questions}</h3>
            <p className="field-help">
              {s.countLine(counts.total, counts.usable, readOnly)}
              {counts.inactive > 0 && s.switchedOffCount(counts.inactive)}
            </p>
          </div>
          <div className="question-filters" role="search" aria-label={s.find}>
            <label className="search-field">
              <span className="visually-hidden">{s.search}</span>
              <input type="search" value={filters.search} placeholder={s.searchPlaceholder}
                onChange={(event) => setFilter({ search: event.target.value })} />
            </label>
            {types.length > 1 && <ChoiceChips legend={s.type} value={filters.type} options={typeOptions}
              onChange={(type) => setFilter({ type })} />}
            {counts.inactive > 0 && <ChoiceChips legend={s.show} value={filters.status}
              options={[{ value: 'all', label: s.all }, { value: 'usable', label: s.ready }, { value: 'inactive', label: s.switchedOff }] as { value: BankQuestionFilters['status']; label: string }[]}
              onChange={(status) => setFilter({ status })} />}
            {linkedIds && (counts.linked ?? 0) > 0 && <ChoiceChips legend={s.context} value={filters.linked}
              options={[{ value: 'all', label: s.all }, { value: 'standalone', label: s.onOwn }, { value: 'linked', label: s.inPassages }] as { value: BankQuestionFilters['linked']; label: string }[]}
              onChange={(linked) => setFilter({ linked })} />}
          </div>
          {questions.length === 0 ? (
            <div className="empty-state">
              <p>{readOnly ? s.noPublished : s.noQuestions}</p>
              {!readOnly && <div className="recovery-actions">
                <button type="button" onClick={onAdd}>{s.addQuestion}</button>
                <button type="button" className="button-secondary" onClick={onImport}>{s.importFile}</button>
              </div>}
            </div>
          ) : result.matching === 0 ? <p role="status" className="empty-state">{s.noMatch}</p> : <>
            <p role="status" className="visually-hidden">{s.showing(result.first, result.last, result.matching)}</p>
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
                    <p className="question-row-prompt" dir="auto">{question.prompt}</p>
                    <p className="question-row-meta">
                      {s.meta(questionTypeLabel(question.question_type, language), question.unit, question.lesson, difficulty(question.difficulty))}
                      {!question.is_active && <span className="status-chip status-chip-warning">{s.switchedOff}</span>}
                      {linkedIds?.has(question.id) && <span className="status-chip">{s.inGroup}</span>}
                    </p>
                  </div>
                  {!readOnly && onAction && <button type="button" className="button-secondary" disabled={isBusy} onClick={() => onAction(question)}>{actionLabel?.(question)??s.edit}</button>}
                </li>
              ))}
            </ul>
          </>}
          {result.pages > 1 && <div className="pager" aria-label={s.pages}>
            <button type="button" className="button-secondary" disabled={result.page <= 1} onClick={() => setPage(result.page - 1)}>{s.previous}</button>
            <span>{s.pageOf(result.page, result.pages)}</span>
            <button type="button" className="button-secondary" disabled={result.page >= result.pages} onClick={() => setPage(result.page + 1)}>{s.next}</button>
          </div>}
        </section>

}
