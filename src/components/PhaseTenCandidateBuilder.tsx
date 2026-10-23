import { useEffect, useRef, useState } from 'react'
import type { DomainQuestion } from '../domain/questionDomain'
import { DEFAULT_EXAM_SETTINGS, type ExamSettings } from '../types/exam'
import { getQuestionBanks, type QuestionBank } from '../lib/questionBankRepository'
import { getStructuredQuestionPoolForBanks } from '../lib/passageGroupRepository'
import type { PassageGroup } from '../domain/passageGroup'
import type { CompletionGroup, CompoundSnapshot } from '../domain/compoundStructure'
import { projectCompoundPaper } from '../lib/compoundWorkflow'
import { projectMatching } from '../lib/matchingProjection'
import { selectExam002Candidate } from '../lib/phaseTenCandidateSelection'
import { selectExam002MidyearCandidate, type MidyearSelectionControls } from '../lib/phaseTenMidyearSelection'
import { selectExam002MarkedCandidate } from '../lib/phaseElevenCandidateSelection'
import { assignCandidateExamMarks, carryCandidateExamMarks } from '../lib/phaseTenCandidateProfile'
import type { MarkDistribution } from '../domain/markAllocation'
import BranchMarkEditor from './BranchMarkEditor'
import { PHASE_TEN_CANDIDATE_PROFILE_ID, PHASE_TEN_GENERAL_INSTRUCTION, PHASE_TEN_MIDYEAR_UNITS,
  parsePhaseTenTeacherIntent, type PhaseTenTeacherIntent } from '../lib/phaseTenTeacherWorkflow'
import { finalizePhaseTenCandidate, savePhaseTenCandidateDraft, type SavedPhaseTenCandidate } from '../lib/phaseTenCandidateRepository'
import { renderFinalizedPhaseTenCandidate } from '../lib/phaseTenDelivery'
import { downloadPreparedDocument, requestBrowserDownload, type PreparedExamDocumentPair } from '../lib/documentDelivery'
import WordFilePreview from './WordFilePreview'
import { teacherErrorMessage } from '../lib/safeErrorDetails'

interface Props {
  ownerId: string
  reopened: SavedPhaseTenCandidate | null
  onSavedWork: () => void
  onAuthorQuestions: () => void
}

function matchingReview(question: Extract<DomainQuestion, { type: 'matching' }>, seed: number) {
  const displayed = projectMatching(question, seed)
  return <p className="structured-question-content">
    List A: {displayed.left.map((item, index) => `${index + 1}. ${item.text}`).join(' · ')}<br />
    List B: {displayed.right.map((item, index) => `${String.fromCharCode(97 + index)}. ${item.text}`).join(' · ')}
  </p>
}

export default function PhaseTenCandidateBuilder({ ownerId, reopened, onSavedWork, onAuthorQuestions }: Props) {
  const initial = reopened?.intent
  const midyear = !initial || initial.coverageUnits !== undefined
  const [settings, setSettings] = useState<ExamSettings>(initial?.settings ?? { ...DEFAULT_EXAM_SETTINGS, examTitle: 'Mid-Year', questionCount: 30 })
  const [banks, setBanks] = useState<QuestionBank[]>([])
  const [bankIds, setBankIds] = useState<string[]>(initial?.snapshot.bankIds ?? (initial ? [initial.bankId] : []))
  const bankId = bankIds[0] ?? ''
  const bankKey = bankIds.join(',')
  const [examOwnedMarks, setExamOwnedMarks] = useState(!initial || initial.schemaVersion === 2)
  const [questions, setQuestions] = useState<DomainQuestion[]>([])
  const [groups, setGroups] = useState<PassageGroup[]>([])
  const [completionGroups, setCompletionGroups] = useState<CompletionGroup[]>([])
  const [standaloneIds, setStandaloneIds] = useState<string[]>([])
  const [loadedBankKey, setLoadedBankKey] = useState('')
  const [review, setReview] = useState<CompoundSnapshot | null>(initial?.snapshot ?? null)
  const markReference = useRef<CompoundSnapshot | null>(initial?.snapshot ?? null)
  const [pendingMarks, setPendingMarks] = useState<string[]>([])
  const [controls, setControls] = useState<MidyearSelectionControls>(initial?.selectionControls ?? {})
  const [controlSlot, setControlSlot] = useState('')
  const [controlQuestionId, setControlQuestionId] = useState('')
  const [alternatives, setAlternatives] = useState<DomainQuestion[]>([])
  const [checkingAlternatives, setCheckingAlternatives] = useState(false)
  const [saved, setSaved] = useState<SavedPhaseTenCandidate | null>(reopened)
  const [dirty, setDirty] = useState(!reopened)
  const [documents, setDocuments] = useState<PreparedExamDocumentPair | null>(null)
  const [pendingSave, setPendingSave] = useState<{ intent: PhaseTenTeacherIntent; id: string; version: number; request: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const finalizationRequest = useRef(crypto.randomUUID())
  const [failed, setFailed] = useState(false)
  const [message, setMessage] = useState('Select your banks, preview the paper, and assign whole marks before saving.')
  const finalized = saved?.finalized === true
  const loading = !finalized && (!bankId || loadedBankKey !== bankKey)
  const locked = busy || finalized || pendingSave !== null

  useEffect(() => {
    if (finalized) return
    let active = true
    void getQuestionBanks().then((rows) => {
      if (active) { setBanks(rows); setBankIds((current) => current.length ? current : rows[0] ? [rows[0].id] : []) }
    }).catch((error: unknown) => {
      if (active) { setFailed(true); setMessage(teacherErrorMessage(error, 'Unable to load question banks.')) }
    })
    return () => { active = false }
  }, [finalized])

  useEffect(() => {
    if (!bankId || finalized) return
    let active = true
    void getStructuredQuestionPoolForBanks(bankKey.split(',')).then((pool) => {
      if (active) { setQuestions(pool.questions); setGroups(pool.passages); setCompletionGroups(pool.completionGroups); setStandaloneIds(pool.standaloneQuestionIds); setLoadedBankKey(bankKey) }
    }).catch((error: unknown) => {
      if (active) { setFailed(true); setMessage(teacherErrorMessage(error, 'Unable to load this bank. Reopen and try again.')) }
    })
    return () => { active = false }
  }, [bankId, bankKey, finalized])

  const changed = (reselect = false) => {
    setDirty(true); setDocuments(null); setFailed(false)
    if (reselect) setReview(null)
    finalizationRequest.current = crypto.randomUUID()
  }
  const run = async (operation: () => Promise<void>) => {
    if (busyRef.current) return
    busyRef.current = true; setBusy(true); setFailed(false)
    try { await operation() }
    catch (error) { setFailed(true); setMessage(teacherErrorMessage(error, 'The action could not be confirmed. Reopen saved work before continuing.')) }
    finally { busyRef.current = false; setBusy(false) }
  }
  const intent = (): PhaseTenTeacherIntent => {
    if (!review) throw new Error('Preview and review a complete paper first.')
    if (pendingMarks.length) throw new Error('Apply every edited question mark before saving.')
    return parsePhaseTenTeacherIntent({ schemaVersion: review.schemaVersion, profileId: PHASE_TEN_CANDIDATE_PROFILE_ID,
      rendererVersion: 1, ownerId, bankId, generalInstruction: PHASE_TEN_GENERAL_INSTRUCTION,
      settings: { ...settings, teacherName: settings.teacherName ?? '', questionCount: review.branches.reduce((count, branch) => count + branch.items.length, 0) },
      ...(midyear ? { coverageUnits: PHASE_TEN_MIDYEAR_UNITS, selectionControls: controls } : {}), snapshot: review })
  }
  const save = () => run(async () => {
    const request = pendingSave ?? { intent: intent(), id: saved?.id ?? crypto.randomUUID(),
      version: saved?.version ?? 0, request: crypto.randomUUID() }
    setPendingSave(request)
    const result = await savePhaseTenCandidateDraft(request.intent, request.id, request.version, request.request)
    setSaved(result); setPendingSave(null); setDirty(false)
    setMessage('Complete-paper draft saved with your chosen questions and passages. Reopen it from My papers to save another version.')
  })
  const finalize = () => run(async () => {
    if (!saved || dirty || pendingMarks.length) throw new Error('Apply question marks and save the current reviewed paper before finalizing.')
    const result = await finalizePhaseTenCandidate(saved, finalizationRequest.current)
    setSaved(result)
    setMessage('Finalized paper saved. Prepare both documents from this captured version.')
  })
  const projected = review ? projectCompoundPaper(review, { ...settings, questionCount: review.branches.reduce((count, branch) => count + branch.items.length, 0) },
    PHASE_TEN_GENERAL_INSTRUCTION, midyear ? PHASE_TEN_MIDYEAR_UNITS : undefined) : null
  const preview = (nextControls = controls) => {
    if (pendingMarks.length || loading) throw new Error('Apply edited marks and wait for the selected banks before previewing.')
    let next = examOwnedMarks
      ? selectExam002MarkedCandidate(questions, groups, standaloneIds, ownerId, bankIds, settings.selectionSeed,
        midyear ? PHASE_TEN_MIDYEAR_UNITS : [settings.unit], nextControls, completionGroups)
      : midyear
      ? selectExam002MidyearCandidate(questions, groups, ownerId, bankId, settings.selectionSeed, nextControls)
      : selectExam002Candidate(questions, groups, ownerId, bankId, settings.selectionSeed)
    if (examOwnedMarks && markReference.current) next = carryCandidateExamMarks(markReference.current, next)
    markReference.current = next
    setControls(nextControls); setReview(next); changed()
    setMessage('Candidate preview ready. Review every branch and answer before saving.')
  }
  const applyMarks = (branchId: string, totalMarks: number, distribution: MarkDistribution) => {
    if (!review) return
    const next = assignCandidateExamMarks(review, bankIds, Object.fromEntries(review.branches.map((branch) =>
      [branch.id, branch.id === branchId ? { totalMarks, distribution } : { totalMarks: branch.marks,
        distribution: branch.pointMarks ? { mode: 'custom', marksByPoint: branch.pointMarks } : { mode: 'equal' } }])))
    setExamOwnedMarks(true); setReview(next); markReference.current = next; changed()
    setMessage('Question marks applied. Review the updated answer key and save the paper.')
  }
  const changeable = review?.branches.flatMap((branch) => branch.id === 'q1a' ? []
    : (branch.completionGroup ? branch.items.slice(0, 1) : branch.items).map((item) => ({ key: `${branch.id}:${item.label}`, branch, item }))) ?? []
  const selectedSlot = changeable.find((entry) => entry.key === controlSlot)
  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout>
    const slot = review?.branches.flatMap((branch) => branch.id === 'q1a' ? []
      : branch.items.map((item) => ({ key: `${branch.id}:${item.label}`, item })))
      .find((entry) => entry.key === controlSlot)
    timer = setTimeout(() => {
      setAlternatives([])
      if (!midyear || !review || !slot || loading || finalized) { setCheckingAlternatives(false); return }
      setCheckingAlternatives(true)
      const choices = questions.filter(question => question.type === slot.item.question.type &&
        (examOwnedMarks || question.marks === slot.item.question.marks) && question.id !== slot.item.question.id)
      const result: DomainQuestion[] = []
      let index = 0
      const checkBatch = () => {
        if (!active) return
        const end = Math.min(index + 5, choices.length)
        for (; index < end; index++) {
          const question = choices[index]
          try {
            const nextControls = { ...controls, lockedQuestionIds: { ...controls.lockedQuestionIds, [controlSlot]: question.id } }
            if (examOwnedMarks) selectExam002MarkedCandidate(questions, groups, standaloneIds, ownerId, bankIds,
              settings.selectionSeed, PHASE_TEN_MIDYEAR_UNITS, nextControls, completionGroups)
            else selectExam002MidyearCandidate(questions, groups, ownerId, bankId, settings.selectionSeed, nextControls)
            result.push(question)
          } catch { /* Offer only choices that satisfy the complete paper. */ }
        }
        if (index < choices.length) timer = setTimeout(checkBatch, 0)
        else { setAlternatives(result); setCheckingAlternatives(false) }
      }
      checkBatch()
    }, 0)
    return () => { active = false; clearTimeout(timer) }
  }, [midyear, review, controlSlot, questions, groups, completionGroups, standaloneIds, ownerId, bankId, bankIds, examOwnedMarks, settings.selectionSeed, controls, loading, finalized])

  return <section className="card" aria-labelledby="candidate-builder-title">
    <h2 id="candidate-builder-title">Complete paper candidate</h2>
    <p>Fixed complete-paper layout: nine ordered branches, one saved passage, two matching sets and one writing choice.
      {examOwnedMarks ? ` Attempted total: ${review?.totalMarks ?? 60} marks. Assign question totals below.` : ' Historical paper: 60 attempted marks.'}
      {midyear ? ' Mid-year coverage: Units 1–4, at least one question from each.' : ''}</p>
    {pendingMarks.length > 0 && <p role="status">Apply edited question marks before changing the paper, saving or finalizing.</p>}
    <p role={failed ? 'alert' : 'status'} aria-live="polite">{message}</p>
    <fieldset disabled={locked || pendingMarks.length > 0} className="structured-fields">
      <legend>Paper settings</legend>
      <label>Primary question bank<select value={bankId} onChange={(event) => {
        const id = event.target.value
        setBankIds(examOwnedMarks ? [id, ...bankIds.filter((current) => current !== id)] : [id]); setControls({}); changed(true)
      }}>
        {banks.map((bank) => <option key={bank.id} value={bank.id}>{bank.name}</option>)}
        {finalized && <option value={bankId}>Saved question bank</option>}
      </select></label>
      {examOwnedMarks && !finalized && <fieldset>
        <legend>Additional banks</legend>
        <p>Questions shared by these banks appear once. Complete passage groups keep their context.</p>
        {banks.filter((bank) => bank.id !== bankId).map((bank) => <label key={bank.id}>
          <input type="checkbox" checked={bankIds.includes(bank.id)} disabled={!bankIds.includes(bank.id) && bankIds.length >= 20}
            onChange={(event) => {
              setBankIds(event.target.checked ? [...bankIds, bank.id] : bankIds.filter((id) => id !== bank.id))
              setControls({}); changed(true)
            }} />{bank.name}
        </label>)}
      </fieldset>}
      {finalized && review?.bankIds && <p>{review.bankIds.length} banks captured in this paper.</p>}
      {(['schoolName', 'examTitle', 'teacherName'] as const).map((key) => <label key={key}>
        {{ schoolName: 'School name', examTitle: 'Test title', teacherName: 'Teacher name' }[key]}
        <input maxLength={80} value={settings[key] ?? ''} onChange={(event) => { setSettings({ ...settings, [key]: event.target.value }); changed() }} />
      </label>)}
      <details><summary>Advanced generation setting</summary>
        <label>Paper seed<input type="number" min={0} max={4294967295} value={settings.selectionSeed}
          onChange={(event) => { setSettings({ ...settings, selectionSeed: Number(event.target.value) }); changed(true) }} /></label>
        <p>The same seed keeps the same selection when the banks and filters are unchanged. Review again after changing it.</p>
      </details>
    </fieldset>
    <p>Check page fit in Word or LibreOffice. The paper and answer key use the same captured questions.</p>
    <div className="recovery-actions">
      {!finalized && <button disabled={locked || loading || !bankId || pendingMarks.length > 0} onClick={() => void run(async () => {
        preview()
      })}>{loading ? 'Loading questions…' : 'Preview complete paper'}</button>}
      <button className="button-secondary" disabled={busy} onClick={onAuthorQuestions}>Author questions</button>
      <button className="button-secondary" disabled={busy} onClick={onSavedWork}>My papers</button>
    </div>
    {review && <div>
      {midyear && !finalized && <fieldset disabled={locked || loading || pendingMarks.length > 0} className="structured-fields">
        <legend>Question controls</legend>
        <p>Choose a saved passage, exclude the current passage, or replace and lock an individual question. Every change checks the complete paper before it can be saved.</p>
        <label>Passage group<select value={controls.lockedPassageGroupId ?? ''} onChange={(event) => void run(async () => {
          preview({ ...controls, lockedPassageGroupId: event.target.value || undefined })
        })}>
          <option value="">Choose automatically</option>
          {groups.filter(group => group.attemptCount === 5 && group.children.length === 6 &&
            group.children.every(child => child.question.type === 'short-answer' && child.question.isActive))
            .map((group) => <option key={group.id} value={group.id}>{group.title || group.passage.slice(0, 90)}</option>)}
        </select></label>
        <button type="button" className="button-secondary" onClick={() => void run(async () => {
          const groupId = review.branches[0].passageGroup?.id
          if (!groupId) throw new Error('The preview has no passage group.')
          preview({ ...controls, lockedPassageGroupId: undefined,
            excludedPassageGroupIds: [...(controls.excludedPassageGroupIds ?? []), groupId] })
        })}>Exclude current passage and preview</button>
        <label>Question slot<select value={controlSlot} onChange={(event) => { setControlSlot(event.target.value); setControlQuestionId('') }}>
          <option value="">Choose a slot</option>
          {changeable.map((entry) => <option key={entry.key} value={entry.key}>
            Q{entry.branch.mainQuestionNumber}/{entry.branch.branchLabel ?? 'Writing'} {entry.item.label}: {entry.item.question.prompt.slice(0, 55)}
          </option>)}
        </select></label>
        {selectedSlot && <>
          <button type="button" className="button-secondary" onClick={() => void run(async () => {
            const nextLocks = { ...controls.lockedQuestionIds }
            delete nextLocks[selectedSlot.key]
            preview({ ...controls, excludedQuestionIds: [...(controls.excludedQuestionIds ?? []), selectedSlot.item.question.id],
              lockedQuestionIds: nextLocks })
          })}>Exclude current question and preview</button>
          {checkingAlternatives && <p role="status">Checking replacement choices against the complete paper…</p>}
          <label>Replacement question<select disabled={checkingAlternatives} value={controlQuestionId} onChange={(event) => setControlQuestionId(event.target.value)}>
            <option value="">{examOwnedMarks ? 'Choose a question with matching type and points' : 'Choose a question with matching type and marks'}</option>
            {alternatives.map((question) => <option key={question.id} value={question.id}>{question.externalId}: {question.prompt.slice(0, 65)}</option>)}
          </select></label>
          <button type="button" disabled={checkingAlternatives || !controlQuestionId} onClick={() => void run(async () => {
            preview({ ...controls, lockedQuestionIds: { ...controls.lockedQuestionIds, [selectedSlot.key]: controlQuestionId } })
          })}>Include as locked replacement and preview</button>
        </>}
      </fieldset>}
      {review.branches.map((branch) => <section key={branch.id} className="structured-branch">
        <h3>Q{branch.mainQuestionNumber}{branch.branchLabel ? `/${branch.branchLabel}` : ''} — {branch.marks} marks</h3>
        <p>{branch.instruction}</p>
        {branch.kind === 'passage' && <p className="structured-question-content">{branch.passageGroup?.passage}</p>}
        <ul className="candidate-review-items">{branch.items.map((item) => <li key={item.question.id}>
          {item.label !== 'Main' && item.question.type !== 'completion' && <strong>{item.label}. </strong>}
          {item.question.type !== 'matching' && item.question.type !== 'completion' && item.question.prompt}
          {item.question.type === 'multiple-choice' && !item.question.prompt.includes('(') &&
            ` (${item.question.content.options.map((option) => option.text).join(' / ')})`}
          {item.question.type === 'binary' && ` ${item.question.content.labelMode === 'yes-no' ? 'Yes/No' : 'T/F'}`}
          {item.question.type === 'completion' && <>
            {item === branch.items[0] && <p className="structured-question-content">{`{${item.question.content.wordBank.join(',  ')}}`}</p>}
            {branch.completionGroup ? <p>{item.label}. {item.question.content.text}</p>
              : <ol>{item.question.content.text.split(/\r?\n/).map((line, index) => <li key={`${item.question.id}:${index}`}>{line}</li>)}</ol>}
          </>}
          {item.question.type === 'matching' && matchingReview(item.question, review.selectionSeed)}
        </li>)}</ul>
        <details><summary>Review answer key for Q{branch.mainQuestionNumber}{branch.branchLabel ? `/${branch.branchLabel}` : ''}</summary>
          <ul className="structured-answer">{projected?.answerKey.Answers.filter((row) => row.Q === String(branch.mainQuestionNumber) && row.Part === (branch.branchLabel ?? '—'))
            .map((row) => <li key={row.Point}>{row.Point}: {row.Answer} — {row.Mark} marks</li>)}</ul>
        </details>
        {!finalized && <BranchMarkEditor key={`${branch.id}:${JSON.stringify(branch.pointMarks ?? branch.items.map((item) => item.question.id))}:${branch.marks}`}
          branch={branch} disabled={locked || loading} onApply={(total, distribution) => applyMarks(branch.id, total, distribution)}
          onPendingChange={(pending) => setPendingMarks((current) => pending
            ? current.includes(branch.id) ? current : [...current, branch.id]
            : current.filter((id) => id !== branch.id))} />}
      </section>)}
      <div className="recovery-actions">
        {!finalized && <button disabled={busy || loading || pendingMarks.length > 0} onClick={() => void save()}>{pendingSave ? 'Retry the same save' : 'Save complete-paper draft'}</button>}
        {!finalized && <button disabled={busy || dirty || !saved || pendingSave !== null || pendingMarks.length > 0} onClick={() => void finalize()}>Finalize reviewed paper</button>}
        {finalized && <button disabled={busy} onClick={() => void run(async () => {
          setDocuments(await renderFinalizedPhaseTenCandidate(saved))
          setMessage('Both documents are ready from the same finalized paper. Download each below.')
        })}>Prepare saved documents</button>}
      </div>
    </div>}
    {documents && <WordFilePreview documents={documents} />}
    {documents && <div className="recovery-actions">{(['exam', 'answerKey'] as const).map((kind) => <button key={kind} disabled={busy} onClick={() => void run(async () => {
      const result = await downloadPreparedDocument(documents[kind], requestBrowserDownload)
      if (result.status === 'failed') throw new Error(result.error)
      setMessage(`${kind === 'exam' ? 'Student exam' : 'Answer key'} download requested. Check your downloads.`)
    })}>Download {kind === 'exam' ? 'student exam' : 'answer key'}</button>)}</div>}
  </section>
}
