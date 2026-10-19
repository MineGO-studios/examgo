import { useState, type ReactNode } from 'react'
import { buildAnswerKeyData, buildExamData } from '../lib/generateExam'
import type { ExamSettings } from '../types/exam'
import type { ExamQuestion, SimpleQuestionType } from '../types/question'
import { PaperStamp } from './CouponProgress'

const TYPE_SHORT: Record<SimpleQuestionType, string> = {
  'multiple-choice': 'Choice',
  binary: 'T/F',
  'short-answer': 'Short',
}

const markLabel = (marks: number): string => `${marks} mark${marks === 1 ? '' : 's'}`

/** Unit marker colour; units beyond the coded four share the neutral marker. */
const unitMarker = (unit: number): string => unit >= 1 && unit <= 4 ? `var(--eg-unit-${unit})` : 'var(--eg-unit-none)'

/**
 * Shows the simple paper through the same template data the Word documents use.
 * It is a content preview: page breaks and Word layout are not shown.
 */
export default function SimplePaperReview({ questions, settings, totalMarks, renderControls, stamp, focusedIndex, onFocusQuestion }: {
  questions: readonly ExamQuestion[]
  settings: ExamSettings
  totalMarks: number | null
  renderControls: (question: ExamQuestion, index: number) => ReactNode
  /** Shown on the sheet only once both documents are confirmed prepared. */
  stamp?: string
  /** Only the focused question shows its tools; the rest stay print-quiet. */
  focusedIndex: number
  onFocusQuestion: (index: number) => void
}) {
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
    <section className="paper-plan" aria-label="Paper plan">
      <p className="paper-plan-summary">
        <span>Paper plan · {questions.length} question{questions.length === 1 ? '' : 's'}</span>
        <span>{totalMarks === null ? 'Fix question marks' : markLabel(totalMarks)}</span>
      </p>
      <ol className="paper-plan-strip" dir="ltr">
        {questions.map((question, index) => {
          const marks = Number.isSafeInteger(question.marks) ? question.marks : 0
          return <li key={question.id} style={{ flexGrow: Math.max(marks, 1), ['--plan-unit' as string]: unitMarker(question.unit) }}
            className={`paper-plan-block${question.unit === 2 ? ' is-light' : ''}${index === focused ? ' is-focused' : ''}`}>
            <button type="button" onClick={() => focusQuestion(index)}
              aria-label={`Go to question ${index + 1}, unit ${question.unit}, ${marks ? markLabel(marks) : 'marks needed'}`}>
              <span>Q{index + 1} {TYPE_SHORT[question.type]}</span>
              <span className="paper-plan-marks">{marks || '—'}</span>
            </button>
          </li>
        })}
      </ol>
    </section>

    <div className="paper-toolbar">
      <div className="segmented" role="group" aria-label="Paper view">
        <button type="button" aria-pressed={mode === 'student'} onClick={() => setMode('student')}>Student paper</button>
        <button type="button" aria-pressed={mode === 'key'} onClick={() => setMode('key')}>Answer key</button>
      </div>
      <p className="field-help">Content preview. Page breaks and Word layout are not shown.</p>
    </div>

    <article className="ministry-sheet" lang="en" dir="ltr" aria-label={mode === 'student' ? 'Student paper content' : 'Answer key content'}>
      {stamp && <PaperStamp label={stamp} />}
      <header className="ministry-sheet-header">
        <p dir="auto">{exam.SchoolName}</p>
        <h4 dir="auto">{exam.ExamTitle}{mode === 'key' ? ' — Answer key' : ''}</h4>
        <p>Grade {exam.Grade}<br />{totalMarks === null ? 'Fix question marks' : markLabel(totalMarks)}</p>
      </header>
      {mode === 'student' ? <>
        <p className="ministry-sheet-instructions">{exam.Instructions}</p>
        {exam.Questions.map((question, index) => <section key={questions[index].id} id={`paper-question-${question.Number}`}
          className={`ministry-question${index === focused ? ' is-focused' : ''}`} tabIndex={-1} aria-label={`Question ${question.Number}`}
          style={{ ['--plan-unit' as string]: unitMarker(questions[index].unit) }}>
          <div className="ministry-question-body">
            <p className="ministry-question-heading" dir="auto">{question.Heading}</p>
            <p className="structured-question-content" dir="auto">{question.StudentLine}</p>
            {question.AnswerSpace && <p className="structured-question-content ministry-answer-space" aria-hidden="true">{question.AnswerSpace}</p>}
          </div>
          <p className="ministry-mark" aria-label={Number.isSafeInteger(question.Marks) ? markLabel(question.Marks) : 'Marks needed'}>
            {Number.isSafeInteger(question.Marks) ? question.Marks : '?'}
          </p>
          {index === focused
            ? <div className="question-tools">{renderControls(questions[index], index)}</div>
            : <div className="question-summary">
              <span className="unit-tag">Unit {questions[index].unit}</span>
              <button type="button" className="button-quiet" aria-label={`Edit question ${question.Number}`} onClick={() => focusQuestion(index)}>Edit</button>
            </div>}
        </section>)}
      </> : <div className="blueprint-answer-table" role="region" aria-label="Scrollable answers" tabIndex={0}><table>
        <caption>Answers and marks</caption>
        <thead><tr><th scope="col">Q</th><th scope="col">Answer</th><th scope="col">Marks</th></tr></thead>
        <tbody>{answerKey.Answers.map((row, index) => <tr key={questions[index].id}>
          <th scope="row">{row.Q}</th><td dir="auto">{row.Answer}</td><td>{Number.isSafeInteger(row.Marks) ? row.Marks : '—'}</td>
        </tr>)}</tbody>
      </table></div>}
      {mode === 'key' && <p className="field-help">Switch to Student paper to lock, replace, remove or re-mark questions.</p>}
      <footer dir="auto">Teacher: {exam.TeacherName}</footer>
    </article>
  </div>
}
