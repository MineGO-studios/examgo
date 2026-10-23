import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { prepareCataloguePromotion } from '../lib/cataloguePromotion'
import { importOutcomeTotals, importReviewMessage, reviewImportQuestion } from '../lib/importInterpretation'
import { describeImportedQuestion, readableImportIssue, readableImportSource } from '../lib/importReadable'
import { getPresetReviewer } from '../lib/presetCurationRepository'
import { commitStagedCatalogue, previewStagedCatalogue, type CatalogueCommitResult } from '../lib/catalogueImportRepository'
import {
  inspectCsvHeaders, parseExamgoInterchangeJson, parseLegacyQuestionCsv,
  parseMappedTeacherCsv, parsePapersCatalogueCsv, parseStoredTeacherCsvMapping, recognizeImportFile, suggestTeacherCsvMapping,
  type ImportFileFormat,
  type QuestionInterchangeV1, type TeacherCsvMapping, type StagedInterchangeQuestion,
} from '../lib/questionInterchange'
import {
  getStagedReviewPage, listStagedImportsForBank, stageQuestionInterchange,
  type StagedImportSummary, type StagedReviewPage,
} from '../lib/questionImportRepository'
import { teacherErrorMessage } from '../lib/safeErrorDetails'
import { questionTypeLabel } from '../lib/questionTypeLabels'
import { useI18n } from '../lib/i18n'
import { localizeAppMessage } from '../lib/appMessages'
import { formatDate } from '../lib/localize'
import { IMPORT_STRINGS } from './QuestionImportPreview.strings'
import { FilePicker } from './controls'

type Strings = (typeof IMPORT_STRINGS)['en']
/** Status lines resolve at render time so a language switch translates the current one. */
type Message = (s: Strings) => string

type Format = ImportFileFormat
const FORMAT_LABELS: Record<Format, (s: Strings) => string> = {
  legacy: (s) => s.formatLegacy, papers: (s) => s.formatPapers,
  examgo: (s) => s.formatExamgo, teacher: (s) => s.formatTeacher,
}
/** Readable questions the teacher answers for an unfamiliar or ambiguous CSV. */
const FIELDS: Array<{ key: keyof TeacherCsvMapping; label: (s: Strings) => string; required?: boolean }> = [
  { key: 'externalId', label: (s) => s.fieldId, required: true },
  { key: 'unit', label: (s) => s.fieldUnit, required: true },
  { key: 'prompt', label: (s) => s.fieldPrompt, required: true },
  { key: 'questionType', label: (s) => s.fieldType, required: true },
  { key: 'lesson', label: (s) => s.fieldLesson },
  { key: 'difficulty', label: (s) => s.fieldDifficulty },
  { key: 'answer', label: (s) => s.fieldAnswer },
  { key: 'correctOptionLabel', label: (s) => s.fieldCorrect },
  ...(['A', 'B', 'C', 'D', 'E', 'F'] as const).map((letter) => ({
    key: `option${letter}` as keyof TeacherCsvMapping, label: (s: Strings) => s.fieldOption(letter),
  })),
  { key: 'marks', label: (s) => s.fieldMarks },
  { key: 'groupContext', label: (s) => s.fieldGroup },
  { key: 'structuredContent', label: (s) => s.fieldContent },
  { key: 'structuredAnswer', label: (s) => s.fieldTypedAnswer },
]

const DIFFICULTY_AR: Record<string, string> = { easy: 'سهلة', medium: 'متوسطة', hard: 'صعبة' }

function errorMessage(error: unknown): string {
  return teacherErrorMessage(error, 'Import preview failed.')
}

function ReviewValues({ value }: { value: unknown }) {
  const s = IMPORT_STRINGS[useI18n().language]
  return <pre dir="ltr" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 300, overflow: 'auto' }}>
    {value === null || value === undefined ? s.notSupplied : typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
  </pre>
}

function QuestionInterpretation({ question, bankId, plan, diagnostics }: {
  question: StagedInterchangeQuestion; bankId: string;
  plan?: ReturnType<typeof prepareCataloguePromotion>; diagnostics: boolean
}) {
  const { language } = useI18n()
  const s = IMPORT_STRINGS[language]
  const tm = (text: string) => localizeAppMessage(language, text)
  const result = reviewImportQuestion(question, bankId, plan, language)
  const readable = describeImportedQuestion(question, result, language)
  return <details><summary><bdi>{question.catalogueId}</bdi> · {questionTypeLabel(question.type, language)} · {s.unit(String(question.displayUnit))} · {result.heldForReview ? s.needsReview : s.readyToConfirm}</summary>
    {readable.context.map((group, index) => <div key={index} className="import-context">
      <strong><bdi>{group.label}</bdi></strong>{group.instruction && <p dir="auto">{group.instruction}</p>}
      {group.passage && <blockquote dir="auto">{group.passage}</blockquote>}
    </div>)}
    <p><strong>{s.question}</strong> <bdi>{readable.prompt || s.textMissing}</bdi></p>
    {readable.details.length > 0 && <ul>{readable.details.map((line, index) => <li key={index} dir="auto">{line}</li>)}</ul>}
    <p><strong>{s.correctAnswer}</strong> {readable.answer === null ? s.answerUnreadable : <bdi>{readable.answer}</bdi>}</p>
    <p>{s.lessonLine(question.lesson ?? s.notSuppliedLower, language === 'ar' ? DIFFICULTY_AR[question.difficulty] ?? question.difficulty : question.difficulty, Boolean(question.difficultyProvisional))}
      {question.groupIds.length > 0 && !plan && s.linkedChecked}</p>
    {result.messages.length > 0 && <div role="note" aria-label={s.problemsFor(question.catalogueId)}>
      <strong>{s.problemsIn(result.messages.length, question.catalogueId)}</strong>
      <ul>{result.messages.map((message, index) => {
        // Adapter codes such as group-incomplete get the teacher explanation; conversion causes are already sentences.
        const readable = /^[a-z]+(-[a-z]+)+$/.test(message.cause) ? readableImportIssue(message.cause, language) : { problem: tm(message.cause), remedy: message.remedy }
        return <li key={index}>{readable.problem}<br /><em>{s.whatToDo}</em> {readable.remedy}</li>
      })}</ul>
    </div>}
    {diagnostics && <details><summary>{s.diagnosticsValues}</summary>
      <dl>{Object.entries(result.original).map(([field, value]) => <div key={field}>
        <dt>{field}</dt><dd><ReviewValues value={value} /></dd>
      </div>)}</dl>
      <h5>{s.mappedContent}</h5><ReviewValues value={result.content} />
      <h5>{s.mappedAnswer}</h5><ReviewValues value={result.answer} />
      <p>{s.groupIds(question.groupIds.join(', ') || s.none, question.groupCompleteness || s.completenessUnknown)}</p>
    </details>}
  </details>
}

function parse(text: string, format: Format, mapping: Partial<TeacherCsvMapping>,
  namespace: string, mappingConfirmed: boolean): QuestionInterchangeV1 {
  if (format === 'papers') return parsePapersCatalogueCsv(text)
  if (format === 'examgo') return parseExamgoInterchangeJson(text)
  if (format === 'legacy') return parseLegacyQuestionCsv(text, namespace)
  return parseMappedTeacherCsv(text, mapping as TeacherCsvMapping, mappingConfirmed, namespace)
}

export default function QuestionImportPreview({ bankId, bankName, onCommitted }: {
  bankId: string; bankName: string; onCommitted?: () => void
}) {
  const { language } = useI18n()
  const s = IMPORT_STRINGS[language]
  const tm = (text: string) => localizeAppMessage(language, text)
  const [format, setFormat] = useState<Format>('teacher')
  const [file, setFile] = useState<File | null>(null)
  const [text, setText] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [mapping, setMapping] = useState<Partial<TeacherCsvMapping>>({})
  const [example, setExample] = useState<Record<string, string>>({})
  const [needsChoice, setNeedsChoice] = useState<Array<keyof TeacherCsvMapping>>([])
  const [recognized, setRecognized] = useState<Format | null>(null)
  const [namespace, setNamespace] = useState('teacher-import')
  const [mappingConfirmed, setMappingConfirmed] = useState(false)
  const [document, setDocument] = useState<QuestionInterchangeV1 | null>(null)
  const [status, setStatusMessage] = useState<Message>(() => (t: Strings) => t.start)
  const say = (next: Message) => setStatusMessage(() => next)
  const setStatus = (text: string) => setStatusMessage(() => () => text)
  const [busy, setBusy] = useState(false)
  const [savedImports, setSavedImports] = useState<StagedImportSummary[]>([])
  const [savedError, setSavedError] = useState('')
  const [selectedImportId, setSelectedImportId] = useState('')
  const [reviewPage, setReviewPage] = useState(1)
  const [review, setReview] = useState<StagedReviewPage | null>(null)
  const [reviewError, setReviewError] = useState('')
  const [commitImportId, setCommitImportId] = useState('')
  const [commitReport, setCommitReport] = useState<CatalogueCommitResult | null>(null)
  const [previewPage, setPreviewPage] = useState(1)
  const [savedTotals, setSavedTotals] = useState<ReturnType<typeof importOutcomeTotals> | null>(null)
  // Raw values, internal paths, receipts and mapping detail are for developers and authorized reviewers only.
  const [diagnostics, setDiagnostics] = useState<'hidden' | 'checking' | 'shown' | 'restricted'>('hidden')
  const showDiagnostics = diagnostics === 'shown'
  const requestDiagnostics = (): void => {
    if (import.meta.env.DEV) { setDiagnostics('shown'); return }
    setDiagnostics('checking')
    void getPresetReviewer(bankId).then((reviewer) => setDiagnostics(reviewer ? 'shown' : 'restricted'))
      .catch(() => setDiagnostics('restricted'))
  }

  useEffect(() => {
    let active = true
    void listStagedImportsForBank(bankId).then((items) => {
      if (active) {
        // History is listed only; source rows open when the teacher chooses an import.
        setSavedImports(items); setSavedError('')
      }
    }).catch((error: unknown) => {
      if (active) setSavedError(errorMessage(error))
    })
    return () => { active = false }
  }, [bankId])

  useEffect(() => {
    if (!selectedImportId) return
    let active = true
    void getStagedReviewPage(selectedImportId, reviewPage).then((page) => {
      if (active) { setReview(page); setReviewError('') }
    }).catch((error: unknown) => {
      if (active) { setReview(null); setReviewError(errorMessage(error)) }
    })
    return () => { active = false }
  }, [selectedImportId, reviewPage])

  const applyFormat = (next: Format, loaded: string): void => {
    setFormat(next); setDocument(null); setMappingConfirmed(false)
    if (next === 'teacher') {
      const found = inspectCsvHeaders(loaded)
      setHeaders(found); setMapping(suggestTeacherCsvMapping(found))
    } else { setHeaders([]); setMapping({}) }
  }

  const changeFile = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const selected = event.currentTarget.files?.[0] ?? null
    setFile(selected)
    setDocument(null); setRecognized(null); setNeedsChoice([]); setExample({})
    setSavedTotals(null); setPreviewPage(1)
    setCommitImportId(''); setCommitReport(null)
    setMappingConfirmed(false)
    if (!selected) return
    if (selected.size > 32 * 1024 * 1024) {
      say((t) => t.tooLarge)
      setFile(null)
      return
    }
    try {
      const loaded = await selected.text()
      setText(loaded)
      const found = recognizeImportFile(selected.name, loaded)
      setRecognized(found.format); setExample(found.example); setNeedsChoice([...new Set([...found.missing, ...found.ambiguous])])
      applyFormat(found.format, loaded)
      const label = FORMAT_LABELS[found.format]
      say((t) => found.format === 'teacher' ? t.recognisedTeacher(label(t)) : t.recognisedOther(label(t)))
    } catch (error) {
      const reason = errorMessage(error)
      say((t) => t.unrecognised(tm(reason)))
      setFile(null)
    }
  }

  const preview = (): void => {
    setDocument(null)
    setSavedTotals(null); setPreviewPage(1)
    setCommitImportId(''); setCommitReport(null)
    try {
      if (!file) throw new Error('Choose a file first.')
      if (format === 'papers' && bankName !== 'Mid-Year Prototype') {
        throw new Error('Select Mid-Year Prototype as the Papers source bank.')
      }
      const parsed = parse(text, format, mapping, namespace, mappingConfirmed)
      setDocument(parsed)
      say((t) => t.read(parsed.questions.length))
    } catch (error) { const reason = errorMessage(error); say((t) => t.checkFailed(tm(reason))) }
  }

  const stage = async (): Promise<void> => {
    if (!file || !document) return
    setBusy(true)
    try {
      const result = await stageQuestionInterchange(document, new Uint8Array(await file.arrayBuffer()), bankId,
        (done, total) => say((t) => t.savingBatch(done, total)))
      setSavedImports(await listStagedImportsForBank(bankId))
      setSavedError('')
      setSelectedImportId(result.importId); setReviewPage(1)
      setCommitImportId(result.importId)
      const saved = await previewStagedCatalogue(result.importId, bankId)
      setSavedTotals(saved.totals)
      say((t) => t.staged(result.rows, result.inserted, result.unchanged))
    } catch (error) { setStatus(errorMessage(error)) }
    finally { setBusy(false) }
  }

  const reopenConversion = async (importId: string): Promise<void> => {
    setBusy(true); setCommitImportId(''); setDocument(null); setCommitReport(null)
    say((t) => t.loadingSaved)
    try {
      const saved = await previewStagedCatalogue(importId, bankId)
      setDocument(saved.document); setFile(null)
      setSavedTotals(saved.totals); setPreviewPage(1)
      setCommitImportId(importId); setSelectedImportId(importId); setReviewPage(1)
      say((t) => t.reopened(saved.totals.added, saved.totals.unchanged, saved.plan.reviewRows))
    } catch (error) { setStatus(errorMessage(error)) }
    finally { setBusy(false) }
  }

  const commit = async (): Promise<void> => {
    if (!commitImportId) return
    setBusy(true); setCommitReport(null)
    say((t) => t.checkingBeforeAdd)
    try {
      const report = await commitStagedCatalogue(commitImportId, bankId,
        (done, total) => say((t) => t.addingGroups(done, total)))
      setCommitReport(report)
      onCommitted?.()
      say((t) => t.committed(report.readyRows, report.inserted, report.unchanged, report.reviewRows))
    } catch (error) { setStatus(errorMessage(error)) }
    finally { setBusy(false) }
  }

  const downloadReport = (): void => {
    if (!commitReport) return
    const url = URL.createObjectURL(new Blob([JSON.stringify(commitReport, null, 2)], { type: 'application/json' }))
    const anchor = window.document.createElement('a')
    anchor.href = url; anchor.download = 'examgo-import-report.json'; anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const savePreset = (): void => {
    try {
      localStorage.setItem(`examgo-intake-mapping:${namespace}`, JSON.stringify(mapping))
      say((t) => t.choicesSaved(namespace))
    } catch { say((t) => t.choicesNotSaved) }
  }
  const loadPreset = (): void => {
    setMappingConfirmed(false)
    setDocument(null)
    try {
      const saved = localStorage.getItem(`examgo-intake-mapping:${namespace}`)
      if (!saved) throw new Error('No column choices are saved for this source name. Choose each column below first.')
      const loaded = parseStoredTeacherCsvMapping(saved, headers)
      setMapping(loaded)
      say((t) => t.choicesLoaded)
    } catch (error) { setStatus(errorMessage(error)) }
  }

  const counts = document ? {
    reviewIssues: document.questions.filter((question) => question.issues.length > 0).length,
    grouped: document.questions.filter((question) => question.groupIds.length > 0).length,
  } : null
  const conversion = useMemo(() => {
    if (!document) return null
    try {
      const plan = prepareCataloguePromotion(document.questions, bankId)
      const reasons = new Map<string, number>()
      for (const component of plan.components) {
        if (component.status === 'review') for (const issue of component.issues) {
          const reason = importReviewMessage(issue.message).cause
          reasons.set(reason, (reasons.get(reason) ?? 0) + 1)
        }
      }
      return { plan, error: '', reasons: [...reasons].sort((a, b) => b[1] - a[1]) }
    } catch (error) { return { plan: null, error: errorMessage(error), reasons: [] } }
  }, [document, bankId])
  const totals = commitReport?.totals ?? savedTotals ?? (conversion?.plan
    ? importOutcomeTotals(conversion.plan.readyRows, conversion.plan.reviewRows) : null)

  return <section className="csv-import question-file-import" aria-labelledby="staged-import-title">
    <div>
      <h3 id="staged-import-title">{s.title}</h3>
      <p className="field-help">{s.lede}</p>
    </div>
    <FilePicker label={s.file} accept=".csv,text/csv,.json,application/json"
      disabled={busy} onChange={(event) => void changeFile(event)} />
    {file && recognized && <label>{s.recognisedTemplate}
      <select value={format} disabled={busy} onChange={(event) => {
        try { applyFormat(event.target.value as Format, text); say((t) => t.templateChanged) }
        catch (error) { setStatus(errorMessage(error)) }
        setCommitImportId(''); setCommitReport(null)
      }}>
        {(Object.keys(FORMAT_LABELS) as Format[]).map((value) => <option key={value} value={value}>
          {FORMAT_LABELS[value](s)}{value === recognized ? s.recognisedSuffix : ''}</option>)}
      </select>
    </label>}
    {file && format !== 'papers' && format !== 'examgo' && <label>{s.sourceName}
      <input value={namespace} maxLength={100} disabled={busy} onChange={(event) => {
        setNamespace(event.target.value); setDocument(null); setMappingConfirmed(false)
      }} />
    </label>}
    {format === 'teacher' && headers.length > 0 && <fieldset disabled={busy}>
      <legend>{s.whichColumn}</legend>
      <p>{s.requiredNote}</p>
      <div className="form-grid">
        {FIELDS.map(({ key, label, required }) => <label key={key}>{label(s)}{required ? ' *' : ''}
          {needsChoice.includes(key) && !mapping[key] && <strong>{s.needsChoice}</strong>}
          <select value={mapping[key] ?? ''} onChange={(event) => {
            setMapping((current) => ({ ...current, [key]: event.target.value || undefined }))
            setMappingConfirmed(false); setDocument(null)
          }}>
            <option value="">{s.notInFile}</option>
            {headers.map((header) => <option key={header} value={header}>{header}</option>)}
          </select>
          {mapping[key] && <small>{s.example(example[mapping[key]!] || s.emptyFirstRow)}</small>}
        </label>)}
      </div>
      <button type="button" className="button-secondary" onClick={savePreset}>{s.saveChoices}</button>{' '}
      <button type="button" className="button-secondary" onClick={loadPreset}>{s.loadChoices}</button>
      <label className="checkbox-field"><input type="checkbox" checked={mappingConfirmed}
        onChange={(event) => { setMappingConfirmed(event.target.checked); setDocument(null) }} />
        {s.confirmColumns}</label>
    </fieldset>}
    <button type="button" disabled={!file || busy || (format === 'teacher' && !mappingConfirmed)} onClick={preview}>
      {s.check}
    </button>
    {document && counts && <div>
      <p>{s.readSummary(document.questions.length, counts.grouped, counts.reviewIssues)}</p>
      {conversion && <>
        {conversion.error && <p role="alert">{tm(conversion.error)}</p>}
        {conversion.plan && <p>{s.passSummary(conversion.plan.readyRows, conversion.plan.reviewRows)}</p>}
        {conversion.reasons.length > 0 && <details><summary>{s.whyReview}</summary>
          <ul>{conversion.reasons.slice(0, 5).map(([reason, count]) =>
            <li key={reason}>{count}: {tm(reason)}</li>)}</ul>
        </details>}
      </>}
      {totals && <div>
        <h4>{commitReport ? s.finalTotals : s.plannedTotals}</h4>
        <p>{s.totalsLine(totals)}</p>
        <p>{s.totalsNote}{!commitReport && s.plannedNote}</p>
        {commitImportId && <p>{s.retryNote}</p>}
      </div>}
      <h4>{s.check}</h4>
      <p>{s.previewPage(previewPage, Math.ceil(document.questions.length / 20))}</p>
      <div className="recovery-actions">
        <button type="button" disabled={busy || previewPage === 1} onClick={() => setPreviewPage((page) => page - 1)}>{s.previousRows}</button>
        <button type="button" disabled={busy || previewPage * 20 >= document.questions.length} onClick={() => setPreviewPage((page) => page + 1)}>{s.nextRows}</button>
      </div>
      <ol start={(previewPage - 1) * 20 + 1}>{document.questions.slice((previewPage - 1) * 20, previewPage * 20).map((question) => <li key={question.catalogueId}>
        <QuestionInterpretation question={question} bankId={bankId} plan={conversion?.plan ?? undefined} diagnostics={showDiagnostics} />
      </li>)}</ol>
      <button type="button" disabled={busy || !file} onClick={() => void stage()}>
        {s.savePrivately}
      </button>
      {commitImportId && conversion?.plan && <div className="recovery-actions">
        <p>{s.commitNote}</p>
        <button type="button" disabled={busy || conversion.plan.readyRows === 0} onClick={() => void commit()}>
          {s.confirmReady(conversion.plan.readyRows)}
        </button>
      </div>}
      {commitReport && showDiagnostics && <button type="button" className="button-secondary" onClick={downloadReport}>{s.downloadReport}</button>}
    </div>}
    <p role="status" aria-live="polite">{tm(status(s))}</p>
    <div className="recovery-actions">
      {diagnostics === 'hidden' && <button type="button" className="button-quiet diagnostics-link" onClick={requestDiagnostics}>{s.showDiagnostics}</button>}
      {diagnostics === 'checking' && <p role="status">{s.checkingAccess}</p>}
      {diagnostics === 'restricted' && <p role="status">{s.restricted}</p>}
      {showDiagnostics && <button type="button" className="button-secondary" onClick={() => setDiagnostics('hidden')}>{s.hideDiagnostics}</button>}
    </div>
    <h4>{s.pastImports}</h4>
    {savedError && <p role="alert">{tm(savedError)}</p>}
    {!savedError && savedImports.length === 0 && <p className="field-help">{s.noneYet}</p>}
    {savedImports.length > 0 && <ul>{savedImports.map((item) => <li key={item.id}>
      <strong><bdi>{readableImportSource(item.sourceNamespace, language)}</bdi></strong> · {s.importedLine(formatDate(language, item.createdAt), item.stagedRows, item.expectedRows)}
      {item.stagedRows === item.expectedRows ? '' : s.incomplete}
      {showDiagnostics && <small>{s.sourcePath(item.sourceNamespace, item.id)}</small>}
      {' '}<button type="button" className="button-secondary" onClick={() => {
        setSelectedImportId(item.id); setReviewPage(1); setReview(null)
      }}>{s.reviewRows}</button>
      {' '}<button type="button" className="button-secondary" disabled={busy || item.stagedRows !== item.expectedRows}
        onClick={() => void reopenConversion(item.id)}>{s.checkSaved}</button>
    </li>)}</ul>}
    {selectedImportId && <section aria-labelledby="saved-intake-rows-title">
      <h4 id="saved-intake-rows-title">{s.rowsTitle}</h4>
      <p>{s.rowsLede}</p>
      {reviewError && <p role="alert">{tm(reviewError)}</p>}
      {review && <>
        <p>{s.rowsPage(review.page, Math.max(1, Math.ceil(review.total / review.pageSize)), review.total)}</p>
        <div className="recovery-actions">
          <button type="button" className="button-secondary" disabled={reviewPage <= 1}
            onClick={() => setReviewPage((current) => current - 1)}>{s.previous20}</button>
          <button type="button" className="button-secondary"
            disabled={reviewPage * review.pageSize >= review.total}
            onClick={() => setReviewPage((current) => current + 1)}>{s.next20}</button>
        </div>
        <ol start={(review.page - 1) * review.pageSize + 1}>{review.rows.map((row) => <li key={row.catalogueId}>
          <strong><bdi>{row.catalogueId}</bdi></strong> · {questionTypeLabel(row.type, language)} · {s.unit(String(row.displayUnit))}
          {row.unitTags.length > 1 && s.tags(row.unitTags.join(', '))}
          {row.lesson && s.lessonTag(row.lesson)}{s.marksLater}
          <p dir="auto">{row.prompt}</p>
          {row.issues.length > 0 && <ul aria-label={s.problemsFor(row.catalogueId)}>{row.issues.map((issue) => {
            const readable = readableImportIssue(issue, language)
            return <li key={issue}>{readable.problem} <em>{s.whatToDo}</em> {readable.remedy}</li>
          })}</ul>}
          {showDiagnostics && <details><summary>{s.diagnosticsMapping}</summary>
            <h5>{s.originalHeading}</h5><ReviewValues value={row.original} />
            <h5>{s.normalizedHeading}</h5><ReviewValues value={row.normalized} />
            <p>{s.compareNote}</p>
          </details>}
        </li>)}</ol>
      </>}
    </section>}
  </section>
}
