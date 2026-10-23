import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import {
  getExamDrafts,
  openExamDraft,
  type DraftRecoveryIssue,
  type ExamDraftSummary,
  type ReopenedExamDraft,
} from '../lib/examDraftRepository'
import type { SavedPhaseNineWorkflow } from '../lib/phaseNineRepository'
import type { SavedPhaseTenCandidate } from '../lib/phaseTenCandidateRepository'
import type { SavedExamBlueprint } from '../lib/examBlueprintRepository'
import type { SavedBlueprintPaper } from '../lib/blueprintPaperRepository'
import { matchesPaper, sortPapers, type PaperItem, type PaperScope } from '../lib/myPapers'
import { localizeAppMessage } from '../lib/appMessages'
import { teacherErrorMessage } from '../lib/safeErrorDetails'
import { useI18n } from '../lib/i18n'
import { PaperSheet, PaperThumb } from './PaperSheet'
import { PaperTimeline } from './PaperTimeline'
import { Icon } from './icons'
import { HelpTip } from './HelpTip'
import { readPapersView, storePapersView, type PapersView } from '../lib/devicePreferences'
import { MY_PAPERS_STRINGS } from './MyPapers.strings'
import { localeFor } from '../lib/localize'
import './myPapers.css'

const BlueprintFinalPaper = lazy(() => import('./BlueprintFinalPaper'))

type Raw =
  | { kind: 'simple'; row: ExamDraftSummary }
  | { kind: 'iraqi'; row: SavedPhaseNineWorkflow }
  | { kind: 'candidate'; row: SavedPhaseTenCandidate }
  | { kind: 'blueprint'; row: SavedExamBlueprint }
  | { kind: 'generated'; row: SavedBlueprintPaper }

type View = PapersView


function toItem(raw: Raw): PaperItem {
  switch (raw.kind) {
    case 'simple': {
      const draft = raw.row.draft
      return { key: `simple:${draft.id}`, kind: 'simple', title: draft.exam_title, state: 'draft', date: draft.updated_at,
        questions: draft.question_count, marks: draft.question_count * draft.marks_per_question, grade: draft.grade, unit: draft.unit, source: raw.row.bankName }
    }
    case 'iraqi': {
      const { row } = raw, snapshot = row.intent.review.snapshot
      return { key: `iraqi:${row.finalized ? 'final' : 'draft'}:${row.id}`, kind: 'iraqi', title: row.intent.settings.examTitle, state: row.finalized ? 'final' : 'draft',
        date: row.savedAt, version: row.version, marks: snapshot.totalMarks, questions: snapshot.structure.branches.length, grade: row.intent.settings.grade, unit: row.intent.settings.unit }
    }
    case 'candidate': {
      const { row } = raw
      return { key: `candidate:${row.finalized ? 'final' : 'draft'}:${row.id}`, kind: 'candidate', title: row.intent.settings.examTitle, state: row.finalized ? 'final' : 'draft',
        date: row.savedAt, version: row.version, marks: row.intent.snapshot.totalMarks, questions: row.intent.snapshot.branches.length, grade: row.intent.settings.grade }
    }
    case 'blueprint': {
      const { row } = raw
      return { key: `blueprint:${row.id}`, kind: 'blueprint', title: row.intent.settings.examTitle, state: 'draft', date: row.savedAt, version: row.version, marks: row.intent.blueprint.totalMarks, grade: row.intent.settings.grade }
    }
    case 'generated': {
      const { row } = raw
      return { key: `generated:${row.id}`, kind: 'generated', title: row.intent.intent.settings.examTitle, state: 'final', date: row.savedAt, marks: row.intent.snapshot.totalMarks, grade: row.intent.intent.settings.grade }
    }
  }
}

/** Every saved paper source, loaded in parallel; a failed source leaves the others visible. */
async function loadPapers(ownerId: string, development: boolean): Promise<{ raws: Raw[]; failed: boolean }> {
  const sources: Promise<Raw[]>[] = [
    getExamDrafts().then(rows => rows.map(row => ({ kind: 'simple', row }) as Raw)),
    import('../lib/phaseNineRepository').then(m => m.getPhaseNineWorkflows()).then(rows => rows.map(row => ({ kind: 'iraqi', row }) as Raw)),
  ]
  if (development) {
    sources.push(
      import('../lib/phaseTenCandidateRepository').then(m => m.getPhaseTenCandidateWorkflows()).then(rows => rows.map(row => ({ kind: 'candidate', row }) as Raw)),
      import('../lib/examBlueprintRepository').then(m => m.getExamBlueprints(ownerId)).then(rows => rows.map(row => ({ kind: 'blueprint', row }) as Raw)),
      import('../lib/blueprintPaperRepository').then(m => m.getBlueprintPapers(ownerId)).then(rows => rows.map(row => ({ kind: 'generated', row }) as Raw)),
    )
  }
  const settled = await Promise.allSettled(sources)
  return {
    raws: settled.flatMap(result => result.status === 'fulfilled' ? result.value : []),
    failed: settled.some(result => result.status === 'rejected'),
  }
}

export interface MyPapersProps {
  ownerId: string
  /** Development builds also list structured blueprints, generated papers and complete-paper candidates. */
  development: boolean
  onCreateExam: () => void
  onManageQuestions: () => void
  onOpenSimple: (draft: ReopenedExamDraft) => void
  onOpenIraqi: (saved: SavedPhaseNineWorkflow) => void
  onOpenCandidate: (saved: SavedPhaseTenCandidate) => void
  onOpenBlueprint: (saved: SavedExamBlueprint) => void
}

export default function MyPapers(props: MyPapersProps) {
  const { ownerId, development } = props
  const { language } = useI18n()
  const s = MY_PAPERS_STRINGS[language]
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState<{ raws: Raw[]; failed: boolean } | null>(null)
  const [scope, setScope] = useState<PaperScope>('all')
  const [query, setQuery] = useState('')
  const [view, setView] = useState<View>(readPapersView)
  const [opening, setOpening] = useState<string | null>(null)
  const [openError, setOpenError] = useState<string | null>(null)
  const [recovery, setRecovery] = useState<{ title: string; bankName: string; issues: DraftRecoveryIssue[] } | null>(null)
  const [viewing, setViewing] = useState<SavedBlueprintPaper | null>(null)
  const [flash, setFlash] = useState<{ key: string; n: number } | null>(null)

  useEffect(() => {
    let active = true
    void loadPapers(ownerId, development).then(result => { if (active) setLoaded(result) })
    return () => { active = false }
  }, [ownerId, development, attempt])

  const raws = useMemo(() => new Map((loaded?.raws ?? []).map(raw => [toItem(raw).key, raw])), [loaded])
  const items = useMemo(() => sortPapers((loaded?.raws ?? []).map(toItem)), [loaded])
  const matching = useMemo(() => new Set(items.filter(item => matchesPaper(item, scope, query, [s.types[item.kind], MY_PAPERS_STRINGS.en.types[item.kind]])).map(item => item.key)), [items, scope, query, s])
  const shown = items.filter(item => matching.has(item.key))
  const drafts = shown.filter(item => item.state === 'draft'), finals = shown.filter(item => item.state === 'final')

  useEffect(() => {
    if (!flash) return
    const element = document.getElementById(`paper-${flash.key}`)
    element?.scrollIntoView({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' })
  }, [flash])

  const jump = (key: string) => {
    if (!matching.has(key)) { setScope('all'); setQuery('') }
    setFlash(previous => ({ key, n: (previous?.n ?? 0) + 1 }))
  }

  const open = async (item: PaperItem): Promise<void> => {
    const raw = raws.get(item.key)
    if (!raw) return
    setOpenError(null)
    if (raw.kind === 'iraqi') return props.onOpenIraqi(raw.row)
    if (raw.kind === 'candidate') return props.onOpenCandidate(raw.row)
    if (raw.kind === 'blueprint') return props.onOpenBlueprint(raw.row)
    if (raw.kind === 'generated') { setViewing(raw.row); return }
    setOpening(item.key)
    try {
      const result = await openExamDraft(raw.row.draft.id)
      if (result.status === 'recovery') setRecovery({ title: result.draft.exam_title, bankName: result.bankName, issues: result.issues })
      else props.onOpenSimple(result.value)
    } catch (error) {
      setOpenError(teacherErrorMessage(error, s.openFailed))
    } finally {
      setOpening(null)
    }
  }

  const meta = (item: PaperItem) => [
    item.unit ? s.unit(item.unit) : s.types[item.kind],
    item.marks !== undefined ? s.marks(item.marks) : item.questions !== undefined ? s.questions(item.questions) : null,
  ].filter(Boolean).join(' · ')
  const dateFormat = new Intl.DateTimeFormat(localeFor(language), { dateStyle: 'medium' })
  const when = (item: PaperItem) => `${item.state === 'final' ? s.timeline.finalizedOn : s.timeline.edited} ${dateFormat.format(new Date(item.date))}`
  const chip = (item: PaperItem) => item.state === 'draft'
    ? <span className="mp-chip">{s.draft(item.version)}</span>
    : <span className="mp-chip is-final">{s.finalized}</span>
  const action = (item: PaperItem) => {
    const draft = item.state === 'draft'
    return <button type="button" className={draft ? undefined : 'button-secondary'} disabled={opening !== null} onClick={() => void open(item)}>
      {opening === item.key ? s.opening : draft ? s.cont : s.open}<span className="visually-hidden"> <bdi>{item.title}</bdi></span>
    </button>
  }
  const flashClass = (item: PaperItem) => flash?.key === item.key ? ` is-flash flash-${flash.n % 2}` : ''

  const deskPaper = (item: PaperItem) => <li key={item.key} id={`paper-${item.key}`} className={`mp-paper ${item.state === 'draft' ? 'is-draft' : 'is-final'}${flashClass(item)}`}>
    <div className="mp-stack"><PaperSheet item={item} /></div>
    <div className="mp-caption">
      <b><bdi>{item.title}</bdi></b>
      <span className="mp-meta">{meta(item)}</span>
      <span className="mp-meta">{when(item)}</span>
      <div className="mp-actions">{chip(item)}{action(item)}</div>
    </div>
  </li>
  const listRow = (item: PaperItem) => <li key={item.key} id={`paper-${item.key}`} className={`mp-row ${item.state === 'draft' ? 'is-draft' : 'is-final'}${flashClass(item)}`}>
    <PaperThumb final={item.state === 'final'} />
    <div className="mp-row-main"><b><bdi>{item.title}</bdi></b><span className="mp-meta">{meta(item)} · {when(item)}</span></div>
    <div className="mp-row-actions">{chip(item)}{action(item)}</div>
  </li>
  const group = (id: string, title: string, list: PaperItem[], note?: string) => list.length > 0 && <section className="mp-group" aria-labelledby={id}>
    <h2 id={id} tabIndex={-1}>{title} <span className="mp-count">{list.length}</span>
      {note && <HelpTip topic={title}>{note}</HelpTip>}</h2>
    <ul className={view === 'desk' ? 'mp-desk' : 'mp-list'}>{list.map(view === 'desk' ? deskPaper : listRow)}</ul>
  </section>

  if (recovery) {
    return <section className="draft-recovery" aria-labelledby="recovery-title">
      <span className="status-chip status-chip-warning">{s.recoveryChip}</span>
      <h2 id="recovery-title"><bdi>{recovery.title}</bdi></h2>
      <p>{s.recoveryLead} <bdi>{recovery.bankName}</bdi>{s.recoveryRest}</p>
      <ul>{recovery.issues.map((issue, index) => <li key={`${issue.kind}-${issue.position ?? 'unknown'}-${index}`}>{localizeAppMessage(language, issue.message)}</li>)}</ul>
      <div className="recovery-actions">
        <button type="button" onClick={props.onManageQuestions}>{s.reviewBank}</button>
        <button type="button" className="button-secondary" onClick={() => setRecovery(null)}>{s.back}</button>
      </div>
    </section>
  }

  return <div className="my-papers mp">
    <header className="mp-head">
      <div>
        <h2 id="my-papers-title" className="mp-title">{s.title}</h2>
        {loaded && items.length > 0 && <p className="mp-lede">{s.lede(items.filter(i => i.state === 'draft').length, items.filter(i => i.state === 'final').length)}</p>}
      </div>
      <button type="button" className="mp-new" onClick={props.onCreateExam}>
        <Icon name="add" />{s.newPaper}
      </button>
    </header>

    {!loaded && <p role="status" className="mp-loading">{s.loading}</p>}

    {loaded?.failed && <div className="section-load-failure" role="alert">
      <p>{s.failed}</p>
      <button type="button" className="button-secondary" onClick={() => { document.getElementById('my-papers-title')?.focus(); setLoaded(null); setAttempt(n => n + 1) }}>{s.retry}</button>
    </div>}

    {openError && <p role="alert" className="saved-work-failure">{localizeAppMessage(language, openError)}</p>}

    {loaded && items.length === 0 && !loaded.failed && <div className="empty-state mp-empty">
      <h3>{s.emptyTitle}</h3>
      <p>{s.empty}</p>
      <button type="button" onClick={props.onCreateExam}>{s.create}</button>
    </div>}

    {items.length > 0 && <>
      <div className="mp-tools">
        <label className="eg-search">
          <span className="visually-hidden">{s.search}</span>
          <Icon name="search" />
          <input type="search" value={query} placeholder={s.placeholder} autoComplete="off" onChange={event => setQuery(event.target.value)} />
        </label>
        <div className="eg-seg" role="group" aria-label={s.scopeLabel}>
          {(['all', 'draft', 'final'] as const).map(key => <button key={key} type="button" aria-pressed={scope === key} onClick={() => setScope(key)}>{s.scopes[key]}</button>)}
        </div>
        <div className="eg-seg" role="group" aria-label={s.viewLabel}>
          {(['desk', 'list'] as const).map(key => <button key={key} type="button" aria-pressed={view === key} onClick={() => { setView(key); storePapersView(key) }}>
            <Icon name={key} />
            {s.views[key]}
          </button>)}
        </div>
      </div>

      <PaperTimeline items={items} matching={matching} language={language} strings={s.timeline} onJump={jump} />

      {shown.length === 0
        ? <div className="mp-none" role="status">
            <p>{query.trim() ? s.none(query.trim()) : s.noneInScope}</p>
            {query.trim() && <button type="button" className="button-secondary" onClick={() => setQuery('')}>{s.clear}</button>}
          </div>
        : <>
            {group('editable-papers-title', s.desk, drafts)}
            {group('finalized-papers-title', s.filed, finals, s.filedNote)}
          </>}
    </>}

    {viewing && <section className="mp-viewer" aria-label={viewing.intent.intent.settings.examTitle}>
      <button type="button" className="button-secondary" onClick={() => setViewing(null)}>{s.close}</button>
      <Suspense fallback={<p role="status">{s.loading}</p>}><BlueprintFinalPaper key={viewing.id} paper={viewing} /></Suspense>
    </section>}
  </div>
}
