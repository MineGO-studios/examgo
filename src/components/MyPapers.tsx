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
import { matchesPaper, sortPapers, type PaperItem, type PaperKind, type PaperScope } from '../lib/myPapers'
import { teacherErrorMessage } from '../lib/safeErrorDetails'
import { useI18n, type Language } from '../lib/i18n'
import { PaperSheet, PaperThumb } from './PaperSheet'
import { PaperTimeline } from './PaperTimeline'
import './myPapers.css'

const BlueprintFinalPaper = lazy(() => import('./BlueprintFinalPaper'))

type Raw =
  | { kind: 'simple'; row: ExamDraftSummary }
  | { kind: 'iraqi'; row: SavedPhaseNineWorkflow }
  | { kind: 'candidate'; row: SavedPhaseTenCandidate }
  | { kind: 'blueprint'; row: SavedExamBlueprint }
  | { kind: 'generated'; row: SavedBlueprintPaper }

type View = 'desk' | 'list'

const STRINGS = {
  en: {
    title: 'My papers',
    lede: (drafts: number, finals: number) => `${drafts} ${drafts === 1 ? 'draft' : 'drafts'} on the desk, ${finals} filed.`,
    newPaper: 'New paper',
    search: 'Search papers',
    placeholder: 'Search by title, bank or type',
    scopeLabel: 'Show',
    scopes: { all: 'All', draft: 'Drafts', final: 'Finalized' } as Record<PaperScope, string>,
    viewLabel: 'View',
    views: { desk: 'Desk', list: 'List' } as Record<View, string>,
    desk: 'On the desk',
    filed: 'Filed',
    filedNote: 'Simple question papers download straight away and are not kept here.',
    cont: 'Continue',
    open: 'Open',
    opening: 'Opening…',
    draft: (version?: number) => version ? `Draft v${version}` : 'Draft',
    finalized: 'Finalized',
    marks: (n: number) => `${n} ${n === 1 ? 'mark' : 'marks'}`,
    questions: (n: number) => `${n} ${n === 1 ? 'question' : 'questions'}`,
    unit: (n: number) => `Unit ${n}`,
    none: (query: string) => `No papers match “${query}”.`,
    noneInScope: 'No papers here yet.',
    clear: 'Clear search',
    loading: 'Loading your papers…',
    emptyTitle: 'No papers yet',
    empty: 'Save a reviewed paper to come back to its settings and questions later.',
    create: 'Create an exam',
    failed: 'Some saved work could not be loaded. Nothing was changed.',
    retry: 'Retry loading',
    openFailed: 'This paper could not be opened. Please try again.',
    close: 'Close paper',
    types: { simple: 'Question bank paper', iraqi: 'Iraqi exercises and writing', candidate: 'Complete paper', blueprint: 'Structured paper', generated: 'Structured paper' } as Record<PaperKind, string>,
    timeline: { title: 'Your papers over time', drafts: 'Drafts', finalized: 'Finalized', today: 'Today', edited: 'Edited', finalizedOn: 'Finalized', papers: (n: number) => `${n} papers` },
    recoveryChip: 'Review required',
    recovery: (bank: string) => `The saved draft from ${bank} was preserved. ExamGO will not silently replace, remove, or upgrade affected questions.`,
    reviewBank: 'Review question bank',
    back: 'Return to My papers',
  },
  ar: {
    title: 'أوراقي',
    lede: (drafts: number, finals: number) => `${drafts} مسودات على المكتب، و${finals} مؤرشفة.`,
    newPaper: 'ورقة جديدة',
    search: 'البحث في الأوراق',
    placeholder: 'ابحث بالعنوان أو البنك أو النوع',
    scopeLabel: 'عرض',
    scopes: { all: 'الكل', draft: 'المسودات', final: 'النهائية' } as Record<PaperScope, string>,
    viewLabel: 'طريقة العرض',
    views: { desk: 'المكتب', list: 'القائمة' } as Record<View, string>,
    desk: 'على المكتب',
    filed: 'المؤرشفة',
    filedNote: 'أوراق الأسئلة البسيطة تُنزَّل مباشرة ولا تُحفظ هنا.',
    cont: 'متابعة',
    open: 'فتح',
    opening: 'جارٍ الفتح…',
    draft: (version?: number) => version ? `مسودة ${version}` : 'مسودة',
    finalized: 'نهائية',
    marks: (n: number) => `${n} درجة`,
    questions: (n: number) => `${n} سؤال`,
    unit: (n: number) => `الوحدة ${n}`,
    none: (query: string) => `لا توجد أوراق تطابق «${query}».`,
    noneInScope: 'لا توجد أوراق هنا بعد.',
    clear: 'مسح البحث',
    loading: 'جارٍ تحميل أوراقك…',
    emptyTitle: 'لا توجد أوراق بعد',
    empty: 'احفظ ورقة بعد مراجعتها لتعود إلى إعداداتها وأسئلتها لاحقًا.',
    create: 'إنشاء امتحان',
    failed: 'تعذّر تحميل بعض الأعمال المحفوظة. لم يتغيّر شيء.',
    retry: 'إعادة التحميل',
    openFailed: 'تعذّر فتح هذه الورقة. حاول مرة أخرى.',
    close: 'إغلاق الورقة',
    types: { simple: 'ورقة من بنك الأسئلة', iraqi: 'تمارين عراقية وكتابة', candidate: 'ورقة كاملة', blueprint: 'ورقة منظّمة', generated: 'ورقة منظّمة' } as Record<PaperKind, string>,
    timeline: { title: 'أوراقك عبر الزمن', drafts: 'المسودات', finalized: 'النهائية', today: 'اليوم', edited: 'عُدّلت', finalizedOn: 'نُهيت', papers: (n: number) => `${n} أوراق` },
    recoveryChip: 'تحتاج مراجعة',
    recovery: (bank: string) => `حُفظت المسودة من ${bank}. لن يستبدل ExamGO الأسئلة المتأثرة أو يحذفها أو يحدّثها دون علمك.`,
    reviewBank: 'مراجعة بنك الأسئلة',
    back: 'العودة إلى أوراقي',
  },
} satisfies Record<Language, unknown>

const VIEW_KEY = 'examgo.papers.view'
function readView(): View {
  try {
    const stored = window.localStorage.getItem(VIEW_KEY)
    if (stored === 'desk' || stored === 'list') return stored
  } catch { /* Storage can be blocked; fall back to the screen size. */ }
  return window.matchMedia?.('(min-width: 40rem)').matches === false ? 'list' : 'desk'
}
function storeView(view: View): void {
  try { window.localStorage.setItem(VIEW_KEY, view) } catch { /* The choice still applies to this page. */ }
}

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
  const s = STRINGS[language]
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState<{ raws: Raw[]; failed: boolean } | null>(null)
  const [scope, setScope] = useState<PaperScope>('all')
  const [query, setQuery] = useState('')
  const [view, setView] = useState<View>(readView)
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
  const matching = useMemo(() => new Set(items.filter(item => matchesPaper(item, scope, query, [s.types[item.kind], STRINGS.en.types[item.kind]])).map(item => item.key)), [items, scope, query, s])
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
  const dateFormat = new Intl.DateTimeFormat(language === 'ar' ? 'ar-IQ-u-nu-latn' : 'en-GB', { dateStyle: 'medium' })
  const when = (item: PaperItem) => `${item.state === 'final' ? s.timeline.finalizedOn : s.timeline.edited} ${dateFormat.format(new Date(item.date))}`
  const chip = (item: PaperItem) => item.state === 'draft'
    ? <span className="mp-chip">{s.draft(item.version)}</span>
    : <span className="mp-chip is-final">{s.finalized}</span>
  const action = (item: PaperItem) => {
    const draft = item.state === 'draft'
    return <button type="button" className={draft ? undefined : 'button-secondary'} disabled={opening !== null} onClick={() => void open(item)}>
      {opening === item.key ? s.opening : draft ? s.cont : s.open}<span className="visually-hidden"> {item.title}</span>
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
    <h2 id={id} tabIndex={-1}>{title} <span className="mp-count">{list.length}</span></h2>
    {note && <p className="field-help">{note}</p>}
    <ul className={view === 'desk' ? 'mp-desk' : 'mp-list'}>{list.map(view === 'desk' ? deskPaper : listRow)}</ul>
  </section>

  if (recovery) {
    return <section className="draft-recovery" aria-labelledby="recovery-title">
      <span className="status-chip status-chip-warning">{s.recoveryChip}</span>
      <h2 id="recovery-title">{recovery.title}</h2>
      <p>{s.recovery(recovery.bankName)}</p>
      <ul>{recovery.issues.map((issue, index) => <li key={`${issue.kind}-${issue.position ?? 'unknown'}-${index}`}>{issue.message}</li>)}</ul>
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
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>{s.newPaper}
      </button>
    </header>

    {!loaded && <p role="status" className="mp-loading">{s.loading}</p>}

    {loaded?.failed && <div className="section-load-failure" role="alert">
      <p>{s.failed}</p>
      <button type="button" className="button-secondary" onClick={() => { document.getElementById('my-papers-title')?.focus(); setLoaded(null); setAttempt(n => n + 1) }}>{s.retry}</button>
    </div>}

    {openError && <p role="alert" className="saved-work-failure">{openError}</p>}

    {loaded && items.length === 0 && !loaded.failed && <div className="empty-state mp-empty">
      <h3>{s.emptyTitle}</h3>
      <p>{s.empty}</p>
      <button type="button" onClick={props.onCreateExam}>{s.create}</button>
    </div>}

    {items.length > 0 && <>
      <div className="mp-tools">
        <label className="eg-search">
          <span className="visually-hidden">{s.search}</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M16 16l4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          <input type="search" value={query} placeholder={s.placeholder} autoComplete="off" onChange={event => setQuery(event.target.value)} />
        </label>
        <div className="eg-seg" role="group" aria-label={s.scopeLabel}>
          {(['all', 'draft', 'final'] as const).map(key => <button key={key} type="button" aria-pressed={scope === key} onClick={() => setScope(key)}>{s.scopes[key]}</button>)}
        </div>
        <div className="eg-seg" role="group" aria-label={s.viewLabel}>
          {(['desk', 'list'] as const).map(key => <button key={key} type="button" aria-pressed={view === key} onClick={() => { setView(key); storeView(key) }}>
            {key === 'desk'
              ? <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="7" height="9" rx="1" fill="none" stroke="currentColor" strokeWidth="2" /><rect x="13" y="4" width="7" height="9" rx="1" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M4 17h16M4 20h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><rect x="3.5" y="4.5" width="3" height="3" rx="0.6" fill="currentColor" /><rect x="3.5" y="10.5" width="3" height="3" rx="0.6" fill="currentColor" /><rect x="3.5" y="16.5" width="3" height="3" rx="0.6" fill="currentColor" /></svg>}
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
