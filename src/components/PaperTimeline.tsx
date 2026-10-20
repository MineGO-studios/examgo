import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { estimateLabelWidth, layoutDateLabels, localDay, timelineMarks, timelineScale, type PaperItem, type TimelineMark } from '../lib/myPapers'
import type { Language } from '../lib/i18n'

export interface TimelineStrings {
  title: string
  drafts: string
  finalized: string
  today: string
  edited: string
  finalizedOn: string
  papers: (count: number) => string
}

/** Marks keep this many px between centres: a 14px dot plus comfortable padding, and the tap width. */
const MARK_GAP = 26
const DAY = 86_400_000

/**
 * The papers-over-time anchor: one dot per paper on its own date (last edit for drafts,
 * finalization for finalized papers). Names show only on hover, focus or a pinning tap.
 * A day with more than two papers, or neighbours too close to separate, become one numbered dot
 * that opens a small window listing each paper with its dot, date and name.
 */
export function PaperTimeline({ items, matching, language, strings, onJump }: {
  items: PaperItem[]
  matching: ReadonlySet<string>
  language: Language
  strings: TimelineStrings
  onJump: (key: string) => void
}) {
  const axis = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [pinned, setPinned] = useState<string | null>(null)
  const [openCluster, setOpenCluster] = useState<string | null>(null)
  const [lit, setLit] = useState<string | null>(null)
  const popover = useRef<HTMLDivElement>(null)
  const today = localDay(new Date())
  const locale = language === 'ar' ? 'ar-IQ-u-nu-latn' : 'en-GB'
  const short = useMemo(() => new Intl.DateTimeFormat(locale, language === 'ar' ? { day: 'numeric', month: 'numeric' } : { day: 'numeric', month: 'short' }), [locale, language])
  const full = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }), [locale])

  useLayoutEffect(() => {
    const element = axis.current
    if (!element) return
    const measure = () => setWidth(element.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const marks = useMemo(() => timelineMarks(items, today, width, MARK_GAP), [items, today, width])
  const scale = timelineScale(items.map(item => localDay(item.date)), today)
  // Midday of a local day number, safe from time-zone edges.
  const fromDay = (day: number) => new Date(day * DAY + DAY / 2)
  const dateText = (mark: TimelineMark) => {
    if (mark.firstDay === mark.lastDay) return mark.firstDay === today ? strings.today : short.format(fromDay(mark.firstDay))
    return `${short.format(fromDay(mark.firstDay))}–${short.format(fromDay(mark.lastDay))}`
  }
  const rows = layoutDateLabels(marks.map(mark => {
    const text = dateText(mark)
    return { key: mark.key, text, center: mark.x, width: estimateLabelWidth(text) }
  }))
  const when = (item: PaperItem) => `${item.state === 'final' ? strings.finalizedOn : strings.edited} ${full.format(new Date(item.date))}`

  // Close the pinned name or the cluster window on Escape or a click elsewhere.
  useEffect(() => {
    if (!pinned && !openCluster) return
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent) {
        if (event.key !== 'Escape') return
        const opener = openCluster
        setPinned(null); setOpenCluster(null)
        if (opener) axis.current?.querySelector<HTMLElement>(`[data-mark="${CSS.escape(opener)}"]`)?.focus()
        return
      }
      if (!(event.target as Element).closest?.('.tl-dot, .tl-pop')) { setPinned(null); setOpenCluster(null) }
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', close) }
  }, [pinned, openCluster])

  useEffect(() => {
    if (openCluster) popover.current?.querySelector<HTMLElement>('button')?.focus()
  }, [openCluster])

  const open = marks.find(mark => mark.key === openCluster)
  const edge = (x: number) => x < width * 0.15 ? ' at-start' : x > width * 0.85 ? ' at-end' : ''

  return <section className="tl" aria-labelledby="tl-title">
    <div className="tl-head">
      <h2 id="tl-title">{strings.title}</h2>
      <ul className="tl-legend">
        <li><i className="tl-key" />{strings.drafts}</li>
        <li><i className="tl-key is-final" />{strings.finalized}</li>
      </ul>
    </div>
    <div className="tl-axis" ref={axis} style={{ '--today': `${(scale.at(today) * 100).toFixed(2)}%` } as CSSProperties}>
      <div className="tl-past" />
      <div className="tl-future" />
      <span className="tl-now" aria-hidden="true" />
      {marks.map((mark, order) => {
        const style = { '--x': `${mark.x}px`, '--n': order } as CSSProperties
        const dim = !mark.items.some(item => matching.has(item.key))
        if (mark.items.length === 1) {
          const [item] = mark.items
          return <button key={mark.key} type="button" data-mark={mark.key}
            className={`tl-dot${item.state === 'final' ? ' is-final' : ''}${edge(mark.x)}`} style={style}
            data-dim={dim ? '' : undefined} aria-label={`${item.title}, ${when(item)}`} aria-pressed={pinned === mark.key}
            onPointerEnter={() => setLit(mark.key)} onPointerLeave={() => setLit(null)}
            onFocus={() => setLit(mark.key)} onBlur={() => setLit(null)}
            onClick={() => {
              setOpenCluster(null)
              const next = pinned === mark.key ? null : mark.key
              setPinned(next)
              if (next) onJump(item.key)
            }}>
            <i />
            <span className="tl-tip" aria-hidden="true"><bdi>{item.title}</bdi><small>{when(item)}</small></span>
          </button>
        }
        const finals = mark.items.filter(item => item.state === 'final').length
        const tone = finals === 0 ? '' : finals === mark.items.length ? ' is-final' : ' is-mixed'
        const label = `${strings.papers(mark.items.length)}, ${dateText(mark)}`
        return <button key={mark.key} type="button" data-mark={mark.key}
          className={`tl-dot is-cluster${tone}${edge(mark.x)}`} style={style}
          data-dim={dim ? '' : undefined} aria-label={label} aria-haspopup="dialog" aria-expanded={openCluster === mark.key}
          onPointerEnter={() => setLit(mark.key)} onPointerLeave={() => setLit(null)}
          onFocus={() => setLit(mark.key)} onBlur={() => setLit(null)}
          onClick={() => { setPinned(null); setOpenCluster(current => current === mark.key ? null : mark.key) }}>
          <i>{mark.items.length}</i>
          {openCluster !== mark.key && <span className="tl-tip" aria-hidden="true">{label}</span>}
        </button>
      })}
      {marks.map((mark, order) => {
        const row = rows.get(mark.key)
        if (row === null || row === undefined) return null
        const isToday = mark.firstDay === today && mark.lastDay === today
        return <span key={mark.key} aria-hidden="true"
          className={`tl-date${isToday ? ' is-today' : ''}${lit === mark.key || openCluster === mark.key ? ' is-lit' : ''}`}
          data-dim={mark.items.some(item => matching.has(item.key)) ? undefined : ''}
          style={{ '--x': `${mark.x}px`, '--row': row, '--n': order } as CSSProperties}>
          {dateText(mark)}
        </span>
      })}
      {open && <div ref={popover} className={`tl-pop${edge(open.x)}`} role="dialog" aria-label={`${strings.papers(open.items.length)}, ${dateText(open)}`}
        style={{ '--x': `${open.x}px` } as CSSProperties}>
        <p className="tl-pop-title">{strings.papers(open.items.length)} <span>{dateText(open)}</span></p>
        <ul>
          {open.items.map(item => <li key={item.key}>
            <button type="button" data-dim={matching.has(item.key) ? undefined : ''} onClick={() => { setOpenCluster(null); onJump(item.key) }}>
              <i className={`tl-key${item.state === 'final' ? ' is-final' : ''}`} aria-hidden="true" />
              <span className="tl-pop-date">{short.format(new Date(item.date))}</span>
              <bdi className="tl-pop-name">{item.title}</bdi>
            </button>
          </li>)}
        </ul>
      </div>}
    </div>
  </section>
}
