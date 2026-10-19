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

type Format = ImportFileFormat
const FORMAT_LABELS: Record<Format, string> = {
  legacy: 'ExamGO multiple-choice CSV (legacy template)', papers: 'Papers master catalogue CSV',
  examgo: 'ExamGO versioned question file (JSON)', teacher: 'Other CSV: confirm which column holds each field',
}
/** Readable questions the teacher answers for an unfamiliar or ambiguous CSV. */
const FIELDS: Array<{ key: keyof TeacherCsvMapping; label: string; required?: boolean }> = [
  { key: 'externalId', label: 'Which column contains each question ID?', required: true },
  { key: 'unit', label: 'Which column contains the unit (or unit tags such as 1,2)?', required: true },
  { key: 'prompt', label: 'Which column contains the question text?', required: true },
  { key: 'questionType', label: 'Which column contains the question type?', required: true },
  { key: 'lesson', label: 'Which column contains the lesson?' },
  { key: 'difficulty', label: 'Which column contains the difficulty?' },
  { key: 'answer', label: 'Which column contains the answer?' },
  { key: 'correctOptionLabel', label: 'Which column contains the correct option letter?' },
  ...(['A', 'B', 'C', 'D', 'E', 'F'] as const).map((letter) => ({
    key: `option${letter}` as keyof TeacherCsvMapping, label: `Which column contains option ${letter}?`,
  })),
  { key: 'marks', label: 'Which column contains source marks? (kept as evidence; exam marks are set when composing)' },
  { key: 'groupContext', label: 'Which column contains linked-group details (JSON)?' },
  { key: 'structuredContent', label: 'Which column contains typed question content (JSON)?' },
  { key: 'structuredAnswer', label: 'Which column contains the typed answer (JSON)?' },
]

function errorMessage(error: unknown): string {
  return teacherErrorMessage(error, 'Import preview failed.')
}

function ReviewValues({ value }: { value: unknown }) {
  return <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 300, overflow: 'auto' }}>
    {value === null || value === undefined ? 'Not supplied' : typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
  </pre>
}

const TYPE_LABELS: Record<string, string> = {
  'multiple-choice': 'Multiple choice', binary: 'True/False or Yes/No', 'short-answer': 'Short answer', completion: 'Word-bank completion',
  'odd-word': 'Odd word', matching: 'Matching', 'word-relationship': 'Word relationship', rewrite: 'Rewrite', 'extended-writing': 'Writing',
}

function QuestionInterpretation({ question, bankId, plan, diagnostics }: {
  question: StagedInterchangeQuestion; bankId: string;
  plan?: ReturnType<typeof prepareCataloguePromotion>; diagnostics: boolean
}) {
  const result = reviewImportQuestion(question, bankId, plan)
  const readable = describeImportedQuestion(question, result)
  return <details><summary>{question.catalogueId} · {TYPE_LABELS[question.type] ?? question.type} · Unit {question.displayUnit} · {result.heldForReview ? 'Needs review' : 'Ready to confirm'}</summary>
    {readable.context.map((group, index) => <div key={index} className="import-context">
      <strong>{group.label}</strong>{group.instruction && <p dir="auto">{group.instruction}</p>}
      {group.passage && <blockquote dir="auto">{group.passage}</blockquote>}
    </div>)}
    <p dir="auto"><strong>Question:</strong> {readable.prompt || 'Question text is missing.'}</p>
    {readable.details.length > 0 && <ul>{readable.details.map((line, index) => <li key={index} dir="auto">{line}</li>)}</ul>}
    <p dir="auto"><strong>Correct answer:</strong> {readable.answer ?? 'The answer could not be read and needs review before this question can be added.'}</p>
    <p>Lesson {question.lesson ?? 'not supplied'} · {question.difficulty}{question.difficultyProvisional ? ' (provisional)' : ''} difficulty · exam marks are assigned when composing.
      {question.groupIds.length > 0 && !plan && ' Linked questions are checked together; use Check saved questions for the complete group check.'}</p>
    {result.messages.length > 0 && <div role="note" aria-label={`Problems for ${question.catalogueId}`}>
      <strong>{result.messages.length === 1 ? 'Problem' : 'Problems'} in {question.catalogueId}</strong>
      <ul>{result.messages.map((message, index) => {
        // Adapter codes such as group-incomplete get the teacher explanation; conversion causes are already sentences.
        const readable = /^[a-z]+(-[a-z]+)+$/.test(message.cause) ? readableImportIssue(message.cause) : { problem: message.cause, remedy: message.remedy }
        return <li key={index}>{readable.problem}<br /><em>What to do:</em> {readable.remedy}</li>
      })}</ul>
    </div>}
    {diagnostics && <details><summary>Diagnostics: original and mapped values</summary>
      <dl>{Object.entries(result.original).map(([field, value]) => <div key={field}>
        <dt>{field}</dt><dd><ReviewValues value={value} /></dd>
      </div>)}</dl>
      <h5>Mapped content</h5><ReviewValues value={result.content} />
      <h5>Mapped answer</h5><ReviewValues value={result.answer} />
      <p>Group IDs: {question.groupIds.join(', ') || 'None'} · {question.groupCompleteness || 'completeness not specified'}.</p>
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
  const [status, setStatus] = useState('Choose a question file. ExamGO recognises its template before anything is saved.')
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
      setStatus('File exceeds the 32 MiB intake limit.')
      setFile(null)
      return
    }
    try {
      const loaded = await selected.text()
      setText(loaded)
      const found = recognizeImportFile(selected.name, loaded)
      setRecognized(found.format); setExample(found.example); setNeedsChoice([...new Set([...found.missing, ...found.ambiguous])])
      applyFormat(found.format, loaded)
      setStatus(found.format === 'teacher'
        ? `Recognised: ${found.label}. Answer the column questions below, then confirm.`
        : `Recognised: ${found.label}. Preview its questions before anything is saved.`)
    } catch (error) {
      setStatus(`This file could not be recognised as a supported question file: ${errorMessage(error)} Nothing was saved.`)
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
      setStatus(`${parsed.questions.length} questions read from the file. Check the questions and problems before saving for review.`)
    } catch (error) { setStatus(`The file could not be checked: ${errorMessage(error)} Correct the file or column choices and check again. Nothing was saved.`) }
  }

  const stage = async (): Promise<void> => {
    if (!file || !document) return
    setBusy(true)
    try {
      const result = await stageQuestionInterchange(document, new Uint8Array(await file.arrayBuffer()), bankId,
        (done, total) => setStatus(`Saving private intake batch ${done}/${total}…`))
      setSavedImports(await listStagedImportsForBank(bankId))
      setSavedError('')
      setSelectedImportId(result.importId); setReviewPage(1)
      setCommitImportId(result.importId)
      const saved = await previewStagedCatalogue(result.importId, bankId)
      setSavedTotals(saved.totals)
      setStatus(`${result.rows} rows saved privately for review; ${result.inserted} new, ${result.unchanged} already saved. Confirm the ready questions below before using them in papers.`)
    } catch (error) { setStatus(errorMessage(error)) }
    finally { setBusy(false) }
  }

  const reopenConversion = async (importId: string): Promise<void> => {
    setBusy(true); setCommitImportId(''); setDocument(null); setCommitReport(null)
    setStatus('Loading saved questions and checking linked passages and exercises…')
    try {
      const saved = await previewStagedCatalogue(importId, bankId)
      setDocument(saved.document); setFile(null)
      setSavedTotals(saved.totals); setPreviewPage(1)
      setCommitImportId(importId); setSelectedImportId(importId); setReviewPage(1)
      setStatus(`${saved.totals.added} questions can be added; ${saved.totals.unchanged} are already saved. ${saved.plan.reviewRows} remain saved for review.`)
    } catch (error) { setStatus(errorMessage(error)) }
    finally { setBusy(false) }
  }

  const commit = async (): Promise<void> => {
    if (!commitImportId) return
    setBusy(true); setCommitReport(null)
    setStatus('Checking saved questions before adding them to the bank…')
    try {
      const report = await commitStagedCatalogue(commitImportId, bankId,
        (done, total) => setStatus(`Adding question groups ${done}/${total}…`))
      setCommitReport(report)
      onCommitted?.()
      setStatus(`${report.readyRows} bank questions confirmed: ${report.inserted} added, ${report.unchanged} already saved. ${report.reviewRows} source rows remain for review. Assign exam marks when composing a paper.`)
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
      setStatus(`Column choices saved on this device for ${namespace}.`)
    } catch { setStatus('Could not save column choices on this device. Check browser storage access and try again.') }
  }
  const loadPreset = (): void => {
    setMappingConfirmed(false)
    setDocument(null)
    try {
      const saved = localStorage.getItem(`examgo-intake-mapping:${namespace}`)
      if (!saved) throw new Error('No column choices are saved for this source name. Choose each column below first.')
      const loaded = parseStoredTeacherCsvMapping(saved, headers)
      setMapping(loaded)
      setStatus('Saved column choices loaded. Check the examples and confirm them for this file.')
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
      <h3 id="staged-import-title">Import file</h3>
      <p>Supported: ExamGO multiple-choice CSV, the Papers master catalogue CSV, ExamGO versioned JSON, and other CSV files once you confirm which column holds each field. Nothing is added to the bank until you preview, save for review and confirm. Exam marks are assigned when composing a paper.</p>
    </div>
    <label>Question file
      <input type="file" accept=".csv,text/csv,.json,application/json"
        disabled={busy} onChange={(event) => void changeFile(event)} />
    </label>
    {file && recognized && <label>Recognised template (change only if this is wrong)
      <select value={format} disabled={busy} onChange={(event) => {
        try { applyFormat(event.target.value as Format, text); setStatus('Template changed. Preview again before saving.') }
        catch (error) { setStatus(errorMessage(error)) }
        setCommitImportId(''); setCommitReport(null)
      }}>
        {(Object.keys(FORMAT_LABELS) as Format[]).map((value) => <option key={value} value={value}>
          {FORMAT_LABELS[value]}{value === recognized ? ' (recognised)' : ''}</option>)}
      </select>
    </label>}
    {file && format !== 'papers' && format !== 'examgo' && <label>Source name (identifies this file for safe retries)
      <input value={namespace} maxLength={100} disabled={busy} onChange={(event) => {
        setNamespace(event.target.value); setDocument(null); setMappingConfirmed(false)
      }} />
    </label>}
    {format === 'teacher' && headers.length > 0 && <fieldset disabled={busy}>
      <legend>Which column contains each field?</legend>
      <p>Required questions are marked *. Check each example value from the first row.</p>
      <div className="form-grid">
        {FIELDS.map(({ key, label, required }) => <label key={key}>{label}{required ? ' *' : ''}
          {needsChoice.includes(key) && !mapping[key] && <strong> · Needs your choice</strong>}
          <select value={mapping[key] ?? ''} onChange={(event) => {
            setMapping((current) => ({ ...current, [key]: event.target.value || undefined }))
            setMappingConfirmed(false); setDocument(null)
          }}>
            <option value="">Not in this file</option>
            {headers.map((header) => <option key={header} value={header}>{header}</option>)}
          </select>
          {mapping[key] && <small>Example: {example[mapping[key]!] || '(empty in the first row)'}</small>}
        </label>)}
      </div>
      <button type="button" className="button-secondary" onClick={savePreset}>Save column choices on this device</button>{' '}
      <button type="button" className="button-secondary" onClick={loadPreset}>Load saved column choices</button>
      <label className="checkbox-field"><input type="checkbox" checked={mappingConfirmed}
        onChange={(event) => { setMappingConfirmed(event.target.checked); setDocument(null) }} />
        I checked these columns and examples for this file</label>
    </fieldset>}
    <button type="button" disabled={!file || busy || (format === 'teacher' && !mappingConfirmed)} onClick={preview}>
      Check imported questions
    </button>
    {document && counts && <div>
      <p>{document.questions.length} questions read · {counts.grouped} linked to passages or exercises · {counts.reviewIssues} need attention. Check the details and totals below.</p>
      {conversion && <>
        {conversion.error && <p role="alert">{conversion.error}</p>}
        {conversion.plan && <p>{conversion.plan.readyRows} questions pass the supported question and linked-exercise checks;
          {' '}{conversion.plan.reviewRows} remain for review with their linked questions.
          {' '}Nothing is added to the bank until you save for review and confirm the ready questions.</p>}
        {conversion.reasons.length > 0 && <details><summary>Why questions need review</summary>
          <ul>{conversion.reasons.slice(0, 5).map(([reason, count]) =>
            <li key={reason}>{count}: {reason}</li>)}</ul>
        </details>}
      </>}
      {totals && <div>
        <h4>{commitReport ? 'Final import totals' : 'Planned import totals'}</h4>
        <p>Added {totals.added} · Updated {totals.updated} · Unchanged {totals.unchanged} · Duplicate {totals.duplicate} · Rejected {totals.rejected} · Review {totals.review}</p>
        <p>This import does not overwrite existing source questions. Exact saved retries count as unchanged.
          {' '}Repeated question IDs inside a file prevent saving it. Conflicting saved questions stop the affected passage or exercise before it is added.
          {!commitReport && ' Planned totals may change after checking the saved questions and complete linked exercises.'}</p>
        {commitImportId && <p>Retry uses your preserved file and confirmed column choices. Already added questions are not added twice. Unresolved questions stay saved for review.</p>}
      </div>}
      <h4>Check imported questions</h4>
      <p>Page {previewPage} of {Math.ceil(document.questions.length / 20)} · review every row before adding questions.</p>
      <div className="recovery-actions">
        <button type="button" disabled={busy || previewPage === 1} onClick={() => setPreviewPage((page) => page - 1)}>Previous preview rows</button>
        <button type="button" disabled={busy || previewPage * 20 >= document.questions.length} onClick={() => setPreviewPage((page) => page + 1)}>Next preview rows</button>
      </div>
      <ol start={(previewPage - 1) * 20 + 1}>{document.questions.slice((previewPage - 1) * 20, previewPage * 20).map((question) => <li key={question.catalogueId}>
        <QuestionInterpretation question={question} bankId={bankId} plan={conversion?.plan ?? undefined} diagnostics={showDiagnostics} />
      </li>)}</ol>
      <button type="button" disabled={busy || !file} onClick={() => void stage()}>
        Save privately for review
      </button>
      {commitImportId && conversion?.plan && <div className="recovery-actions">
        <p>Adding these questions keeps one shared identity in this bank and its highest-tag Unit collection. Review records remain saved. Questions stay private.</p>
        <button type="button" disabled={busy || conversion.plan.readyRows === 0} onClick={() => void commit()}>
          Confirm {conversion.plan.readyRows} ready questions in bank
        </button>
      </div>}
      {commitReport && showDiagnostics && <button type="button" className="button-secondary" onClick={downloadReport}>Download import report (diagnostics)</button>}
    </div>}
    <p role="status" aria-live="polite">{status}</p>
    <div className="recovery-actions">
      {diagnostics === 'hidden' && <button type="button" className="button-secondary" onClick={requestDiagnostics}>Show diagnostics (developers and authorized reviewers)</button>}
      {diagnostics === 'checking' && <p role="status">Checking reviewer access…</p>}
      {diagnostics === 'restricted' && <p role="status">Diagnostics are restricted to developers and authorized MineGO reviewers. Original source values are preserved for their review.</p>}
      {showDiagnostics && <button type="button" className="button-secondary" onClick={() => setDiagnostics('hidden')}>Hide diagnostics</button>}
    </div>
    <h4>Import history for this bank</h4>
    {savedError && <p role="alert">{savedError}</p>}
    {!savedError && savedImports.length === 0 && <p>No saved imports yet.</p>}
    {savedImports.length > 0 && <ul>{savedImports.map((item) => <li key={item.id}>
      <strong>{readableImportSource(item.sourceNamespace)}</strong> · imported {new Date(item.createdAt).toLocaleDateString()} · {item.stagedRows} of {item.expectedRows} rows saved for review
      {item.stagedRows === item.expectedRows ? '' : ' · Incomplete: choose the same file again to finish saving it'}
      {showDiagnostics && <small> · Source path: {item.sourceNamespace} · Import ID: {item.id}</small>}
      {' '}<button type="button" className="button-secondary" onClick={() => {
        setSelectedImportId(item.id); setReviewPage(1); setReview(null)
      }}>Review source rows</button>
      {' '}<button type="button" className="button-secondary" disabled={busy || item.stagedRows !== item.expectedRows}
        onClick={() => void reopenConversion(item.id)}>Check saved questions</button>
    </li>)}</ul>}
    {selectedImportId && <section aria-labelledby="saved-intake-rows-title">
      <h4 id="saved-intake-rows-title">Source rows for review</h4>
      <p>The original file rows are preserved. Rows that need review stay here until they can be added safely.</p>
      {reviewError && <p role="alert">{reviewError}</p>}
      {review && <>
        <p>Page {review.page} of {Math.max(1, Math.ceil(review.total / review.pageSize))} · {review.total} rows</p>
        <div className="recovery-actions">
          <button type="button" className="button-secondary" disabled={reviewPage <= 1}
            onClick={() => setReviewPage((current) => current - 1)}>Previous 20</button>
          <button type="button" className="button-secondary"
            disabled={reviewPage * review.pageSize >= review.total}
            onClick={() => setReviewPage((current) => current + 1)}>Next 20</button>
        </div>
        <ol start={(review.page - 1) * review.pageSize + 1}>{review.rows.map((row) => <li key={row.catalogueId}>
          <strong>{row.catalogueId}</strong> · {TYPE_LABELS[row.type] ?? row.type} · Unit {row.displayUnit}
          {row.unitTags.length > 1 && ` (tags ${row.unitTags.join(', ')})`}
          {row.lesson && ` · Lesson ${row.lesson}`} · exam marks assigned when composing
          <p>{row.prompt}</p>
          {row.issues.length > 0 && <ul aria-label={`Problems for ${row.catalogueId}`}>{row.issues.map((issue) => {
            const readable = readableImportIssue(issue)
            return <li key={issue}>{readable.problem} <em>What to do:</em> {readable.remedy}</li>
          })}</ul>}
          {showDiagnostics && <details><summary>Diagnostics: original and saved mapping</summary>
            <h5>Original question, context, options and answer</h5><ReviewValues value={row.original} />
            <h5>Saved normalized question and interpreted fields</h5><ReviewValues value={row.normalized} />
            <p>Use Check saved questions above to compare the current conversion and complete group report before committing.</p>
          </details>}
        </li>)}</ol>
      </>}
    </section>}
  </section>
}
