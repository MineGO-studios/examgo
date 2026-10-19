import { useEffect, useRef, useState } from 'react'
import { questionRowToDomain, type DomainQuestion } from '../domain/questionDomain'
import { DEFAULT_EXAM_SETTINGS, type ExamSettings } from '../types/exam'
import { getQuestionBanks, type QuestionBank } from '../lib/questionBankRepository'
import { getActiveStandaloneQuestionsForBanks } from '../lib/questionMembershipRepository'
import { assignPhaseNineBranchMarks, buildPhaseNineAnswerKeyData, replacePhaseNineQuestion, togglePhaseNineQuestionLock, type PhaseNineReview } from '../lib/phaseNineWorkflow'
import { parsePhaseNineTeacherIntent, phaseNinePool, selectPhaseNineMarkedPaper, selectPhaseNinePaper, PHASE_NINE_GENERAL_INSTRUCTION, PHASE_NINE_PROFILE_ID, type PhaseNineTeacherIntent } from '../lib/phaseNineTeacherWorkflow'
import BranchMarkEditor from './BranchMarkEditor'
import { savePhaseNineDraft, finalizePhaseNineExam, type SavedPhaseNineWorkflow } from '../lib/phaseNineRepository'
import { renderFinalizedPhaseNine } from '../lib/phaseNineDelivery'
import { downloadPreparedDocument, requestBrowserDownload, type PreparedExamDocumentPair } from '../lib/documentDelivery'
import type { PageTarget } from '../lib/pageTarget'
import { teacherErrorMessage } from '../lib/safeErrorDetails'

interface Props {
  ownerId: string
  reopened: SavedPhaseNineWorkflow | null
  onSavedWork: () => void
  onAuthorQuestions: () => void
}

export default function PhaseNineBuilder({ ownerId, reopened, onSavedWork, onAuthorQuestions }: Props) {
  const initial = reopened?.intent
  const [settings, setSettings] = useState<ExamSettings>(initial?.settings ?? { ...DEFAULT_EXAM_SETTINGS, questionCount: 16, marksPerQuestion: 2 })
  const [filters, setFilters] = useState<PhaseNineTeacherIntent['filters']>(initial?.filters ?? { lesson: '', difficulty: '' })
  const [pageTarget, setPageTarget] = useState<PageTarget>(initial?.pageTarget ?? 1)
  const [banks, setBanks] = useState<QuestionBank[]>([])
  const [bankIds, setBankIds] = useState<string[]>(initial?.bankIds ?? (initial ? [initial.bankId] : []))
  const bankId = bankIds[0] ?? ''
  const bankKey = bankIds.join(',')
  const [examOwnedMarks, setExamOwnedMarks] = useState(!initial || initial.schemaVersion === 3)
  const [pendingMarks, setPendingMarks] = useState<string[]>([])
  const [questions, setQuestions] = useState<DomainQuestion[]>([])
  const [review, setReview] = useState<PhaseNineReview | null>(initial?.review ?? null)
  const [saved, setSaved] = useState<SavedPhaseNineWorkflow | null>(reopened)
  const [dirty, setDirty] = useState(!reopened)
  const [loadedBankKey, setLoadedBankKey] = useState('')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [message, setMessage] = useState('Choose your banks, preview the Q3–Q5 excerpt, and assign whole marks before saving.')
  const [failed, setFailed] = useState(false)
  const [documents, setDocuments] = useState<PreparedExamDocumentPair | null>(null)
  const [pendingSave, setPendingSave] = useState<{ intent: PhaseNineTeacherIntent; id: string; version: number; request: string } | null>(null)
  const finalizationRequest = useRef(crypto.randomUUID())
  const finalized = saved?.finalized === true
  const loading = !finalized && (!bankId || loadedBankKey !== bankKey)

  useEffect(() => {
    if (finalized) return
    let active = true
    void getQuestionBanks().then((rows) => {
      if (!active) return
      setBanks(rows)
      setBankIds((current) => current.length ? current : rows[0] ? [rows[0].id] : [])
    }).catch((error: unknown) => {
      if (active) { setFailed(true); setMessage(teacherErrorMessage(error, 'Unable to load question banks.')) }
    })
    return () => { active = false }
  }, [finalized])

  useEffect(() => {
    if (!bankId || finalized) return
    let active = true
    const selected = bankKey.split(',')
    void getActiveStandaloneQuestionsForBanks(selected).then((rows) => {
      if (active) { setQuestions(rows.map(questionRowToDomain)); setLoadedBankKey(bankKey) }
    }).catch((error: unknown) => {
      if (active) { setFailed(true); setMessage(teacherErrorMessage(error, 'Unable to load questions. Reopen the bank and try again.')) }
    })
    return () => { active = false }
  }, [bankId, bankKey, finalized])

  const pool = phaseNinePool(questions, ownerId, examOwnedMarks ? bankIds : bankId, filters)
  const answerRows = review ? buildPhaseNineAnswerKeyData(review.snapshot, settings).Answers : []
  const locked = busy || finalized || pendingSave !== null || pendingMarks.length > 0
  const changed = (reselect = false) => {
    setDirty(true); setDocuments(null); setFailed(false)
    if (reselect) setReview(null)
    finalizationRequest.current = crypto.randomUUID()
  }
  const run = async (operation: () => Promise<void>) => {
    if (busyRef.current) return
    busyRef.current = true; setBusy(true); setFailed(false)
    try { await operation() }
    catch (error) { setFailed(true); setMessage(teacherErrorMessage(error, 'The operation could not be confirmed. Reopen saved work before continuing.')) }
    finally { busyRef.current = false; setBusy(false) }
  }
  const intent = (): PhaseNineTeacherIntent => {
    if (!review) throw new Error('Preview the questions first.')
    if (pendingMarks.length) throw new Error('Apply the pending question marks before saving.')
    return parsePhaseNineTeacherIntent({ schemaVersion: examOwnedMarks ? 3 : 2, profileId: PHASE_NINE_PROFILE_ID, rendererVersion: 1, ownerId, bankId,
      ...(examOwnedMarks ? { bankIds } : {}),
      settings: { ...settings, teacherName: settings.teacherName ?? '', questionCount: review.snapshot.structure.branches.reduce((n, b) => n + b.items.length, 0) },
      filters, pageTarget, generalInstruction: PHASE_NINE_GENERAL_INSTRUCTION, review })
  }
  const save = () => run(async () => {
    const request = pendingSave ?? { intent: intent(), id: saved?.id ?? crypto.randomUUID(), version: saved?.version ?? 0, request: crypto.randomUUID() }
    setPendingSave(request)
    const result = await savePhaseNineDraft(request.intent, request.id, request.version, request.request)
    setSaved(result); setPendingSave(null); setDirty(false)
    setMessage('Draft saved with your settings, chosen questions, order and locks. Reopen it from My papers to save another version.')
  })
  const finalize = () => run(async () => {
    if (!saved || dirty) throw new Error('Save the current reviewed draft before finalizing.')
    const result = await finalizePhaseNineExam(saved, finalizationRequest.current)
    setSaved(result)
    setMessage('Finalized paper saved. Prepare the matching documents from this captured version.')
  })

  return <section className="card" aria-labelledby="structured-builder-title">
    <h2 id="structured-builder-title">Iraqi exercises and writing</h2>
    <p>Approved Q3/A–Q5 excerpt: completion, five-of-six odd words, five-of-six relationships, one rewrite and one of two writing alternatives.
      {examOwnedMarks ? ` Attempted total: ${review?.snapshot.totalMarks ?? 60} marks. Assign question totals below.` : ' Total: 60 marks.'} This is not a complete Q1–Q5 paper.</p>
    <p role={failed ? 'alert' : 'status'} aria-live="polite">{message}</p>
    <fieldset disabled={locked} className="structured-fields">
      <legend>Paper settings</legend>
      <label>Primary question bank<select value={bankId} onChange={(e) => { setBankIds([e.target.value, ...bankIds.slice(1).filter((id) => id !== e.target.value)]); changed(true) }}>
        {banks.map((bank) => <option key={bank.id} value={bank.id}>{bank.name}</option>)}
        {finalized && <option value={bankId}>Saved question bank</option>}
      </select></label>
      {examOwnedMarks && !finalized && <fieldset><legend>Additional banks</legend>
        <p>Shared questions appear once. Passage children stay with their passage.</p>
        {banks.filter((bank) => bank.id !== bankId).map((bank) => <label key={bank.id}>
          <input type="checkbox" checked={bankIds.includes(bank.id)} disabled={bankIds.length >= 20 && !bankIds.includes(bank.id)}
            onChange={(event) => { setBankIds(event.target.checked ? [...bankIds, bank.id] : bankIds.filter((id) => id !== bank.id)); changed(true) }} />{bank.name}
        </label>)}
      </fieldset>}
      {(['schoolName', 'examTitle', 'teacherName'] as const).map((key) => <label key={key}>
        {{ schoolName: 'School name', examTitle: 'Test title', teacherName: 'Teacher name' }[key]}
        <input maxLength={80} value={settings[key] ?? ''} onChange={(e) => { setSettings({ ...settings, [key]: e.target.value }); changed() }} />
      </label>)}
      <label>Lesson filter<input maxLength={40} value={filters.lesson} placeholder="All lessons" onChange={(e) => { setFilters({ ...filters, lesson: e.target.value }); changed(true) }} /></label>
      <label>Difficulty<select value={filters.difficulty} onChange={(e) => { setFilters({ ...filters, difficulty: e.target.value as typeof filters.difficulty }); changed(true) }}>
        <option value="">All difficulties</option><option>easy</option><option>medium</option><option>hard</option>
      </select></label>
      <details><summary>Advanced generation setting</summary>
        <label>Paper seed<input type="number" min={0} max={4294967295} value={settings.selectionSeed} onChange={(e) => { setSettings({ ...settings, selectionSeed: Number(e.target.value) }); changed(true) }} /></label>
        <p>The same seed keeps the same selection when the banks and filters are unchanged. Review again after changing it.</p>
      </details>
      <label>Page target<select value={pageTarget} onChange={(e) => { setPageTarget(Number(e.target.value) as PageTarget); changed() }}>
        {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
      </select></label>
    </fieldset>
    <p>The page target is saved intent, not a verified page count. Inspect the documents in Word or LibreOffice before printing.</p>
    <div className="recovery-actions">
      {!finalized && <button disabled={locked || loading || !bankId} onClick={() => void run(async () => {
        setReview(examOwnedMarks ? selectPhaseNineMarkedPaper(pool, settings.selectionSeed) : selectPhaseNinePaper(pool, settings.selectionSeed)); changed(); setMessage('Review ready. Assign question marks, lock or replace questions, then save the draft.')
      })}>{loading ? 'Loading questions…' : 'Preview questions'}</button>}
      <button className="button-secondary" disabled={busy} onClick={onAuthorQuestions}>Author questions</button>
      <button className="button-secondary" disabled={busy} onClick={onSavedWork}>My papers</button>
    </div>
    {review && <div>
      {review.snapshot.structure.branches.map((branch) => <section key={branch.id} className="structured-branch">
        <h3>Q{branch.mainQuestionNumber}{branch.branchLabel ? `/${branch.branchLabel}` : ''} — {branch.marks} marks</h3>
        <p>{branch.instruction}</p>
        <ol>{branch.items.map((item) => <li key={item.question.id}>
          <p><strong>{item.visibleLabel}.</strong> {item.question.prompt}</p>
          <p className="structured-question-content">{item.question.type === 'completion' ? item.question.content.text : item.question.type === 'odd-word' ? item.question.content.words.join(' / ') : ''}</p>
          <details><summary>Review answer</summary><ul className="structured-answer">{answerRows.filter((row) => row.Q === String(branch.mainQuestionNumber) && row.Part === (branch.branchLabel ?? '—') && (branch.kind === 'completion' || row.Point === item.visibleLabel)).map((row) => <li key={row.Point}>{row.Point}: {row.Answer} — {row.Mark} marks</li>)}</ul></details>
          {!finalized && <div className="recovery-actions">
            <button disabled={locked} aria-pressed={review.lockedQuestionIds.includes(item.question.id)} onClick={() => { setReview(togglePhaseNineQuestionLock(review, item.question.id)); changed() }}>{review.lockedQuestionIds.includes(item.question.id) ? 'Unlock' : 'Lock'} question {item.visibleLabel}</button>
            <button disabled={locked || loading || review.lockedQuestionIds.includes(item.question.id)} onClick={() => void run(async () => {
              const replaced = replacePhaseNineQuestion(review, item.question.id, pool)
              parsePhaseNineTeacherIntent({ ...intent(), review: replaced })
              setReview(replaced); changed(); setMessage('Replacement ready. Review and save the changed draft.')
            })}>Replace question {item.visibleLabel}</button>
          </div>}
        </li>)}</ol>
        {examOwnedMarks && !finalized && <BranchMarkEditor
          key={`${branch.id}:${JSON.stringify(branch.pointMarks)}:${branch.marks}`} branch={branch}
          disabled={busy || pendingSave !== null || loading}
          onPendingChange={(pending) => setPendingMarks((ids) => pending ? [...new Set([...ids, branch.id])] : ids.filter((id) => id !== branch.id))}
          onApply={(total, distribution) => {
            setReview(assignPhaseNineBranchMarks(review, branch.id, total, distribution)); changed()
          }} />}
      </section>)}
      <div className="recovery-actions">
        {!finalized && <button disabled={busy || pendingMarks.length > 0 || loading} onClick={() => void save()}>{pendingSave ? 'Retry the same save' : 'Save structured draft'}</button>}
        {!finalized && <button disabled={busy || dirty || !saved || pendingSave !== null || pendingMarks.length > 0} onClick={() => void finalize()}>Finalize reviewed paper</button>}
        {finalized && <button disabled={busy} onClick={() => void run(async () => { setDocuments(await renderFinalizedPhaseNine(saved)); setMessage('Both documents are ready from the same finalized version. Download each file below.') })}>Prepare saved documents</button>}
        {finalized && <button disabled={busy} className="button-secondary" onClick={() => {
          setSaved(null); setExamOwnedMarks(true); changed(true); setMessage('Editing a new copy. The finalized paper is preserved. Review current bank content and assign marks before saving.')
        }}>Edit a new copy</button>}
      </div>
    </div>}
    {documents && <div className="recovery-actions">{(['exam', 'answerKey'] as const).map((kind) => <button key={kind} disabled={busy} onClick={() => void run(async () => {
      const result = await downloadPreparedDocument(documents[kind], requestBrowserDownload)
      if (result.status === 'failed') throw new Error(result.error)
      setMessage(`${kind === 'exam' ? 'Student exam' : 'Answer key'} download requested. Check your downloads; retry this button if needed.`)
    })}>Download {kind === 'exam' ? 'student exam' : 'answer key'}</button>)}</div>}
  </section>
}
