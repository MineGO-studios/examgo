import { useState } from 'react'
import type { SavedBlueprintPaper } from '../lib/blueprintPaperRepository'
import { blueprintDownloadAllowed, renderBlueprintPaper } from '../lib/blueprintPaperDelivery'
import { blueprintPaperSettings } from '../lib/examBlueprintPaper'
import { downloadExamDocumentPair, downloadPreparedDocument, requestBrowserDownload, type PreparedExamDocumentPair } from '../lib/documentDelivery'
import WordFilePreview from './WordFilePreview'
import BlueprintPaperReview from './BlueprintPaperReview'
import { reportSafeError } from '../lib/safeErrorDetails'

export default function BlueprintFinalPaper({ paper }: { paper: SavedBlueprintPaper }) {
  const [documents, setDocuments] = useState<PreparedExamDocumentPair | null>(null)
  const allowed = blueprintDownloadAllowed(paper.intent)
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('This immutable paper keeps its captured questions and source versions. Bank edits cannot rewrite it.')
  return <section aria-label="Immutable generated paper">
    <h3>Generated paper · {paper.intent.intent.settings.examTitle}</h3>
    <p>Layout status: NEEDS_REVIEW. {paper.intent.layout.decision === 'unchanged-two-page'
      ? 'Unchanged two-page exception recorded. This decision does not prove two-page fit.'
      : allowed ? 'No two-page exception was needed: the content is within the verified one-page volume.' : 'No download exception recorded.'} Inspect both documents in Word or LibreOffice before printing.</p>
    <p role="status">{message}</p>
    {!documents && <button type="button" disabled={busy || !allowed} onClick={() => {
      setBusy(true)
      void renderBlueprintPaper(paper)
        .then((pair) => { setDocuments(pair); setMessage('The Word files are ready. Check them below, then download them.') })
        .catch((error: unknown) => setMessage(reportSafeError(error, 'Documents could not be prepared. Reopen saved work and review the source text before retrying.')))
        .finally(() => setBusy(false))
    }}>Prepare the Word files</button>}
    {documents && <WordFilePreview documents={documents} busy={busy} onDownload={() => {
      setBusy(true)
      void downloadExamDocumentPair(documents)
        .then((outcome) => setMessage(outcome.hasFailures ? [outcome.exam.error, outcome.answerKey.error].filter(Boolean).join(' ') : 'Both download requests sent. Confirm that both files arrived, then inspect their layout in Word or LibreOffice.'))
        .finally(() => setBusy(false))
    }} />}
    {documents && <div className="recovery-actions" aria-label="Individual document downloads">
      <p>If the browser blocks a second download, request each file separately.</p>
      {(['exam', 'answerKey'] as const).map(kind => <button key={kind} type="button" disabled={busy} onClick={() => {
        setBusy(true)
        void downloadPreparedDocument(documents[kind], requestBrowserDownload).then(result => setMessage(result.status === 'failed'
          ? `${kind === 'exam' ? 'Student paper' : 'Answer key'}: ${result.error}`
          : `${kind === 'exam' ? 'Student paper' : 'Answer key'} download requested. Confirm the file arrived and inspect its layout before printing.`))
          .finally(() => setBusy(false))
      }}>{kind === 'exam' ? 'Download student paper' : 'Download answer key'}</button>)}
    </div>}
    <BlueprintPaperReview snapshot={paper.intent.snapshot} settings={blueprintPaperSettings(paper.intent)} generalInstruction={paper.intent.intent.generalInstruction} />
  </section>
}
