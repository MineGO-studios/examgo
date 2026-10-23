import { useEffect, useRef, useState } from 'react'
import type { ExamDocumentKind, PreparedExamDocumentPair } from '../lib/documentDelivery'
import { useI18n } from '../lib/i18n'
import { renderWordPreview } from '../lib/wordPreview'
import { EXAM_BUILDER_STRINGS } from './ExamBuilder.strings'
import { Icon } from './icons'

/** A4 width at 96 dpi; narrower screens scale the page down instead of scrolling sideways. */
const PAGE_WIDTH_PX = 794

/**
 * The generated Word files, shown before download (D8.8). Both come from the exact bytes the teacher
 * downloads; nothing is kept once the teacher leaves the review.
 */
export default function WordFilePreview({ documents, downloaded, busy, onDownload }: {
  documents: PreparedExamDocumentPair
  /** Once both downloads were requested, the per-file results beside the paper take over. */
  downloaded: boolean
  busy: boolean
  onDownload: () => void
}) {
  const { language } = useI18n(), s = EXAM_BUILDER_STRINGS[language]
  const [view, setView] = useState<ExamDocumentKind>('exam')
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const frame = useRef<HTMLDivElement>(null), host = useRef<HTMLDivElement>(null), title = useRef<HTMLHeadingElement>(null)

  // Generate is an explicit request to see the files, so bring them into view.
  useEffect(() => { title.current?.focus() }, [])

  useEffect(() => {
    const element = host.current
    if (!element) return
    let active = true
    setState('loading')
    renderWordPreview(documents[view].blob, element)
      .then(() => { if (active) setState('ready') })
      .catch(() => { if (active) setState('failed') })
    return () => { active = false }
  }, [documents, view])

  useEffect(() => {
    const outer = frame.current, element = host.current
    if (!outer || !element) return
    const fit = () => element.style.setProperty('--word-zoom', String(Math.min(1, (outer.clientWidth - 16) / PAGE_WIDTH_PX)))
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(outer)
    return () => observer.disconnect()
  }, [])

  return <section className="word-preview" aria-labelledby="word-preview-title">
    <div className="word-preview-head">
      <h4 id="word-preview-title" ref={title} tabIndex={-1}>{s.wordPreviewTitle}</h4>
      <div className="segmented" role="group" aria-label={s.wordPreviewFile}>
        <button type="button" aria-pressed={view === 'exam'} onClick={() => setView('exam')}>{s.wordPreviewStudent}</button>
        <button type="button" aria-pressed={view === 'answerKey'} onClick={() => setView('answerKey')}>{s.wordPreviewKey}</button>
      </div>
    </div>
    <p className="field-help">{s.wordPreviewNote}</p>
    {!downloaded && <button type="button" className="word-preview-download" onClick={onDownload} disabled={busy}>
      <Icon name="download" />{s.downloadBoth}
    </button>}
    {state === 'loading' && <p role="status">{s.wordPreviewLoading}</p>}
    {state === 'failed' && <p role="alert">{s.wordPreviewFailed}</p>}
    <div ref={frame} className="word-preview-frame" lang="en" dir="ltr" tabIndex={0}
      aria-label={view === 'exam' ? s.wordPreviewStudent : s.wordPreviewKey} hidden={state === 'failed'}>
      <div ref={host} className="word-preview-host" />
    </div>
  </section>
}
