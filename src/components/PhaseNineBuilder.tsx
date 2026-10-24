import { ChoiceChips, FormGroup, ToggleChipGroup } from './controls'
import { PaperStamp } from './CouponProgress'
import PaperProgress from './PaperProgress'
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
import WordFilePreview from './WordFilePreview'
import type { PageTarget } from '../lib/pageTarget'
import { teacherErrorMessage } from '../lib/safeErrorDetails'
import { useI18n } from '../lib/i18n'
import { localizeAppMessage } from '../lib/appMessages'
import { IRAQI_BUILDER_STRINGS } from './PhaseNineBuilder.strings'

type Strings = (typeof IRAQI_BUILDER_STRINGS)['en']
/** Messages resolve at render time so a language switch translates the current one. */
type Message = (s: Strings) => string

interface Props {
  ownerId: string
  reopened: SavedPhaseNineWorkflow | null
  onSavedWork: () => void
  onAuthorQuestions: () => void
}

export default function PhaseNineBuilder({ ownerId, reopened, onSavedWork, onAuthorQuestions }: Props) {
  const { language } = useI18n()
  const s = IRAQI_BUILDER_STRINGS[language]
  const tm = (text: string) => localizeAppMessage(language, text)
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
  const [message, setMessage] = useState<Message>(() => (t: Strings) => t.start)
  const say = (next: Message) => setMessage(() => next)
  const sayText = (text: string) => setMessage(() => () => text)
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
      if (active) { setFailed(true); sayText(teacherErrorMessage(error, 'Unable to load question banks.')) }
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
      if (active) { setFailed(true); sayText(teacherErrorMessage(error, 'Unable to load questions. Reopen the bank and try again.')) }
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
    catch (error) { setFailed(true); sayText(teacherErrorMessage(error, 'The operation could not be confirmed. Reopen saved work before continuing.')) }
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
    say((t) => t.saved)
  })
  const finalize = () => run(async () => {
    if (!saved || dirty) throw new Error('Save the current reviewed draft before finalizing.')
    const result = await finalizePhaseNineExam(saved, finalizationRequest.current)
    setSaved(result)
    say((t) => t.finalized)
  })

  return <section className="builder-page" aria-labelledby="structured-builder-title">
    <h2 id="structured-builder-title">{s.title}</h2>
    <PaperProgress current={finalized ? 'download' : review ? 'review' : 'setup'} />
    {finalized && <PaperStamp label="Finalized" />}
    <p>{s.lede} {examOwnedMarks ? s.shareMarks(review?.snapshot.totalMarks ?? 60) : s.fixedMarks} {s.partOfPaper}</p>
    <p role={failed ? 'alert' : 'status'} aria-live="polite" className="field-help">{tm(message(s))}</p>
    <fieldset disabled={locked} className="plain-fields">
      <legend className="visually-hidden">{s.paperSettings}</legend>
      <FormGroup title={s.questions}>
        <label className="text-field">{s.primaryBank}<select value={bankId} onChange={(e) => { setBankIds([e.target.value, ...bankIds.slice(1).filter((id) => id !== e.target.value)]); changed(true) }}>
          {banks.map((bank) => <option key={bank.id} value={bank.id}>{bank.name}</option>)}
          {finalized && <option value={bankId}>{s.savedBank}</option>}
        </select></label>
        {examOwnedMarks && !finalized && banks.length > 1 && <ToggleChipGroup legend={s.alsoUse} hint={s.alsoUseHint}
          items={banks.filter((bank) => bank.id !== bankId).map((bank) => ({ key: bank.id, label: bank.name, checked: bankIds.includes(bank.id),
            disabled: bankIds.length >= 20 && !bankIds.includes(bank.id),
            onToggle: () => { setBankIds(bankIds.includes(bank.id) ? bankIds.filter((id) => id !== bank.id) : [...bankIds, bank.id]); changed(true) } }))} />}
        <label className="text-field">{s.lesson}<input maxLength={40} value={filters.lesson} placeholder={s.allLessons} onChange={(e) => { setFilters({ ...filters, lesson: e.target.value }); changed(true) }} /></label>
        <ChoiceChips legend={s.difficulty} value={filters.difficulty}
          options={[{ value: '', label: s.any }, { value: 'easy', label: s.easy }, { value: 'medium', label: s.medium }, { value: 'hard', label: s.hard }] as { value: typeof filters.difficulty; label: string }[]}
          onChange={(difficulty) => { setFilters({ ...filters, difficulty }); changed(true) }} />
      </FormGroup>
      <FormGroup title={s.details}>
        {(['schoolName', 'examTitle', 'teacherName'] as const).map((key) => <label key={key} className="text-field">
          {{ schoolName: s.school, examTitle: s.testTitle, teacherName: s.teacher }[key]}
          <input maxLength={80} value={settings[key] ?? ''} onChange={(e) => { setSettings({ ...settings, [key]: e.target.value }); changed() }} />
        </label>)}
      </FormGroup>
      <FormGroup title={s.pages}>
        <ChoiceChips legend={s.questionPages} value={pageTarget}
          options={([1, 2, 3, 4, 5] as PageTarget[]).map((n) => ({ value: n, label: String(n) }))}
          onChange={(target) => { setPageTarget(target); changed() }}
          hint={s.pagesHint} />
      </FormGroup>
      <details className="more-options"><summary>{s.moreOptions}</summary>
        <label className="text-field">{s.selectionNumber}<input type="number" min={0} max={4294967295} value={settings.selectionSeed} onChange={(e) => { setSettings({ ...settings, selectionSeed: Number(e.target.value) }); changed(true) }} />
          <small>{s.selectionHint}</small></label>
      </details>
    </fieldset>
    <div className="recovery-actions builder-actions">
      {!finalized && <button disabled={locked || loading || !bankId} onClick={() => void run(async () => {
        setReview(examOwnedMarks ? selectPhaseNineMarkedPaper(pool, settings.selectionSeed) : selectPhaseNinePaper(pool, settings.selectionSeed)); changed(); say((t) => t.reviewReady)
      })}>{loading ? s.loadingQuestions : s.preview}</button>}
      <button className="button-secondary" disabled={busy} onClick={onAuthorQuestions}>{s.author}</button>
      <button className="button-secondary" disabled={busy} onClick={onSavedWork}>{s.myPapers}</button>
    </div>
    {review && <div>
      {review.snapshot.structure.branches.map((branch) => <section key={branch.id} className="structured-branch">
        <h3><bdi>Q{branch.mainQuestionNumber}{branch.branchLabel ? `/${branch.branchLabel}` : ''}</bdi> — {s.branchMarks(branch.marks)}</h3>
        <p dir="auto">{branch.instruction}</p>
        <ol>{branch.items.map((item) => <li key={item.question.id}>
          <p><strong>{item.visibleLabel}.</strong> {item.question.prompt}</p>
          <p className="structured-question-content">{item.question.type === 'completion' ? item.question.content.text : item.question.type === 'odd-word' ? item.question.content.words.join(' / ') : ''}</p>
          <details><summary>{s.reviewAnswer}</summary><ul className="structured-answer">{answerRows.filter((row) => row.Q === String(branch.mainQuestionNumber) && row.Part === (branch.branchLabel ?? '—') && (branch.kind === 'completion' || row.Point === item.visibleLabel)).map((row) => <li key={row.Point}>{row.Point}: {row.Answer} — {row.Mark} marks</li>)}</ul></details>
          {!finalized && <div className="recovery-actions">
            <button disabled={locked} aria-pressed={review.lockedQuestionIds.includes(item.question.id)} onClick={() => { setReview(togglePhaseNineQuestionLock(review, item.question.id)); changed() }}>{review.lockedQuestionIds.includes(item.question.id) ? s.unlock(item.visibleLabel) : s.lock(item.visibleLabel)}</button>
            <button disabled={locked || loading || review.lockedQuestionIds.includes(item.question.id)} onClick={() => void run(async () => {
              const replaced = replacePhaseNineQuestion(review, item.question.id, pool)
              parsePhaseNineTeacherIntent({ ...intent(), review: replaced })
              setReview(replaced); changed(); say((t) => t.replacementReady)
            })}>{s.replace(item.visibleLabel)}</button>
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
        {!finalized && <button disabled={busy || pendingMarks.length > 0 || loading} onClick={() => void save()}>{pendingSave ? s.retrySave : s.saveDraft}</button>}
        {!finalized && <button disabled={busy || dirty || !saved || pendingSave !== null || pendingMarks.length > 0} onClick={() => void finalize()}>{s.finalize}</button>}
        {finalized && <button disabled={busy} onClick={() => void run(async () => { setDocuments(await renderFinalizedPhaseNine(saved)); say((t) => t.documentsReady) })}>{s.prepare}</button>}
        {finalized && <button disabled={busy} className="button-secondary" onClick={() => {
          setSaved(null); setExamOwnedMarks(true); changed(true); say((t) => t.editingCopy)
        }}>{s.newCopy}</button>}
      </div>
    </div>}
    {documents && <WordFilePreview documents={documents} />}
    {documents && <div className="recovery-actions">{(['exam', 'answerKey'] as const).map((kind) => <button key={kind} disabled={busy} onClick={() => void run(async () => {
      const result = await downloadPreparedDocument(documents[kind], requestBrowserDownload)
      if (result.status === 'failed') throw new Error(result.error)
      say((t) => kind === 'exam' ? t.examRequested : t.keyRequested)
    })}>{kind === 'exam' ? s.downloadExam : s.downloadKey}</button>)}</div>}
  </section>
}
