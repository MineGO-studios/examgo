import { useState } from 'react'
import type { SavedBlueprintPaper } from '../lib/blueprintPaperRepository'
import { blueprintDownloadAllowed, renderBlueprintPaper } from '../lib/blueprintPaperDelivery'
import { blueprintPaperSettings } from '../lib/examBlueprintPaper'
import { downloadExamDocumentPair, downloadPreparedDocument, requestBrowserDownload, type PreparedExamDocumentPair } from '../lib/documentDelivery'
import { localizeAppMessage } from '../lib/appMessages'
import { useI18n } from '../lib/i18n'
import WordFilePreview from './WordFilePreview'
import BlueprintPaperReview from './BlueprintPaperReview'
import { reportSafeError } from '../lib/safeErrorDetails'
import { BLUEPRINT_PAPER_STRINGS } from './BlueprintPaper.strings'

type Strings = typeof BLUEPRINT_PAPER_STRINGS.en.final
type Message = (s: Strings) => string

export default function BlueprintFinalPaper({ paper }: { paper: SavedBlueprintPaper }) {
  const { language } = useI18n(), s = BLUEPRINT_PAPER_STRINGS[language].final
  const [documents, setDocuments] = useState<PreparedExamDocumentPair | null>(null)
  const allowed = blueprintDownloadAllowed(paper.intent)
  const [busy, setBusy] = useState(false), [message, setMessage] = useState<Message>(() => (t: Strings) => t.immutable)
  const say = (next: Message) => setMessage(() => next)
  const sayText = (text: string) => say(() => text)
  return <section aria-label={s.region}>
    <h3>{s.heading} · <bdi>{paper.intent.intent.settings.examTitle}</bdi></h3>
    <p>{s.layout} {paper.intent.layout.decision === 'unchanged-two-page' ? s.twoPage : allowed ? s.onePage : s.noException} {s.inspect}</p>
    <p role="status">{localizeAppMessage(language, message(s))}</p>
    {!documents && <button type="button" disabled={busy || !allowed} onClick={() => {
      setBusy(true)
      void renderBlueprintPaper(paper)
        .then((pair) => { setDocuments(pair); say((t) => t.ready) })
        .catch((error: unknown) => sayText(reportSafeError(error, BLUEPRINT_PAPER_STRINGS.en.final.prepareFailed)))
        .finally(() => setBusy(false))
    }}>{s.prepare}</button>}
    {documents && <WordFilePreview documents={documents} busy={busy} onDownload={() => {
      setBusy(true)
      void downloadExamDocumentPair(documents)
        .then((outcome) => outcome.hasFailures ? sayText([outcome.exam.error, outcome.answerKey.error].filter(Boolean).join(' ')) : say((t) => t.sent))
        .finally(() => setBusy(false))
    }} />}
    {documents && <div className="recovery-actions" role="group" aria-label={s.downloads}>
      <p>{s.separately}</p>
      {(['exam', 'answerKey'] as const).map(kind => <button key={kind} type="button" disabled={busy} onClick={() => {
        setBusy(true)
        const name = (t: Strings) => kind === 'exam' ? t.studentName : t.keyName
        void downloadPreparedDocument(documents[kind], requestBrowserDownload).then(result => result.status === 'failed'
          ? say((t) => `${name(t)}: ${localizeAppMessage(language, result.error ?? '')}`)
          : say((t) => t.requested(name(t))))
          .finally(() => setBusy(false))
      }}>{kind === 'exam' ? s.downloadStudent : s.downloadKey}</button>)}
    </div>}
    <BlueprintPaperReview snapshot={paper.intent.snapshot} settings={blueprintPaperSettings(paper.intent)} generalInstruction={paper.intent.intent.generalInstruction} />
  </section>
}
