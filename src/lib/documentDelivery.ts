import { reportSafeError } from './safeErrorDetails'

export const DOCX_MEDIA_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

const OBJECT_URL_CLEANUP_DELAY_MS = 1_000

export type DocumentBinary = Blob | ArrayBuffer
export type ExamDocumentKind = 'exam' | 'answerKey'

export interface PreparedExamDocument {
  kind: ExamDocumentKind
  filename: string
  blob: Blob
}

export interface PreparedExamDocumentPair {
  exam: PreparedExamDocument
  answerKey: PreparedExamDocument
}

export interface DocumentDownloadOutcome {
  kind: ExamDocumentKind
  filename: string
  status: 'requested' | 'failed'
  error?: string
}

export interface PairedDownloadResult {
  exam: DocumentDownloadOutcome
  answerKey: DocumentDownloadOutcome
  hasFailures: boolean
}

export type DocumentDownloadTrigger = (
  document: PreparedExamDocument,
) => void | Promise<void>

export function createDocxBlob(binary: DocumentBinary): Blob {
  return new Blob([binary], { type: DOCX_MEDIA_TYPE })
}

export function prepareExamDocumentPair(
  unit: number,
  exam: DocumentBinary,
  answerKey: DocumentBinary,
): PreparedExamDocumentPair {
  return {
    exam: {
      kind: 'exam',
      filename: `ExamGO-Unit${unit}-Exam.docx`,
      blob: createDocxBlob(exam),
    },
    answerKey: {
      kind: 'answerKey',
      filename: `ExamGO-Unit${unit}-Answer-Key.docx`,
      blob: createDocxBlob(answerKey),
    },
  }
}

export function requestBrowserDownload(
  preparedDocument: PreparedExamDocument,
): void {
  const downloadUrl = URL.createObjectURL(preparedDocument.blob)
  const link = document.createElement('a')

  link.href = downloadUrl
  link.download = preparedDocument.filename
  link.style.display = 'none'

  document.body.appendChild(link)

  try {
    link.click()
  } catch (error) {
    link.remove()
    URL.revokeObjectURL(downloadUrl)
    throw error
  }

  window.setTimeout(() => {
    link.remove()
    URL.revokeObjectURL(downloadUrl)
  }, OBJECT_URL_CLEANUP_DELAY_MS)
}

export async function downloadPreparedDocument(
  preparedDocument: PreparedExamDocument,
  trigger: DocumentDownloadTrigger,
): Promise<DocumentDownloadOutcome> {
  try {
    await trigger(preparedDocument)

    return {
      kind: preparedDocument.kind,
      filename: preparedDocument.filename,
      status: 'requested',
    }
  } catch (error) {
    return {
      kind: preparedDocument.kind,
      filename: preparedDocument.filename,
      status: 'failed',
      error: reportSafeError(error, 'The browser did not accept the download request. Retry this file from the same prepared paper.'),
    }
  }
}

export async function downloadExamDocumentPair(
  documents: PreparedExamDocumentPair,
  trigger: DocumentDownloadTrigger = requestBrowserDownload,
): Promise<PairedDownloadResult> {
  const [exam, answerKey] = await Promise.all([
    downloadPreparedDocument(documents.exam, trigger),
    downloadPreparedDocument(documents.answerKey, trigger),
  ])

  return {
    exam,
    answerKey,
    hasFailures:
      exam.status === 'failed' || answerKey.status === 'failed',
  }
}

export async function retryFailedDocumentDownloads(
  documents: PreparedExamDocumentPair,
  previousResult: PairedDownloadResult,
  trigger: DocumentDownloadTrigger = requestBrowserDownload,
): Promise<PairedDownloadResult> {
  const exam =
    previousResult.exam.status === 'failed'
      ? await downloadPreparedDocument(documents.exam, trigger)
      : previousResult.exam
  const answerKey =
    previousResult.answerKey.status === 'failed'
      ? await downloadPreparedDocument(documents.answerKey, trigger)
      : previousResult.answerKey

  return {
    exam,
    answerKey,
    hasFailures:
      exam.status === 'failed' || answerKey.status === 'failed',
  }
}
