import { useCallback, useEffect, useState } from 'react'
import {
  getExamDrafts,
  openExamDraft,
  type DraftRecoveryIssue,
  type ExamDraftSummary,
  type ReopenedExamDraft,
} from '../lib/examDraftRepository'
import { teacherErrorMessage } from '../lib/safeErrorDetails'
import { SavedWorkStatus } from './SavedWorkStatus'
import { listLoadState, useReportListLoadState, type ReportListLoadState } from './savedWorkLoadState'

type DraftListStatus = 'loading' | 'ready' | 'error'

interface DraftRecoveryState {
  title: string
  bankName: string
  issues: DraftRecoveryIssue[]
}

interface MyDraftsProps {
  onCreateExam: () => void
  onManageQuestions: () => void
  onOpenDraft: (draft: ReopenedExamDraft) => void
  /** When supplied, the My papers section announces load failures and empty state. */
  onLoadState?: ReportListLoadState
}

function getErrorMessage(error: unknown): string {
  return teacherErrorMessage(error, 'Unable to load your drafts. Please try again.')
}

function formatModifiedDate(value: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Unknown date'
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export default function MyDrafts({
  onCreateExam,
  onManageQuestions,
  onOpenDraft,
  onLoadState,
}: MyDraftsProps) {
  const [drafts, setDrafts] = useState<ExamDraftSummary[]>([])
  const [status, setStatus] = useState<DraftListStatus>('loading')
  const [message, setMessage] = useState('Loading your drafts…')
  const [openingDraftId, setOpeningDraftId] = useState<string | null>(
    null,
  )
  const [recovery, setRecovery] =
    useState<DraftRecoveryState | null>(null)
  const [openFailed, setOpenFailed] = useState(false)

  const loadDrafts = useCallback(async (): Promise<void> => {
    setStatus('loading')
    setMessage('Loading your drafts…')
    setRecovery(null)

    try {
      const nextDrafts = await getExamDrafts()
      setDrafts(nextDrafts)
      setStatus('ready')
      setMessage(
        nextDrafts.length === 0
          ? 'No saved drafts yet.'
          : `${nextDrafts.length} saved draft${nextDrafts.length === 1 ? '' : 's'} available.`,
      )
    } catch (error) {
      setStatus('error')
      setMessage(getErrorMessage(error))
    }
  }, [])

  useEffect(() => {
    let active = true

    const loadInitialDrafts = async (): Promise<void> => {
      try {
        const nextDrafts = await getExamDrafts()

        if (!active) {
          return
        }

        setDrafts(nextDrafts)
        setStatus('ready')
        setMessage(
          nextDrafts.length === 0
            ? 'No saved drafts yet.'
            : `${nextDrafts.length} saved draft${nextDrafts.length === 1 ? '' : 's'} available.`,
        )
      } catch (error) {
        if (!active) {
          return
        }

        setStatus('error')
        setMessage(getErrorMessage(error))
      }
    }

    void loadInitialDrafts()

    return () => {
      active = false
    }
  }, [])

  const handleOpenDraft = async (
    summary: ExamDraftSummary,
  ): Promise<void> => {
    setOpeningDraftId(summary.draft.id)
    setRecovery(null)
    setOpenFailed(false)
    setMessage(`Opening ${summary.draft.exam_title}…`)

    try {
      const result = await openExamDraft(summary.draft.id)

      if (result.status === 'recovery') {
        setRecovery({
          title: result.draft.exam_title,
          bankName: result.bankName,
          issues: result.issues,
        })
        setMessage(
          'This draft needs review before it can be reopened safely.',
        )
        return
      }

      onOpenDraft(result.value)
    } catch (error) {
      // Opening one draft failed; the list itself is still loaded.
      setOpenFailed(true)
      setMessage(teacherErrorMessage(error, 'This draft could not be opened. Please try again.'))
    } finally {
      setOpeningDraftId(null)
    }
  }

  const state = listLoadState(status !== 'loading', status === 'error', drafts.length)
  useReportListLoadState(onLoadState, state)
  if (onLoadState && state === 'empty') return null

  return (
    <section className="paper-list drafts-view" aria-labelledby="drafts-title">
      <div className="section-heading">
        <div>
          <h3 id="drafts-title">Papers from your question banks</h3>
        </div>
      </div>

      {openFailed
        ? <p role="alert" className="saved-work-failure">{message}</p>
        : <SavedWorkStatus message={message} failed={status === 'error'} managed={Boolean(onLoadState)} />}

      {status === 'loading' && (
        <div className="empty-state" aria-busy="true">
          Checking your saved drafts…
        </div>
      )}

      {status === 'error' && !onLoadState && (
        <button type="button" onClick={() => void loadDrafts()}>
          Retry loading drafts
        </button>
      )}

      {status === 'ready' && drafts.length === 0 && (
        <div className="empty-state">
          <p>
            Save a reviewed exam to return to its settings and selected
            questions later.
          </p>
          <button type="button" onClick={onCreateExam}>
            Create an exam
          </button>
        </div>
      )}

      {status === 'ready' && drafts.length > 0 && !recovery && (
        <div className="draft-table-wrap">
          <table className="draft-table">
            <thead>
              <tr>
                <th scope="col">Title</th>
                <th scope="col">Question bank</th>
                <th scope="col">Modified</th>
                <th scope="col">Questions</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {drafts.map((summary) => (
                <tr key={summary.draft.id}>
                  <td data-label="Title">{summary.draft.exam_title}</td>
                  <td data-label="Question bank">{summary.bankName}</td>
                  <td data-label="Modified">
                    {formatModifiedDate(summary.draft.updated_at)}
                  </td>
                  <td data-label="Questions">
                    {summary.draft.question_count}
                  </td>
                  <td data-label="Action">
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={openingDraftId !== null}
                      onClick={() => void handleOpenDraft(summary)}
                    >
                      {openingDraftId === summary.draft.id
                        ? 'Opening…'
                        : 'Open draft'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {recovery && (
        <section className="draft-recovery" aria-labelledby="recovery-title">
          <span className="status-chip status-chip-warning">Review required</span>
          <h3 id="recovery-title">{recovery.title}</h3>
          <p>
            The saved draft from {recovery.bankName} was preserved. ExamGO
            will not silently replace, remove, or upgrade affected questions.
          </p>
          <ul>
            {recovery.issues.map((issue, index) => (
              <li key={`${issue.kind}-${issue.position ?? 'unknown'}-${index}`}>
                {issue.message}
              </li>
            ))}
          </ul>
          <div className="recovery-actions">
            <button type="button" onClick={onManageQuestions}>
              Review question bank
            </button>
            <button
              type="button"
              className="button-secondary"
              onClick={() => {
                setRecovery(null)
                setMessage(
                  `${drafts.length} saved draft${drafts.length === 1 ? '' : 's'} available.`,
                )
              }}
            >
              Return to drafts
            </button>
          </div>
        </section>
      )}
    </section>
  )
}
