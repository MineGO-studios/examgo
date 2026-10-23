import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useI18n } from '../lib/i18n'
import { formatNumber } from '../lib/localize'
import { planShare, type PlanGroup } from '../lib/paperPlan'
import { questionTypeLabel } from '../lib/questionTypeLabels'
import { PAPER_REVIEW_STRINGS } from './SimplePaperReview.strings'

/** Colour follows the question type, never its position, so a type keeps its colour on every paper. */
const TYPE_COLOUR: Record<string, string> = { 'multiple-choice': '1', binary: '2', 'short-answer': '3' }
const colour = (type: string) => `var(--eg-type-${TYPE_COLOUR[type] ?? '4'})`

/**
 * The paper plan (D8.7): one connected bar, one segment per question type sized by its marks.
 * Hovering or clicking a segment shows its marks, items and the questions they come from;
 * each listed question jumps to that question on the paper.
 */
export default function PaperPlanBar({ groups, questionCount, totalMarks, emptySlots, onGoTo }: {
  groups: readonly PlanGroup[]
  questionCount: number
  /** Null while a question's marks are invalid. */
  totalMarks: number | null
  emptySlots: number
  onGoTo: (question: number) => void
}) {
  const { language } = useI18n(), s = PAPER_REVIEW_STRINGS[language]
  const [open, setOpen] = useState<{ type: string; pinned: boolean } | null>(null)
  const plan = useRef<HTMLDivElement>(null), pop = useRef<HTMLDivElement>(null)
  const segments = useRef(new Map<string, HTMLButtonElement>())
  const marks = groups.reduce((sum, group) => sum + group.marks, 0)
  // An empty slot takes the width of an average question, so the gap reads at the right scale.
  const gapWeight = emptySlots * Math.max(1, questionCount ? marks / questionCount : 1)
  const current = open ? groups.find((group) => group.type === open.type) : undefined

  useLayoutEffect(() => {
    const segment = open && segments.current.get(open.type)
    if (!segment || !plan.current || !pop.current) return
    // Anchor under the segment's reading-start edge, kept inside the plan.
    const box = plan.current.getBoundingClientRect(), seg = segment.getBoundingClientRect()
    const rtl = getComputedStyle(plan.current).direction === 'rtl'
    const start = rtl ? box.right - seg.right : seg.left - box.left
    pop.current.style.insetInlineStart = `${Math.max(0, Math.min(start, box.width - pop.current.offsetWidth))}px`
  }, [open])

  useEffect(() => {
    if (!open) return
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      segments.current.get(open.type)?.focus()
      setOpen(null)
    }
    const click = (event: MouseEvent) => { if (!plan.current?.contains(event.target as Node)) setOpen(null) }
    document.addEventListener('keydown', key)
    document.addEventListener('click', click)
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('click', click) }
  }, [open])

  return <section className="paper-plan" aria-label={s.plan}>
    <div ref={plan} className="paper-plan-body" onMouseLeave={() => setOpen((o) => o?.pinned ? o : null)}>
      <p className="paper-plan-summary">
        <span>{s.plan} · {s.questions(questionCount)}</span>
        <span>{totalMarks === null ? s.fixMarks : s.marks(totalMarks)}</span>
      </p>
      <div className="paper-plan-bar">
        {groups.map((group) => {
          const name = questionTypeLabel(group.type, language)
          return <button key={group.type} type="button" className="paper-plan-seg"
            ref={(element) => { if (element) segments.current.set(group.type, element); else segments.current.delete(group.type) }}
            style={{ flexGrow: Math.max(group.marks, 0.0001), ['--seg' as string]: colour(group.type) }}
            aria-expanded={open?.type === group.type} aria-controls="paper-plan-details"
            aria-label={s.segment(name, group.marks ? s.marks(group.marks) : s.marksNeeded, s.items(group.items))}
            onMouseEnter={() => setOpen((o) => o?.type === group.type ? o : { type: group.type, pinned: false })}
            onClick={() => setOpen((o) => o?.type === group.type && o.pinned ? null : { type: group.type, pinned: true })} />
        })}
        {emptySlots > 0 && <span className="paper-plan-seg is-gap" style={{ flexGrow: gapWeight }}>
          <span className="visually-hidden">{s.missing(emptySlots)}</span>
        </span>}
      </div>
      <div className="paper-plan-names" aria-hidden="true">
        {groups.map((group) => <span key={group.type} style={{ flexGrow: Math.max(group.marks, 0.0001), ['--seg' as string]: colour(group.type) }}>
          <i />{questionTypeLabel(group.type, language)} <b>{group.marks || '—'}</b>
        </span>)}
        {emptySlots > 0 && <span className="is-gap" style={{ flexGrow: gapWeight }}><i />{s.empty}</span>}
      </div>
      {current && <div ref={pop} id="paper-plan-details" className="paper-plan-pop" role="region"
        aria-label={s.details(questionTypeLabel(current.type, language))} style={{ ['--seg' as string]: colour(current.type) }}>
        <h4><i />{questionTypeLabel(current.type, language)}</h4>
        <p className="paper-plan-pop-sum">{s.share(current.marks ? s.marks(current.marks) : s.marksNeeded, s.items(current.items), formatNumber(language, planShare(current.marks, marks) / 100, { style: 'percent' }))}</p>
        <table>
          <thead><tr><th scope="col">{s.from}</th><th scope="col">{s.itemsColumn}</th><th scope="col">{s.marksColumn}</th></tr></thead>
          <tbody>{current.parts.map((part) => <tr key={part.label}>
            <td><button type="button" className="button-quiet" aria-label={s.goToPart(part.label)}
              onClick={() => { setOpen(null); onGoTo(part.question) }}>{part.label}</button></td>
            <td>{part.items}</td>
            <td>{part.marks || '—'}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </div>
    {emptySlots > 0 && <p className="field-help">{s.missing(emptySlots)}</p>}
  </section>
}
