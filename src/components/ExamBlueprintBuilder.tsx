import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'
import type { CompoundSnapshot } from '../domain/compoundStructure'
import type { QuestionType } from '../domain/questionDomain'
import { selectBlueprintPaper, type BlueprintBranch, type BlueprintPool, type ExamBlueprint } from '../lib/examBlueprint'
import { getStructuredQuestionPoolForBanks } from '../lib/passageGroupRepository'
import { getQuestionBanks, type QuestionBank } from '../lib/questionBankRepository'
import { DEFAULT_EXAM_SETTINGS, EXAM_LIMITS } from '../types/exam'
import { getFirstValidationError, validateExamSettings } from '../lib/validateExamSettings'
import { projectCompoundPaper } from '../lib/compoundWorkflow'
import BlueprintPaperReview from './BlueprintPaperReview'
import { duplicateExamBlueprintIntent, EXAM_BLUEPRINT_PROFILE_ID, parseExamBlueprintIntent, type ExamBlueprintIntent } from '../lib/examBlueprintWorkflow'
import { BlueprintStorageError, getExamBlueprints, saveExamBlueprint, type SavedExamBlueprint } from '../lib/examBlueprintRepository'
import { assignBlueprintMarks, clearBlueprintOrder, moveBlueprintQuestion, removeBlueprintSelection, replaceBlueprintQuestion,
  toggleBlueprintLock, type BlueprintReviewChange } from '../lib/examBlueprintReview'
import BlueprintBranchControls from './BlueprintBranchControls'
import BlueprintReplacementPicker from './BlueprintReplacementPicker'
import { acceptBlueprintSourceUpdates, getBlueprintSourceIssues, recordBlueprintSourceReview, resetBlueprintBranchSelection } from '../lib/examBlueprintRecovery'
import { canonicalJson } from '../lib/canonicalQuestionCandidates'
import { createBlueprintPaperIntent, type BlueprintPaperIntent } from '../lib/examBlueprintPaper'
import { finalizeBlueprintPaper, type SavedBlueprintPaper } from '../lib/blueprintPaperRepository'
import BlueprintFinalPaper from './BlueprintFinalPaper'
import BlueprintLayoutReview from './BlueprintLayoutReview'
import { assessBlueprintFit } from '../lib/examBlueprintFit'
import { teacherErrorMessage } from '../lib/safeErrorDetails'
import { QUESTION_TYPE_LABELS_EN } from '../lib/questionTypeLabels'

const questionTypes: QuestionType[] = ['multiple-choice', 'binary', 'short-answer', 'completion', 'odd-word', 'matching', 'word-relationship', 'rewrite', 'extended-writing']
const questionTypeLabels: Record<QuestionType, string> = QUESTION_TYPE_LABELS_EN
function newBranch(number: number): BlueprintBranch {
  return { id: crypto.randomUUID(), mainQuestionNumber: number, branchLabel: null, kind: 'questions',
    instruction: 'Answer the following questions.', arabicInstruction: null, questionTypes: ['short-answer'],
    quantity: 5, displayedPointCount: 5, answerRule: { kind: 'points', pointsToAnswer: NaN }, marks: 5,
    distribution: { mode: 'equal' }, units: [], lessons: [], difficulties: [], includedQuestionIds: [], excludedQuestionIds: [], lockedQuestionIds: [] }
}
const numberValue = (value: number) => Number.isNaN(value) ? '' : value

export interface BlueprintEditorHandle { open: (saved: SavedExamBlueprint) => void }

export default function ExamBlueprintBuilder({ ownerId, initialBlueprint, editorRef }: {
  ownerId: string; initialBlueprint?: SavedExamBlueprint | null; editorRef?: Ref<BlueprintEditorHandle>
}) {
  const [banks, setBanks] = useState<QuestionBank[]>([])
  const [plan, setPlan] = useState<ExamBlueprint>(() => initialBlueprint ? structuredClone(initialBlueprint.intent.blueprint) : ({ schemaVersion: 1, version: 1, ownerId, bankIds: [],
    selectionSeed: 1, totalMarks: 5, branches: [newBranch(1)] }))
  const [settings, setSettings] = useState({ ...DEFAULT_EXAM_SETTINGS, schoolName: '', examTitle: '', teacherName: '', ...initialBlueprint?.intent.settings })
  const [generalInstruction, setGeneralInstruction] = useState(initialBlueprint?.intent.generalInstruction ?? 'Answer all questions.')
  const [pool, setPool] = useState<BlueprintPool | null>(null)
  const [review, setReview] = useState<CompoundSnapshot | null>(null)
  const [message, setMessage] = useState('Choose banks and define each question or branch. Enter Points to answer before reviewing.')
  const [failed, setFailed] = useState(false)
  const errorRef = useRef<HTMLParagraphElement>(null)
  const [reload, setReload] = useState(0)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [targetId, setTargetId] = useState('')
  const [saved, setSaved] = useState<SavedExamBlueprint | null>(initialBlueprint ?? null)
  const [savedPage, setSavedPage] = useState<SavedExamBlueprint[]>([])
  const [dirty, setDirty] = useState(!initialBlueprint)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [pendingSave, setPendingSave] = useState<{ intent: ExamBlueprintIntent; id: string; version: number; request: string } | null>(null)
  const [pendingFinal, setPendingFinal] = useState<{ blueprint: SavedExamBlueprint; intent: BlueprintPaperIntent; request: string } | null>(null)
  const [finalPaper, setFinalPaper] = useState<SavedBlueprintPaper | null>(null)
  const [twoPageApproved, setTwoPageApproved] = useState(false)
  const [requestedReopen, setRequestedReopen] = useState<SavedExamBlueprint | null>(null)
  const [pendingMarks, setPendingMarks] = useState<string[]>([])
  const [markReset, setMarkReset] = useState(0)
  const [replacement, setReplacement] = useState<{ branchId: string; questionId: string | null } | null>(null)
  const [sidePanel, setSidePanel] = useState<'plan' | 'candidates'>('plan')
  const [mobileView, setMobileView] = useState<'side' | 'paper'>('side')
  const bankKey = plan.bankIds.join(',')
  const target = plan.branches.find((b) => b.id === targetId) ?? plan.branches[0]
  const loaded = pool?.bankIds.join(',') === bankKey && !!bankKey
  useEffect(() => {
    let active = true
    void getQuestionBanks().then((rows) => { if (active) setBanks(rows) }).catch(() => {
      if (active) { setFailed(true); setMessage('Question banks could not be loaded. Retry loading banks.') }
    })
    return () => { active = false }
  }, [reload])
  useEffect(() => {
    if (!bankKey) return
    let active = true
    const bankIds = bankKey.split(',')
    void getStructuredQuestionPoolForBanks(bankIds).then((supply) => {
      if (active) { setPool({ ...supply, bankIds }); setPage(0) }
    }).catch((error: unknown) => {
      if (active) { setFailed(true); setMessage(teacherErrorMessage(error, 'Questions could not be loaded. Retry loading banks.')) }
    })
    return () => { active = false }
  }, [bankKey, reload])
  useEffect(() => {
    if (!dirty && !pendingSave && !pendingFinal && !pendingMarks.length) return
    const warnUnsaved = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warnUnsaved)
    return () => window.removeEventListener('beforeunload', warnUnsaved)
  }, [dirty, pendingSave, pendingFinal, pendingMarks])
  function invalidateReview() {
    setTwoPageApproved(false); setFinalPaper(null)
    setDirty(true); setReview(null); setReplacement(null); setFailed(false); setMessage('Changes are pending. Review the complete paper again.')
  }
  function change(next: ExamBlueprint) { setPlan(next); invalidateReview() }
  function changeBranch(id: string, patch: Partial<BlueprintBranch>) {
    change({ ...plan, branches: plan.branches.map((b) => b.id === id ? { ...b, ...patch } : b) })
  }
  async function run(operation: () => Promise<void>) {
    if (busyRef.current) return
    busyRef.current = true; setBusy(true); setFailed(false); setMessage('Checking blueprint storage. Keep this page open.')
    try { await operation() }
    catch (error) { setFailed(true); setMessage(teacherErrorMessage(error, 'This action could not be confirmed. Reopen saved work.')); errorRef.current?.focus() }
    finally { busyRef.current = false; setBusy(false) }
  }
  function reopen(row: SavedExamBlueprint, confirmed = false) {
    if ((dirty || pendingSave || pendingFinal || pendingMarks.length) && !confirmed) { setRequestedReopen(row); return }
    setRequestedReopen(null)
    setPendingFinal(null); setFinalPaper(null); setTwoPageApproved(false)
    setSaved(row); setPlan(structuredClone(row.intent.blueprint)); setSettings({ ...DEFAULT_EXAM_SETTINGS, ...row.intent.settings })
    setGeneralInstruction(row.intent.generalInstruction); setPendingSave(null); setDirty(false); setReview(null); setPool(null)
    setTargetId(''); setSearch(''); setReload(n => n + 1); setFailed(false); setPendingMarks([]); setReplacement(null)
    setMessage('Configuration reopened. Review again against current bank content. This does not reopen a finalized paper.')
    setSidePanel('plan'); setMobileView('side')
  }
  useImperativeHandle(editorRef, () => ({ open: row => {
    if (busyRef.current) setRequestedReopen(row)
    else reopen(row)
  } }))
  function commitReview(next: BlueprintReviewChange) {
    setTwoPageApproved(false); setFinalPaper(null)
    setPlan(next.blueprint); setReview(next.snapshot); setDirty(true); setReplacement(null); setPendingMarks([]); setFailed(false)
    setMessage('Paper updated. Student paper and Answer key use the same chosen questions, order and marks. Save the blueprint to retain these edits.')
    setMobileView('paper')
  }
  function editReview(operation: () => BlueprintReviewChange) {
    try {
      if (!review || !loaded || pendingSave || busy || pendingMarks.length) throw new Error('Apply or cancel pending marks and wait for the current banks before editing the paper.')
      commitReview(operation())
    } catch (error) { setFailed(true); setMessage(teacherErrorMessage(error, 'Review this question and its constraints.')); errorRef.current?.focus() }
  }
  const filtered = loaded ? pool.questions.filter((q) => !search.trim() ||
    `${q.prompt} ${q.lesson} ${q.type} Unit ${q.unit}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())) : []
  const shown = filtered.slice(page * 25, (page + 1) * 25)
  const paperSettings = review ? { ...settings, questionCount: review.branches.reduce((n, b) => n + b.items.length, 0),
    unit: review.branches[0].items[0].question.unit, selectionSeed: review.selectionSeed } : settings
  function currentIntent(): ExamBlueprintIntent {
    return parseExamBlueprintIntent({ schemaVersion: 1, profileId: EXAM_BLUEPRINT_PROFILE_ID, rendererVersion: 1, blueprint: plan,
      settings: { schoolName: settings.schoolName, examTitle: settings.examTitle, teacherName: settings.teacherName, grade: 6 }, generalInstruction })
  }
  const withinOnePage = (() => { try { return !!review && assessBlueprintFit(createBlueprintPaperIntent(currentIntent(), review, 'review-required')).estimatedPages === 1 } catch { return false } })()
  const sourceIssues = (() => { try { return loaded ? getBlueprintSourceIssues(plan, pool!) : [] } catch { return [] } })()
  return <section aria-labelledby="blueprint-title">
    <h2 id="blueprint-title">Build a structured paper</h2>
    <p>Save a reusable question plan. Reviews use current bank content; saving a plan does not finalize a paper.</p>
    <p ref={errorRef} tabIndex={-1} role={failed ? 'alert' : 'status'}>{message}</p>
    <div className="recovery-actions">
      <button type="button" disabled={busy || !!pendingFinal || pendingMarks.length > 0 || (!dirty && !pendingSave)} onClick={() => void run(async () => {
        const request = pendingSave ?? { id: saved?.id ?? crypto.randomUUID(), version: saved?.version ?? 0, request: crypto.randomUUID(),
          intent: parseExamBlueprintIntent({ schemaVersion: 1, profileId: EXAM_BLUEPRINT_PROFILE_ID, rendererVersion: 1,
            blueprint: { ...plan, version: (saved?.version ?? 0) + 1 }, settings: { schoolName: settings.schoolName,
              examTitle: settings.examTitle, teacherName: settings.teacherName, grade: 6 }, generalInstruction }) }
        setPendingSave(request)
        let result: SavedExamBlueprint
        try { result = await saveExamBlueprint(request.intent, request.id, request.version, request.request) }
        catch (error) { if (error instanceof BlueprintStorageError && error.confirmedRejected) setPendingSave(null); throw error }
        setSaved(result); setPlan(result.intent.blueprint); setPendingSave(null); setDirty(false)
        setSavedPage(current => current.map(row => row.id === result.id ? result : row))
        setMessage(`Configuration saved, version ${result.version}. Current review is not a finalized paper.`)
      })}>{pendingSave ? 'Retry the same save' : 'Save blueprint'}</button>
      <button type="button" disabled={busy} onClick={() => void run(async () => {
        setSavedPage(await getExamBlueprints(ownerId)); setMessage('Saved configurations loaded. Reopening replaces current edits after confirmation.')
      })}>Load saved blueprints</button>
      {saved && <button type="button" disabled={busy} onClick={() => reopen(saved)}>Reopen saved version</button>}
      {saved && <button type="button" disabled={busy || dirty || !!pendingSave || !!pendingFinal || pendingMarks.length > 0} onClick={() => {
        const copy = duplicateExamBlueprintIntent(saved.intent)
        setSaved(null); setPlan(copy.blueprint); setSettings({ ...DEFAULT_EXAM_SETTINGS, ...copy.settings }); setGeneralInstruction(copy.generalInstruction)
        setReview(null); setReplacement(null); setDirty(true); setFailed(false); setSidePanel('plan'); setMobileView('side')
        setFinalPaper(null); setTwoPageApproved(false)
        setMessage('New editable copy created. Review current bank content and save to create a separate blueprint. The original is unchanged.')
      }}>Duplicate saved blueprint</button>}
      {saved && <span>Saved version {saved.version}{dirty ? ' · Unsaved edits' : ''}</span>}
    </div>
    {savedPage.length > 0 && <section aria-label="Saved blueprints"><h3>Saved blueprints</h3>
      {savedPage.map(row => <p key={row.id}><button type="button" disabled={busy} onClick={() => reopen(row)}>
        Reopen {row.intent.settings.examTitle} · version {row.version}</button></p>)}
      {savedPage.length === 25 && <button type="button" disabled={busy} onClick={() => void run(async () => {
        setSavedPage(await getExamBlueprints(ownerId, savedPage.at(-1))); setMessage('Next page of saved configurations loaded.')
      })}>Next saved blueprints</button>}
    </section>}
    {requestedReopen && <section role="group" aria-label="Replace current blueprint edits">
      <p>Replace current edits with {requestedReopen.intent.settings.examTitle}, version {requestedReopen.version}? An unconfirmed save may already exist.</p>
      <div className="recovery-actions"><button type="button" disabled={busy} onClick={() => reopen(requestedReopen, true)}>Replace current edits</button>
        <button type="button" onClick={() => setRequestedReopen(null)}>Keep editing</button></div>
    </section>}
    {pendingSave && <p>Save confirmation is pending. Retry the same save or load a saved configuration before editing.</p>}
    {pendingFinal && <p role="status">Finalization is unconfirmed. Retry the same request before editing, or open Finalized papers in My papers.</p>}
    {pendingMarks.length > 0 && <p role="status">Apply or cancel edited question marks before changing the plan, saving or replacing questions.</p>}
    <fieldset className="blueprint-edit-fields" disabled={busy || pendingSave !== null || pendingFinal !== null}><legend>Blueprint configuration and review</legend>
    <nav className="recovery-actions" aria-label="Paper workspace views">
      <button type="button" aria-pressed={sidePanel === 'plan' && mobileView === 'side'} onClick={() => { setSidePanel('plan'); setMobileView('side') }}>Question plan</button>
      <button type="button" aria-pressed={sidePanel === 'candidates' && mobileView === 'side'} onClick={() => { setSidePanel('candidates'); setMobileView('side') }}>Find questions</button>
      <button type="button" className="blueprint-mobile-review" aria-pressed={mobileView === 'paper'} onClick={() => setMobileView('paper')}>Paper review</button>
    </nav>
    <div className="blueprint-workspace" data-mobile-view={mobileView}>
      <div className="blueprint-side-panel">
      <fieldset hidden={sidePanel !== 'plan'} className="blueprint-controls blueprint-edit-fields" disabled={pendingMarks.length > 0}><legend>Question plan</legend>
        <fieldset><legend>Paper details</legend>
          {(['schoolName', 'examTitle', 'teacherName'] as const).map((field) => <label key={field}>
            {{ schoolName: 'School name', examTitle: 'Test title', teacherName: 'Teacher name' }[field]}
            <input autoComplete="off" maxLength={80} value={settings[field]} onChange={(e) => { setSettings({ ...settings, [field]: e.target.value }); invalidateReview() }} />
          </label>)}
          <label>General instruction<textarea maxLength={1000} value={generalInstruction} onChange={(e) => { setGeneralInstruction(e.target.value); invalidateReview() }} /></label>
          <label>Paper total marks<input type="number" min={1} max={1000} value={numberValue(plan.totalMarks)} onChange={(e) => change({ ...plan, totalMarks: e.target.value === '' ? NaN : Number(e.target.value) })} /></label>
        </fieldset>
        <fieldset><legend>Question banks</legend>
          {banks.map((bank) => <label className="checkbox-label" key={bank.id}><input type="checkbox" checked={plan.bankIds.includes(bank.id)}
            onChange={(e) => change({ ...plan, bankIds: e.target.checked ? [...plan.bankIds, bank.id] : plan.bankIds.filter((id) => id !== bank.id) })} />{bank.name}</label>)}
          {!banks.length && <p>No banks loaded. Add questions in Question banks, or retry.</p>}
          <button type="button" className="button-secondary" onClick={() => { setPool(null); setReview(null); setTwoPageApproved(false); setFinalPaper(null); setReload((n) => n + 1) }}>Retry loading banks</button>
        </fieldset>
        {sourceIssues.length > 0 && <section aria-label="Resolve changed source questions"><h3>Review source changes</h3>
          <ul>{sourceIssues.map(issue => <li key={issue.branchId + issue.scope + issue.id}>{issue.message}
            {issue.previousRevision !== undefined && <details><summary>Diagnostics: source versions</summary>Saved version {issue.previousRevision}; current {issue.currentRevision ?? 'unavailable'}.</details>}
            {issue.scope === 'question' && <p dir="auto">{pool?.questions.find(q => q.id === issue.id && q.revision === issue.currentRevision)?.prompt}</p>}
            {issue.scope === 'question' && <button type="button" onClick={() => {
              const branch = plan.branches.find(branch => branch.id === issue.branchId)!
              changeBranch(branch.id, { includedQuestionIds: branch.includedQuestionIds.filter(id => id !== issue.id), lockedQuestionIds: branch.lockedQuestionIds.filter(id => id !== issue.id) })
            }}>Clear Include and Lock for this question in {issue.slot}</button>}
            {issue.scope === 'group' && <details><summary>Current complete source context</summary>
              {pool?.passages.filter(group => group.id === issue.id).map(group => <div key={group.id}><p dir="auto">{group.instruction}</p><p dir="auto">{group.passage}</p>
                <ol>{group.children.map(child => <li key={child.question.id} dir="auto">{child.question.prompt}</li>)}</ol></div>)}
              {pool?.completionGroups.filter(group => group.id === issue.id).map(group => <div key={group.id}><p dir="auto">{group.instruction}</p>
                <ol>{group.childIds.map(id => <li key={id} dir="auto">{pool.questions.find(q => q.id === id)?.prompt}</li>)}</ol></div>)}
            </details>}
          </li>)}</ul>
          {[...new Set(sourceIssues.map(issue => issue.branchId))].map(id => <div key={id} className="recovery-actions">
            <button type="button" onClick={() => {
              try { change(acceptBlueprintSourceUpdates(plan, pool!, id)) }
              catch (error) { setFailed(true); setMessage(teacherErrorMessage(error, 'Review source changes.')) }
            }}>Accept current source versions for {sourceIssues.find(issue => issue.branchId === id)!.slot}</button>
            <button type="button" onClick={() => {
              try { change(resetBlueprintBranchSelection(plan, id)) }
              catch (error) { setFailed(true); setMessage(teacherErrorMessage(error, 'Review branch marks and constraints.')) }
            }}>Return {sourceIssues.find(issue => issue.branchId === id)!.slot} to bank selection</button>
          </div>)}
          <p>Return to bank selection clears reviewed versions and custom point marks. Counts, totals, Include and Lock remain. Clear missing Include or Lock explicitly here before choosing replacements.</p>
        </section>}
        {plan.branches.map((branch, index) => <fieldset key={branch.id}>
          <legend>Question or branch {index + 1}</legend>
          <div className="blueprint-field-grid">
            <label>Main question<select value={branch.mainQuestionNumber} onChange={(e) => changeBranch(branch.id, { mainQuestionNumber: Number(e.target.value) })}>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>Q{n}</option>)}</select></label>
            <label>Branch<select value={branch.branchLabel ?? ''} onChange={(e) => changeBranch(branch.id, { branchLabel: e.target.value as 'A' | 'B' || null })}>
              <option value="">Whole question</option><option>A</option><option>B</option></select></label>
          </div>
          <label>Structure<select value={branch.kind} onChange={(e) => changeBranch(branch.id, { kind: e.target.value as BlueprintBranch['kind'] })}>
            <option value="questions">Separate questions</option><option value="passage">Complete passage</option><option value="matching">Matching set</option>
            <option value="completion">Completion exercise</option><option value="alternatives">Writing alternatives</option></select></label>
          <label>Question type<select value={branch.questionTypes.length === 1 ? branch.questionTypes[0] : ''} onChange={(e) => changeBranch(branch.id, { questionTypes: e.target.value ? [e.target.value as QuestionType] : [...questionTypes] })}>
            <option value="">Any supported type</option>
            {questionTypes.map((type) => <option key={type} value={type}>{questionTypeLabels[type]}</option>)}</select></label>
          <label>Printed instruction<textarea maxLength={850} value={branch.instruction} onChange={(e) => changeBranch(branch.id, { instruction: e.target.value })} /></label>
          <label>Arabic instruction (optional)<textarea lang="ar" dir="rtl" maxLength={1000} value={branch.arabicInstruction ?? ''} onChange={(e) => changeBranch(branch.id, { arabicInstruction: e.target.value || null })} /></label>
          <div className="blueprint-field-grid">
            <label>Number of questions<input type="number" min={1} max={EXAM_LIMITS.maximumQuestionCount} value={numberValue(branch.quantity)} onChange={(e) => changeBranch(branch.id, { quantity: e.target.value === '' ? NaN : Number(e.target.value) })} /></label>
            <label>Displayed points<input type="number" min={1} max={200} value={numberValue(branch.displayedPointCount)} onChange={(e) => changeBranch(branch.id, { displayedPointCount: e.target.value === '' ? NaN : Number(e.target.value) })} /></label>
          </div>
          <p className="field-help">For a passage, count the questions beneath it. For matching or completion, count one set and enter its answerable points separately.</p>
          <label>Answer rule<select value={branch.answerRule.kind} onChange={(e) => changeBranch(branch.id, { answerRule: e.target.value === 'points'
            ? { kind: 'points', pointsToAnswer: NaN } : { kind: e.target.value as 'task' | 'choose-one' } })}>
            <option value="points">Points to answer</option><option value="task">Single writing or punctuation task</option><option value="choose-one">Choose one writing topic</option></select></label>
          {branch.answerRule.kind === 'points' && <label>Points to answer<input type="number" required min={1} max={branch.displayedPointCount} step={1}
            value={numberValue(branch.answerRule.pointsToAnswer)} onChange={(e) => changeBranch(branch.id, { answerRule: { kind: 'points', pointsToAnswer: e.target.value === '' ? NaN : Number(e.target.value) } })} /></label>}
          <label>Branch marks<input type="number" min={1} max={1000} value={numberValue(branch.marks)} onChange={(e) => changeBranch(branch.id, { marks: e.target.value === '' ? NaN : Number(e.target.value) })} /></label>
          <p className="field-help">{branch.distribution.mode === 'custom' ? 'Custom point marks are set in the paper controls. Apply changes there.' : 'Marks divide equally across the required answers. Optional points must have equal whole marks.'}</p>
          <details><summary>Unit, lesson and difficulty</summary>
            <label>Unit<select value={branch.units[0] ?? ''} onChange={(e) => changeBranch(branch.id, { units: e.target.value ? [Number(e.target.value)] : [] })}>
              <option value="">Any unit</option>{[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>Unit {n}</option>)}</select></label>
            <label>Lesson<input value={branch.lessons[0] ?? ''} onChange={(e) => changeBranch(branch.id, { lessons: e.target.value ? [e.target.value] : [] })} /></label>
            <label>Difficulty<select value={branch.difficulties[0] ?? ''} onChange={(e) => changeBranch(branch.id, { difficulties: e.target.value ? [e.target.value as 'easy' | 'medium' | 'hard'] : [] })}>
              <option value="">Any difficulty</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></label>
          </details>
          <button type="button" className="button-secondary" disabled={plan.branches.length === 1 || branch.lockedQuestionIds.length > 0 || branch.includedQuestionIds.length > 0}
            onClick={() => change({ ...plan, branches: plan.branches.filter((b) => b.id !== branch.id) })}>Remove this branch</button>
          {(branch.lockedQuestionIds.length > 0 || branch.includedQuestionIds.length > 0) && <p className="field-help">Unlock and clear Include before removing this branch.</p>}
        </fieldset>)}
        <button type="button" className="button-secondary" disabled={plan.branches.length >= 20} onClick={() => change({ ...plan, branches: [...plan.branches, newBranch(Math.min(5, plan.branches.at(-1)!.mainQuestionNumber + 1))] })}>Add question or branch</button>
        <details><summary>Advanced generation setting</summary><label>Paper seed<input type="number" min={0} max={0xffffffff} value={numberValue(plan.selectionSeed)} onChange={(e) => change({ ...plan, selectionSeed: e.target.value === '' ? NaN : Number(e.target.value) })} /></label>
          <p>The same seed keeps the same selection when the banks and rules are unchanged. Review again after changing it.</p>
        </details>
        {plan.branches.some(branch => branch.orderedQuestionIds?.length) && <button type="button" className="button-secondary" onClick={() => {
          try { change(clearBlueprintOrder(plan)) }
          catch (error) { setFailed(true); setMessage(teacherErrorMessage(error, 'Review the chosen order.')); errorRef.current?.focus() }
        }}>Return to bank selection</button>}
        <button type="button" disabled={!loaded} onClick={() => {
          try {
            const headerError = getFirstValidationError(validateExamSettings({ ...settings, selectionSeed: plan.selectionSeed,
              questionCount: plan.branches.reduce((sum, branch) => sum + branch.quantity, 0) }, EXAM_LIMITS.maximumQuestionCount))
            if (headerError) throw new Error(headerError)
            if (!generalInstruction.trim()) throw new Error('Enter the general paper instruction before reviewing.')
            const paper = selectBlueprintPaper(plan, pool!)
            const units = [...new Set(paper.branches.flatMap((b) => b.items.map((i) => i.question.unit)))].sort()
            projectCompoundPaper(paper, { ...settings, selectionSeed: plan.selectionSeed, unit: units[0],
              questionCount: paper.branches.reduce((n, b) => n + b.items.length, 0) }, generalInstruction, units)
            const recorded = recordBlueprintSourceReview(plan, paper, pool!)
            if (canonicalJson(recorded) !== canonicalJson(plan)) { setPlan(recorded); setDirty(true) }
            setTwoPageApproved(false); setFinalPaper(null)
            setReview(paper); setFailed(false); setMobileView('paper'); setMessage('Complete paper selected. Check Student paper and Answer key. Save chosen source versions before generating.')
          } catch (error) { setReview(null); setFailed(true); setMessage(teacherErrorMessage(error, 'Review the question plan and available content.')); errorRef.current?.focus() }
        }}>Review complete paper</button>
      </fieldset>
      <section hidden={sidePanel !== 'candidates'} className="blueprint-controls" aria-label="Question candidates">
        {replacement && review && loaded && <BlueprintReplacementPicker blueprint={plan} snapshot={review} pool={pool!}
          branchId={replacement.branchId} questionId={replacement.questionId} settings={paperSettings} generalInstruction={generalInstruction}
          disabled={busy || !!pendingSave || pendingMarks.length > 0}
          onChoose={id => editReview(() => replaceBlueprintQuestion(plan, review, pool!, replacement.branchId, replacement.questionId, id))}
          onCancel={() => setReplacement(null)} />}
        <details open={!replacement}><summary>Compare available questions ({filtered.length})</summary>
          <p className="field-help">These are bank questions. A question enters this section only after its type, filters, linked questions and the complete paper pass review. Include and Lock must fit the section. To replace a reviewed question, use its paper controls.</p>
          <fieldset className="blueprint-edit-fields" disabled={pendingMarks.length > 0 || !loaded}><legend>Bank selection constraints</legend>
          <label>Search questions<input type="search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0) }} /></label>
          <label>Place questions in<select value={target.id} onChange={(e) => setTargetId(e.target.value)}>{plan.branches.map((b) => <option key={b.id} value={b.id}>Q{b.mainQuestionNumber}{b.branchLabel ? `/${b.branchLabel}` : ''}</option>)}</select></label>
          {shown.map((question) => <article className="blueprint-candidate" key={question.id}>
            <p dir="auto">{question.prompt}</p><p className="field-help">Unit {question.unit} · Lesson {question.lesson} · {questionTypeLabels[question.type]} · {question.difficulty}</p>
            <div className="recovery-actions">{(['includedQuestionIds', 'excludedQuestionIds', 'lockedQuestionIds'] as const).map((key) => <label className="checkbox-label" key={key}>
              <input type="checkbox" checked={target[key].includes(question.id)} onChange={(e) => changeBranch(target.id,
                { [key]: e.target.checked ? [...target[key], question.id] : target[key].filter((id) => id !== question.id) })} />
              {{ includedQuestionIds: 'Include', excludedQuestionIds: 'Exclude', lockedQuestionIds: 'Lock' }[key]}
            </label>)}</div>
          </article>)}
          {!shown.length && <p>No matching questions. Change search or selected banks. Unsupported or incomplete groups cannot enter the paper.</p>}
          <div className="recovery-actions"><button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous questions</button>
            <span>Page {page + 1}</span><button type="button" disabled={(page + 1) * 25 >= filtered.length} onClick={() => setPage(page + 1)}>Next questions</button></div>
          </fieldset>
        </details>
      </section>
      </div>
      <div className="blueprint-review">
        {review ? <BlueprintPaperReview snapshot={review} settings={paperSettings} generalInstruction={generalInstruction}
          renderControls={branch => <BlueprintBranchControls branch={branch} plan={plan.branches.find(b => b.id === branch.id)!}
            disabled={busy || !!pendingSave || pendingMarks.length > 0 || !loaded} marksDisabled={busy || !!pendingSave || !loaded || pendingMarks.some(id => id !== branch.id)}
            canRemoveSection={plan.branches.length > 1} markReset={markReset}
            onMove={(id, direction) => editReview(() => moveBlueprintQuestion(plan, review, pool!, branch.id, id, direction))}
            onLock={id => editReview(() => toggleBlueprintLock(plan, review, pool!, branch.id, id))}
            onRemove={id => editReview(() => removeBlueprintSelection(plan, review, pool!, branch.id, id))}
            onReplace={id => { setReplacement({ branchId: branch.id, questionId: id }); setSidePanel('candidates'); setMobileView('side'); setMessage('Choose a valid replacement beside the paper. No change is applied until you choose it.') }}
            onMarks={(total, distribution) => commitReview(assignBlueprintMarks(plan, review, pool!, branch.id, total, distribution))}
            onPendingMarks={pending => setPendingMarks(current => pending ? [...new Set([...current, branch.id])] : current.filter(id => id !== branch.id))}
            onCancelMarks={() => { setPendingMarks([]); setMarkReset(n => n + 1); setMessage('Previous question marks retained.') }} />}
        /> : <section aria-label="Paper review pending"><h3>Paper review</h3><p>Define your questions and choose Review complete paper. Any change clears the previous review.</p></section>}

      </div>
    </div>
    </fieldset>
    {review && !pendingMarks.length && <>
      <BlueprintLayoutReview intent={currentIntent()} snapshot={review} approved={twoPageApproved} disabled={busy || !!pendingFinal || !!pendingSave}
        onDecision={setTwoPageApproved} onEdit={() => { setTwoPageApproved(false); setSidePanel('plan'); setMobileView('side'); setMessage('Edit the plan or use paper controls, then review and save again.') }} />
      <button type="button" disabled={busy || !!pendingSave || (!pendingFinal && (!saved || dirty || !(twoPageApproved || withinOnePage) || !loaded || sourceIssues.length > 0))} onClick={() => void run(async () => {
        const request = pendingFinal ?? { blueprint: saved!, intent: createBlueprintPaperIntent(saved!.intent, review, withinOnePage ? 'review-required' : 'unchanged-two-page'), request: crypto.randomUUID() }
        setPendingFinal(request)
        let result: SavedBlueprintPaper
        try { result = await finalizeBlueprintPaper(request.blueprint, request.intent, request.request) }
        catch (error) { if (error instanceof BlueprintStorageError && error.confirmedRejected) setPendingFinal(null); throw error }
        setPendingFinal(null); setFinalPaper(result); setMessage('Immutable paper saved. Its Student paper, Answer key and DOCX pair use the same captured review.')
      })}>{pendingFinal ? 'Retry the same finalization' : withinOnePage ? 'Finalize paper' : 'Finalize unchanged paper with two-page exception'}</button>
      {dirty && <p>Save the reviewed blueprint before finalizing this exact paper.</p>}
    </>}
    {finalPaper && <BlueprintFinalPaper key={finalPaper.id} paper={finalPaper} />}
  </section>
}
