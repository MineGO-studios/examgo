import { useState, type ReactNode } from 'react'
import type { CompoundBranch, CompoundSnapshot } from '../domain/compoundStructure'
import { projectCompoundPaper } from '../lib/compoundWorkflow'
import type { ExamSettings } from '../types/exam'
import { teacherErrorMessage } from '../lib/safeErrorDetails'

/** Production answer-key column order (Phase 9 template). */
const ANSWER_COLUMNS = ['Q', 'Part', 'Rule', 'Point', 'Answer', 'Mark', 'Total']

/** Both modes use the production renderer's projection; this is a content preview, not Word pagination. */
export default function BlueprintPaperReview({ snapshot, settings, generalInstruction, renderControls, initialMode = 'student' }: {
  snapshot: CompoundSnapshot; settings: ExamSettings; generalInstruction: string; renderControls?: (branch: CompoundBranch) => ReactNode; initialMode?: 'student' | 'key'
}) {
  const [mode, setMode] = useState<'student' | 'key'>(initialMode)
  const units = [...new Set(snapshot.branches.flatMap((b) => b.items.map((i) => i.question.unit)))].sort()
  let paper: ReturnType<typeof projectCompoundPaper>
  try { paper = projectCompoundPaper(snapshot, settings, generalInstruction, units) }
  catch (error) { return <p role="alert">{teacherErrorMessage(error, 'Review the paper settings.')}</p> }
  return <section aria-label="Assembled paper">
    <div className="recovery-actions" role="group" aria-label="Paper view">
      <button type="button" aria-pressed={mode === 'student'} onClick={() => setMode('student')}>Student paper</button>
      <button type="button" aria-pressed={mode === 'key'} onClick={() => setMode('key')}>Answer key</button>
    </div>
    <p className="field-help">Content preview. Page breaks and Word layout are not shown.</p>
    <article className="blueprint-paper" aria-label={mode === 'student' ? 'Student paper content' : 'Answer key content'}>
      <header><p>Grade {paper.exam.Grade}</p><h3 dir="auto">{paper.exam.ExamTitle}</h3>
        <p dir="auto">{paper.exam.SchoolName} · {snapshot.totalMarks} marks</p></header>
      {mode === 'student' ? <>
        <p dir="auto">{paper.exam.GeneralInstruction}</p>
        {paper.exam.Branches.map((branch, index) => <section key={snapshot.branches[index].id} className="blueprint-paper-branch">
          <h4 dir="auto">{branch.Heading} ({branch.Marks} M.)</h4>
          {branch.ArabicInstruction && <p lang="ar" dir="rtl">{branch.ArabicInstruction}</p>}
          {branch.WordBank && <p dir="auto">{branch.WordBank}</p>}
          <p className="structured-question-content" dir="auto">{branch.Body}</p>
          {branch.AlternativeA && <p className="structured-question-content" dir="auto">{branch.AlternativeA}</p>}
          {branch.AlternativeB && <p className="structured-question-content" dir="auto">{branch.AlternativeB}</p>}
          {branch.AnswerSpace && <p className="structured-question-content">{branch.AnswerSpace}</p>}
          {renderControls?.(snapshot.branches[index])}
        </section>)}
      </> : <div className="blueprint-answer-table" role="region" aria-label="Scrollable answers and marking rules" tabIndex={0}><table><caption>Answers and marking rules</caption>
        <thead><tr>{ANSWER_COLUMNS.map((title) => <th scope="col" key={title}>{title}</th>)}</tr></thead>
        {paper.mergeGroups.map((group) => {
          // Same columns and vertical merges as mergeStructuredAnswerCells in the production answer key.
          const merged = new Set([0, 1, 2, 6, ...(group.mergeMarks !== false ? [5] : []), ...(group.mergeAnswer ? [4] : [])])
          const rows = paper.answerKey.Answers.slice(group.start, group.start + group.length)
          return <tbody key={group.start}>{rows.map((row, index) => <tr key={index}>
            {[row.Q, row.Part, row.Rule, row.Point, row.Answer, String(row.Mark), String(row.Total)].map((value, column) => {
              if (merged.has(column) && index > 0) return null
              const span = merged.has(column) ? rows.length : undefined
              return column === 0 ? <th key={column} scope="rowgroup" rowSpan={span}>{value}</th>
                : <td key={column} rowSpan={span} dir={column === 4 ? 'auto' : undefined}>{value}</td>
            })}
          </tr>)}</tbody>
        })}
      </table></div>}
      {mode === 'key' && renderControls && <p className="field-help">Switch to Student paper to edit its questions and marks.</p>}
      <footer dir="auto">Teacher: {paper.exam.TeacherName}</footer>
    </article>
  </section>
}
