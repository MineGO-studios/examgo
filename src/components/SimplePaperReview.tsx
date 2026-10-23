import { useState, type ReactNode } from 'react'
import { buildAnswerKeyData, buildExamData } from '../lib/generateExam'
import type { ExamSettings } from '../types/exam'
import type { ExamQuestion } from '../types/question'
import { PaperStamp } from './CouponProgress'
import { useI18n } from '../lib/i18n'
import { PAPER_REVIEW_STRINGS } from './SimplePaperReview.strings'
import PaperPlanBar from './PaperPlanBar'
import { IconButton } from './controls'
import { paperPlanGroups } from '../lib/paperPlan'

const markLabel = (marks: number): string => `${marks} mark${marks === 1 ? '' : 's'}`

/** Unit marker colour; units beyond the coded four share the neutral marker. */
const unitMarker = (unit: number): string => unit >= 1 && unit <= 4 ? `var(--eg-unit-${unit})` : 'var(--eg-unit-none)'

/**
 * Shows the simple paper through the same template data the Word documents use.
 * It is a content preview: page breaks and Word layout are not shown.
 */
export default function SimplePaperReview({ questions, settings, totalMarks, renderControls, stamp, focusedIndex, onFocusQuestion, emptySlots = 0 }: {
  questions: readonly ExamQuestion[]
  settings: ExamSettings
  totalMarks: number | null
  renderControls: (question: ExamQuestion, index: number) => ReactNode
  /** Shown on the sheet only once both documents are confirmed prepared. */
  stamp?: string
  /** Only the focused question shows its tools; the rest stay print-quiet. */
  focusedIndex: number
  onFocusQuestion: (index: number) => void
  /** Requested questions the paper no longer has (removed during review). */
  emptySlots?: number
}) {
  const { language } = useI18n()
  const s = PAPER_REVIEW_STRINGS[language]
  const [mode, setMode] = useState<'student' | 'key'>('student')
  const exam = buildExamData(questions, settings)
  const answerKey = buildAnswerKeyData(questions, settings)
  const focused = Math.min(Math.max(focusedIndex, 0), questions.length - 1)
  const focusQuestion = (index: number): void => {
    setMode('student')
    onFocusQuestion(index)
    // The student view renders synchronously after the mode change on the next frame.
    requestAnimationFrame(() => document.getElementById(`paper-question-${index + 1}`)?.focus())
  }
  return <div className="paper-review">
    <PaperPlanBar groups={paperPlanGroups(questions.map((question, index) => ({ label: `Q${index + 1}`, question: index, type: question.type,
      items: 1, marks: Number.isSafeInteger(question.marks) ? question.marks : 0 })))}
      questionCount={questions.length} totalMarks={totalMarks} emptySlots={emptySlots} onGoTo={focusQuestion} />

    <div className="paper-toolbar">
      <div className="segmented" role="group" aria-label={s.view}>
        <button type="button" aria-pressed={mode === 'student'} onClick={() => setMode('student')}>{s.student}</button>
        <button type="button" aria-pressed={mode === 'key'} onClick={() => setMode('key')}>{s.key}</button>
      </div>
      <p className="field-help">{s.contentOnly}</p>
    </div>

    <article className="ministry-sheet" lang="en" dir="ltr" aria-label={mode === 'student' ? s.studentContent : s.keyContent}>
      {stamp && <PaperStamp label={stamp} />}
      <header className="ministry-sheet-header">
        <p>Grade {exam.Grade}</p>
        <h4 dir="auto">{exam.ExamTitle}{mode === 'key' ? ' — Answer key' : ''}</h4>
        <p dir="auto">{exam.SchoolName}<br />{totalMarks === null ? 'Fix question marks' : markLabel(totalMarks)}</p>
      </header>
      {mode === 'student' ? <>
        <p className="ministry-sheet-instructions">{exam.Instructions}</p>
        {exam.Questions.map((question, index) => <section key={questions[index].id} id={`paper-question-${question.Number}`}
          className={`ministry-question${index === focused ? ' is-focused' : ''}`} tabIndex={-1} aria-label={s.question(question.Number)}
          style={{ ['--plan-unit' as string]: unitMarker(questions[index].unit) }}>
          <div className="ministry-question-body">
            <p className="ministry-question-heading" dir="auto">{question.Heading}</p>
            <p className="structured-question-content" dir="auto">{question.StudentLine}</p>
            {question.AnswerSpace && <p className="structured-question-content ministry-answer-space" aria-hidden="true">{question.AnswerSpace}</p>}
          </div>
          {index === focused
            ? <div className="question-tools">{renderControls(questions[index], index)}</div>
            : <div className="question-summary">
              <span className="unit-tag">{s.unit(questions[index].unit)}</span>
              <IconButton icon="edit" quiet label={s.editQuestion(question.Number)} onClick={() => focusQuestion(index)} />
            </div>}
        </section>)}
      </> : <div className="blueprint-answer-table" role="region" aria-label={s.scrollable} tabIndex={0}><table>
        <caption>Answers and marks</caption>
        <thead><tr><th scope="col">Q</th><th scope="col">Answer</th><th scope="col">Marks</th></tr></thead>
        <tbody>{answerKey.Answers.map((row, index) => <tr key={questions[index].id}>
          <th scope="row">{row.Q}</th><td dir="auto">{row.Answer}</td><td>{Number.isSafeInteger(row.Marks) ? row.Marks : '—'}</td>
        </tr>)}</tbody>
      </table></div>}
      {mode === 'key' && <p className="field-help">{s.switchToStudent}</p>}
      <footer dir="auto">Teacher: {exam.TeacherName}</footer>
    </article>
  </div>
}
