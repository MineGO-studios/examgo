import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DOCX_MEDIA_TYPE,
  createDocxBlob,
  downloadExamDocumentPair,
  prepareExamDocumentPair,
  requestBrowserDownload,
  retryFailedDocumentDownloads,
  type PreparedExamDocument,
} from './documentDelivery'

const EXAM_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2])
const ANSWER_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 3, 4])

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('DOCX preparation', () => {
  it('assigns the official media type without changing package bytes', async () => {
    const blob = createDocxBlob(EXAM_BYTES.buffer)

    expect(blob.type).toBe(DOCX_MEDIA_TYPE)
    const deliveredBytes = new Uint8Array(await blob.arrayBuffer())

    expect(deliveredBytes).toEqual(EXAM_BYTES)
    expect(Array.from(deliveredBytes.slice(0, 4))).toEqual([
      0x50, 0x4b, 0x03, 0x04,
    ])
  })

  it('uses stable Android-visible DOCX filenames for both documents', () => {
    const pair = prepareExamDocumentPair(
      1,
      EXAM_BYTES.buffer,
      ANSWER_BYTES.buffer,
    )

    expect(pair.exam.filename).toBe('ExamGO-Unit1-Exam.docx')
    expect(pair.answerKey.filename).toBe(
      'ExamGO-Unit1-Answer-Key.docx',
    )
    expect(pair.exam.blob.type).toBe(DOCX_MEDIA_TYPE)
    expect(pair.answerKey.blob.type).toBe(DOCX_MEDIA_TYPE)
  })
})

describe('paired document delivery', () => {
  it('reports each download independently when one request fails', async () => {
    const pair = prepareExamDocumentPair(
      1,
      EXAM_BYTES.buffer,
      ANSWER_BYTES.buffer,
    )
    const trigger = vi.fn(
      async (document: PreparedExamDocument): Promise<void> => {
        if (document.kind === 'answerKey') {
          throw new Error('Download blocked')
        }
      },
    )

    const result = await downloadExamDocumentPair(pair, trigger)

    expect(result.exam.status).toBe('requested')
    expect(result.answerKey).toMatchObject({
      status: 'failed',
      error: expect.stringMatching(/^The browser did not accept the download request\..*Reference: EG-/),
    })
    expect(result.hasFailures).toBe(true)
    expect(result.answerKey.error).not.toContain('Download blocked')
  })

  it('retries only the failed document from the unchanged pair', async () => {
    const pair = prepareExamDocumentPair(
      1,
      EXAM_BYTES.buffer,
      ANSWER_BYTES.buffer,
    )
    const trigger = vi.fn()
    const result = await retryFailedDocumentDownloads(
      pair,
      {
        exam: {
          kind: 'exam',
          filename: pair.exam.filename,
          status: 'requested',
        },
        answerKey: {
          kind: 'answerKey',
          filename: pair.answerKey.filename,
          status: 'failed',
          error: 'Download blocked',
        },
        hasFailures: true,
      },
      trigger,
    )

    expect(trigger).toHaveBeenCalledOnce()
    expect(trigger).toHaveBeenCalledWith(pair.answerKey)
    expect(result.hasFailures).toBe(false)
  })
})

describe('browser download request', () => {
  it('sets the filename and cleans up its object URL after the request', () => {
    vi.useFakeTimers()
    const remove = vi.fn()
    const click = vi.fn()
    const appendChild = vi.fn()
    const link = {
      href: '',
      download: '',
      style: { display: '' },
      click,
      remove,
    }
    const createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:examgo-docx')
    const revokeObjectURL = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => undefined)
    vi.stubGlobal('document', {
      createElement: vi.fn().mockReturnValue(link),
      body: { appendChild },
    })
    vi.stubGlobal('window', { setTimeout })

    const preparedDocument: PreparedExamDocument = {
      kind: 'exam',
      filename: 'ExamGO-Unit1-Exam.docx',
      blob: createDocxBlob(EXAM_BYTES.buffer),
    }

    requestBrowserDownload(preparedDocument)

    expect(createObjectURL).toHaveBeenCalledWith(preparedDocument.blob)
    expect(link.href).toBe('blob:examgo-docx')
    expect(link.download).toBe('ExamGO-Unit1-Exam.docx')
    expect(appendChild).toHaveBeenCalledWith(link)
    expect(click).toHaveBeenCalledOnce()
    expect(revokeObjectURL).not.toHaveBeenCalled()

    vi.runAllTimers()

    expect(remove).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:examgo-docx')
  })
})
