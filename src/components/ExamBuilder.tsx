import {
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  generateReviewedExamDocuments,
  prepareExamQuestions,
} from '../lib/generateExam'
import {
  downloadPreparedDocument,
  requestBrowserDownload,
  retryFailedDocumentDownloads,
  type PairedDownloadResult,
  type PreparedExamDocumentPair,
} from '../lib/documentDelivery'
import {
  saveExamDraft,
  type ReopenedExamDraft,
} from '../lib/examDraftRepository'
import { getQuestionBanks } from '../lib/questionBankRepository'
import { getActiveStandaloneQuestionsForBanks } from '../lib/questionMembershipRepository'
import { questionToExamQuestion } from '../lib/questions'
import { assignMarks } from '../domain/markAllocation'
import {
  estimateQuestionPages,
  getPageTargetWarning,
  type PageTarget,
} from '../lib/pageTarget'
import {
  createQuestionReview,
  removeQuestionFromReview,
  replaceQuestionInReview,
  toggleQuestionLock,
  type ReviewedQuestion,
} from '../lib/reviewQuestions'
import {
  getFirstValidationError,
  validateExamSettings,
  type ExamSettingsErrors,
} from '../lib/validateExamSettings'
import {
  DEFAULT_EXAM_QUESTION_FILTERS,
  DEFAULT_EXAM_SETTINGS,
  EXAM_LIMITS,
  getQuestionQuantities,
  SIMPLE_QUESTION_TYPES,
  type ExamQuestionFilters,
  type ExamSettings,
} from '../types/exam'
import {
  isSimpleQuestionType,
  type ExamQuestion,
  type SimpleQuestionType,
} from '../types/question'
import type { QuestionBank } from '../lib/questionBankRepository'
import { teacherErrorMessage } from '../lib/safeErrorDetails'

type GenerationStatus =
  | 'idle'
  | 'generating'
  | 'saving'
  | 'success'
  | 'error'

type QuestionLoadStatus = 'loading' | 'ready' | 'error'

const fieldStyle = {
  display: 'grid',
  gap: '0.35rem',
  textAlign: 'left',
} as const

const inputStyle = {
  padding: '0.7rem',
  font: 'inherit',
} as const

const errorStyle = {
  color: '#e5484d',
  margin: 0,
} as const

function getErrorMessage(error: unknown): string {
  return teacherErrorMessage(error, 'Unable to load approved questions. Please try again.')
}

function getAvailableQuestionCounts(
  questions: readonly ExamQuestion[],
  unit: number,
  filters: ExamQuestionFilters,
): Record<SimpleQuestionType, number> {
  const counts: Record<SimpleQuestionType, number> = {
    'multiple-choice': 0,
    binary: 0,
    'short-answer': 0,
  }
  questions.forEach((question) => {
    if (question.unit === unit && (!filters.lesson || question.lesson === filters.lesson) && (!filters.difficulty || question.difficulty === filters.difficulty)) {
      counts[question.type] += 1
    }
  })
  return counts
}

const questionTypeLabels: Record<SimpleQuestionType, string> = {
  'multiple-choice': 'Multiple choice',
  binary: 'True/False or Yes/No',
  'short-answer': 'Short open answer',
}

interface ExamBuilderProps {
  reopenedDraft: ReopenedExamDraft | null
  onViewDrafts: () => void
}

export default function ExamBuilder({
  reopenedDraft,
  onViewDrafts,
}: ExamBuilderProps) {
  const [settings, setSettings] = useState<ExamSettings>({
    ...DEFAULT_EXAM_SETTINGS,
  })
  const [filters, setFilters] = useState<ExamQuestionFilters>({
    ...DEFAULT_EXAM_QUESTION_FILTERS,
  })
  const [errors, setErrors] =
    useState<ExamSettingsErrors>({})
  const [status, setStatus] =
    useState<GenerationStatus>('idle')
  const [message, setMessage] = useState(
    'Loading your approved questions…',
  )
  const [banks, setBanks] = useState<QuestionBank[]>([])
  const [selectedBankId, setSelectedBankId] = useState('')
  const [selectedBankIds, setSelectedBankIds] = useState<string[]>([])
  const bankLoadVersion = useRef(0)
  const [questions, setQuestions] = useState<ExamQuestion[]>([])
  const [review, setReview] = useState<ReviewedQuestion[] | null>(
    null,
  )
  const [pageTarget, setPageTarget] = useState<PageTarget>(1)
  const [questionLoadStatus, setQuestionLoadStatus] =
    useState<QuestionLoadStatus>('loading')
  const [generatedDocuments, setGeneratedDocuments] =
    useState<PreparedExamDocumentPair | null>(null)
  const [downloadResult, setDownloadResult] =
    useState<PairedDownloadResult | null>(null)
  const [draftSaved, setDraftSaved] = useState(false)

  useEffect(() => {
    let active = true

    const loadInitialQuestions = async (): Promise<void> => {
      try {
        const loadedBanks = await getQuestionBanks()

        if (!active) {
          return
        }

        setBanks(loadedBanks)

        if (loadedBanks.length === 0) {
          setQuestionLoadStatus('error')
          setMessage(
            'Create a question bank and add approved questions before generating an exam.',
          )
          return
        }

        const bankIds = reopenedDraft?.draft.bank_ids?.length
          ? reopenedDraft.draft.bank_ids : [reopenedDraft?.draft.bank_id ?? loadedBanks[0].id]
        const bankId = bankIds[0]
        const rows = reopenedDraft
          ? null
          : await getActiveStandaloneQuestionsForBanks(bankIds)

        if (!active) {
          return
        }

        const examQuestions = reopenedDraft
          ? reopenedDraft.bankQuestions
          : (rows ?? [])
              .filter((row) => isSimpleQuestionType(row.question_type))
              .map((row) => questionToExamQuestion(row, { marks: DEFAULT_EXAM_SETTINGS.marksPerQuestion }))
        const availableCounts = getAvailableQuestionCounts(
          examQuestions,
          DEFAULT_EXAM_SETTINGS.unit,
          DEFAULT_EXAM_QUESTION_FILTERS,
        )
        setSelectedBankId(bankId)
        setSelectedBankIds(bankIds)
        setQuestions(examQuestions)
        if (reopenedDraft) {
          const restoredQuantities = { 'multiple-choice': 0, binary: 0, 'short-answer': 0 } satisfies Record<SimpleQuestionType, number>
          reopenedDraft.review.forEach(({ question }) => { restoredQuantities[question.type] += 1 })
          setSettings({ ...reopenedDraft.settings, questionQuantities: restoredQuantities })
          setReview(reopenedDraft.review)
        } else {
          setSettings((current) => {
            const quantities = getQuestionQuantities(current)
            const next = { ...quantities }
            SIMPLE_QUESTION_TYPES.forEach((type) => { next[type] = Math.min(next[type], availableCounts[type]) })
            if (Object.values(next).every((count) => count === 0)) {
              const firstAvailable = SIMPLE_QUESTION_TYPES.find((type) => availableCounts[type] > 0)
              if (firstAvailable) next[firstAvailable] = 1
            }
            return { ...current, questionQuantities: next, questionCount: Object.values(next).reduce((sum, count) => sum + count, 0) }
          })
        }
        setQuestionLoadStatus('ready')
        setMessage(
          reopenedDraft
            ? `${reopenedDraft.draft.exam_title} reopened with its saved question order and locks.`
            : `${examQuestions.length} active question${examQuestions.length === 1 ? '' : 's'} available from selected banks.`,
        )
      } catch (error) {
        if (!active) {
          return
        }

        setQuestionLoadStatus('error')
        setMessage(getErrorMessage(error))
      }
    }

    void loadInitialQuestions()

    return () => {
      active = false
    }
  }, [reopenedDraft])

  const updateSetting = <K extends keyof ExamSettings>(
    field: K,
    value: ExamSettings[K],
  ): void => {
    setSettings((current) => ({
      ...current,
      [field]: value,
    }))

    setErrors((current) => ({
      ...current,
      [field]: undefined,
    }))
    setStatus('idle')
    setGeneratedDocuments(null)
    setDownloadResult(null)
    setDraftSaved(false)

    if (
      field === 'questionCount' ||
      field === 'unit' ||
      field === 'selectionSeed'
    ) {
      setReview(null)

      if (review) {
        setMessage('Selection settings changed. Preview questions again.')
      }
    }
  }

  const changeBanks = async (bankIds: string[]): Promise<void> => {
    if (bankIds.length === 0) return
    const loadVersion = ++bankLoadVersion.current
    setSelectedBankId(bankIds[0])
    setSelectedBankIds(bankIds)
    setQuestions([])
    setReview(null)
    setQuestionLoadStatus('loading')
    setStatus('idle')
    setDraftSaved(false)
    setGeneratedDocuments(null)
    setDownloadResult(null)
    setMessage('Loading approved questions…')

    try {
      const rows = await getActiveStandaloneQuestionsForBanks(bankIds)
      if (loadVersion !== bankLoadVersion.current) return
      const examQuestions = rows
        .filter((row) => isSimpleQuestionType(row.question_type))
        .map((row) => questionToExamQuestion(row, { marks: settings.marksPerQuestion }))
      const availableCounts = getAvailableQuestionCounts(
        examQuestions,
        settings.unit,
        filters,
      )
      setQuestions(examQuestions)
      setSettings((current) => {
        const next = { ...getQuestionQuantities(current) }
        SIMPLE_QUESTION_TYPES.forEach((type) => { next[type] = Math.min(next[type], availableCounts[type]) })
        return { ...current, questionQuantities: next, questionCount: Object.values(next).reduce((sum, count) => sum + count, 0) }
      })
      setQuestionLoadStatus('ready')
      setMessage(
        `${examQuestions.length} active question${examQuestions.length === 1 ? '' : 's'} available from ${bankIds.length} selected bank${bankIds.length === 1 ? '' : 's'}.`,
      )
    } catch (error) {
      if (loadVersion !== bankLoadVersion.current) return
      setQuestionLoadStatus('error')
      setMessage(getErrorMessage(error))
    }
  }

  const eligibleQuestionCounts = getAvailableQuestionCounts(
    questions,
    settings.unit,
    filters,
  )

  const availableLessons = Array.from(
    new Set(
      questions
        .filter(
          (question) =>
            question.unit === settings.unit &&
            SIMPLE_QUESTION_TYPES.includes(question.type),
        )
        .map((question) => question.lesson),
    ),
  ).sort((left, right) =>
    left.localeCompare(right, undefined, { numeric: true }),
  )

  const updateFilter = <K extends keyof ExamQuestionFilters>(
    field: K,
    value: ExamQuestionFilters[K],
  ): void => {
    const nextFilters = { ...filters, [field]: value }
    const nextAvailableCounts = getAvailableQuestionCounts(
      questions,
      settings.unit,
      nextFilters,
    )

    setFilters(nextFilters)
    setSettings((current) => {
      const next = { ...getQuestionQuantities(current) }
      SIMPLE_QUESTION_TYPES.forEach((type) => { next[type] = Math.min(next[type], nextAvailableCounts[type]) })
      return { ...current, questionQuantities: next, questionCount: Object.values(next).reduce((sum, count) => sum + count, 0) }
    })
    setErrors((current) => ({
      ...current,
      questionCount: undefined,
    }))
    setStatus('idle')
    setGeneratedDocuments(null)
    setDownloadResult(null)
    setDraftSaved(false)
    setReview(null)
    setMessage(
      Object.values(nextAvailableCounts).some((count) => count > 0)
        ? `${Object.values(nextAvailableCounts).reduce((sum, count) => sum + count, 0)} approved questions match the selected controls.`
        : 'No approved questions match the selected controls.',
    )
  }

  const handleSubmit = (
    event: FormEvent<HTMLFormElement>,
  ): void => {
    event.preventDefault()

    const nextErrors = validateExamSettings(
      settings,
      Object.values(eligibleQuestionCounts).reduce((sum, count) => sum + count, 0),
    )
    const firstError = getFirstValidationError(nextErrors)

    if (firstError) {
      setErrors(nextErrors)
      setStatus('error')
      setMessage(firstError)
      return
    }

    try {
      const selectedQuestions = prepareExamQuestions(
        settings,
        questions,
        filters,
      )
      setErrors({})
      setReview(createQuestionReview(selectedQuestions))
      setDraftSaved(false)
      setGeneratedDocuments(null)
      setDownloadResult(null)
      setStatus('success')
      setMessage(
        'Question preview ready. Lock, remove, or replace questions before generating.',
      )
    } catch (error) {
      const errorMessage =
        teacherErrorMessage(error, 'Unknown generation error.')

      setStatus('error')
      setMessage(`Preview failed: ${errorMessage}`)
    }
  }

  const updateQuestionQuantity = (type: SimpleQuestionType, value: number): void => {
    setSettings((current) => {
      const quantities = { ...getQuestionQuantities(current), [type]: value }
      return { ...current, questionQuantities: quantities, questionCount: Object.values(quantities).reduce((sum, count) => sum + count, 0) }
    })
    setErrors((current) => ({ ...current, questionCount: undefined }))
    setReview(null)
    setDraftSaved(false)
    setGeneratedDocuments(null)
    setDownloadResult(null)
    setStatus('idle')
    setMessage('Selection quantities changed. Preview questions again.')
  }

  const handleLock = (questionId: string): void => {
    if (!review) return

    setReview(toggleQuestionLock(review, questionId))
    setStatus('idle')
    setDraftSaved(false)
    setMessage('Question lock updated.')
  }

  const updateQuestionMarks = (questionId: string, marks: number): void => {
    if (!review) return
    setReview(review.map((item) => item.question.id === questionId
      ? { ...item, question: { ...item.question, marks } as ExamQuestion }
      : item))
    setDraftSaved(false)
    setGeneratedDocuments(null)
    setDownloadResult(null)
    setStatus('idle')
  }

  const validateReviewMarks = (): void => {
    if (!review) throw new Error('Preview questions before assigning marks.')
    review.forEach(({ question }, index) => {
      try { assignMarks([question.id], question.marks, { mode: 'equal' }) }
      catch (error) { throw new Error(`Question ${index + 1}: ${teacherErrorMessage(error, 'invalid marks')}`) }
    })
  }

  const handleRemove = (questionId: string): void => {
    if (!review) return

    try {
      const removed = review.find((item) => item.question.id === questionId)
      const nextReview = removeQuestionFromReview(review, questionId)
      setReview(nextReview)
      setSettings((current) => ({
        ...current,
        questionCount: nextReview.length,
        questionQuantities: removed
          ? { ...getQuestionQuantities(current), [removed.question.type]: Math.max(0, getQuestionQuantities(current)[removed.question.type] - 1) }
          : getQuestionQuantities(current),
      }))
      setStatus('idle')
      setDraftSaved(false)
      setGeneratedDocuments(null)
      setDownloadResult(null)
      setMessage('Question removed from this exam preview.')
    } catch (error) {
      setStatus('error')
      setMessage(
        teacherErrorMessage(error, 'Unable to remove question.'),
      )
    }
  }

  const handleReplace = (questionId: string): void => {
    if (!review) return

    try {
      setReview(
        replaceQuestionInReview(
          review,
          questionId,
          questions,
          settings,
          filters,
        ),
      )
      setStatus('idle')
      setDraftSaved(false)
      setGeneratedDocuments(null)
      setDownloadResult(null)
      setMessage('Question replaced with another eligible question.')
    } catch (error) {
      setStatus('error')
      setMessage(
        teacherErrorMessage(error, 'Unable to replace question.'),
      )
    }
  }

  const handleGenerate = async (): Promise<void> => {
    if (!review) {
      setStatus('error')
      setMessage('Preview the questions before generating documents.')
      return
    }

    setStatus('generating')
    setMessage('Generating the reviewed exam and answer key…')

    try {
      validateReviewMarks()
      const result = await generateReviewedExamDocuments(
        settings,
        review.map((item) => item.question),
      )
      setGeneratedDocuments(result.documents)
      setDownloadResult(result.delivery)

      if (result.delivery.hasFailures) {
        setStatus('error')
        setMessage(
          'The documents are ready, but one or more download requests were blocked. Retry the failed file below.',
        )
      } else {
        setStatus('success')
        setMessage(
          'Exam and answer key are ready. Both named DOCX downloads were requested.',
        )
      }
    } catch (error) {
      const errorMessage =
        teacherErrorMessage(error, 'Unknown generation error.')

      setStatus('error')
      setMessage(`Generation failed: ${errorMessage}`)
    }
  }

  const handleRetryFailedDownloads = async (): Promise<void> => {
    if (!generatedDocuments || !downloadResult) {
      return
    }

    setStatus('generating')
    setMessage('Retrying the blocked document download…')

    const nextResult = await retryFailedDocumentDownloads(
      generatedDocuments,
      downloadResult,
    )

    setDownloadResult(nextResult)
    setStatus(nextResult.hasFailures ? 'error' : 'success')
    setMessage(
      nextResult.hasFailures
        ? 'A download request is still blocked. Use the individual file buttons or check browser download permissions.'
        : 'The failed download was requested again successfully.',
    )
  }

  const handleIndividualDownload = async (
    kind: 'exam' | 'answerKey',
  ): Promise<void> => {
    if (!generatedDocuments || !downloadResult) {
      return
    }

    const preparedDocument = generatedDocuments[kind]
    const outcome = await downloadPreparedDocument(
      preparedDocument,
      requestBrowserDownload,
    )
    const nextResult = {
      ...downloadResult,
      [kind]: outcome,
    }
    nextResult.hasFailures =
      nextResult.exam.status === 'failed' ||
      nextResult.answerKey.status === 'failed'

    setDownloadResult(nextResult)
    setStatus(outcome.status === 'failed' ? 'error' : 'success')
    setMessage(
      outcome.status === 'failed'
        ? `${outcome.filename} could not be requested. Check browser download permissions and try again.`
        : `${outcome.filename} download requested.`,
    )
  }

  const handleSaveDraft = async (): Promise<void> => {
    if (!review) {
      setStatus('error')
      setMessage('Preview the questions before saving a draft.')
      return
    }

    setStatus('saving')
    setMessage('Saving the exam draft…')

    try {
      validateReviewMarks()
      await saveExamDraft(selectedBankId, settings, review, selectedBankIds)
      setStatus('success')
      setDraftSaved(true)
      setMessage('Exam draft saved in My papers.')
    } catch (error) {
      setStatus('error')
      setMessage(
        teacherErrorMessage(error, 'Unable to save the exam draft.'),
      )
    }
  }

  const totalMarks = review?.every((item) => Number.isSafeInteger(item.question.marks) &&
    item.question.marks >= 1 && item.question.marks <= 1000)
    ? review.reduce((total, item) => total + item.question.marks, 0) : null
  const effectiveQuestionCount = review?.length ?? settings.questionCount
  const estimatedQuestionPages = estimateQuestionPages(
    effectiveQuestionCount,
  )
  const pageTargetWarning = getPageTargetWarning(
    effectiveQuestionCount,
    pageTarget,
  )
  const isGenerating = status === 'generating'
  const isSaving = status === 'saving'
  const isBusy = isGenerating || isSaving
  const isLoadingQuestions = questionLoadStatus === 'loading'

  return (
    <form
      className="card exam-builder"
      onSubmit={handleSubmit}
      noValidate
    >
      <div className="section-heading">
        <div>
          <span className="eyebrow">Exam construction</span>
          <h2>Build exam</h2>
          <p>
            Generate a student paper and matching answer key from
            your selected question banks.
          </p>
        </div>
      </div>

      {banks.length > 0 && (
        <fieldset className="structured-fields bank-pool-selection" disabled={isLoadingQuestions || isBusy}>
          <legend>Question banks</legend>
          {banks.map((bank) => {
            const checked = selectedBankIds.includes(bank.id)
            return <label key={bank.id} className="checkbox-field">
              <input type="checkbox" checked={checked}
                disabled={checked && selectedBankIds.length === 1}
                onChange={() => void changeBanks(checked
                  ? selectedBankIds.filter((id) => id !== bank.id)
                  : [...selectedBankIds, bank.id])} /> <span>{bank.name}</span>
            </label>
          })}
          <small>{Object.values(eligibleQuestionCounts).reduce((sum, count) => sum + count, 0)} active Unit {settings.unit} questions, counted once across selected banks</small>
        </fieldset>
      )}

      <label style={fieldStyle}>
        School name
        <input
          type="text"
          value={settings.schoolName}
          maxLength={EXAM_LIMITS.schoolNameMaxLength}
          onChange={(event) =>
            updateSetting('schoolName', event.target.value)
          }
          aria-invalid={Boolean(errors.schoolName)}
          style={inputStyle}
        />
        {errors.schoolName && (
          <span role="alert" style={errorStyle}>
            {errors.schoolName}
          </span>
        )}
      </label>

      <label style={fieldStyle}>
        Test title
        <input
          type="text"
          value={settings.examTitle}
          maxLength={EXAM_LIMITS.examTitleMaxLength}
          onChange={(event) =>
            updateSetting('examTitle', event.target.value)
          }
          aria-invalid={Boolean(errors.examTitle)}
          style={inputStyle}
        />
        {errors.examTitle && (
          <span role="alert" style={errorStyle}>
            {errors.examTitle}
          </span>
        )}
      </label>

      <label style={fieldStyle}>
        Teacher name for footer
        <input
          type="text"
          value={settings.teacherName ?? ''}
          maxLength={EXAM_LIMITS.teacherNameMaxLength}
          onChange={(event) =>
            updateSetting('teacherName', event.target.value)
          }
          aria-invalid={Boolean(errors.teacherName)}
          style={inputStyle}
        />
        <small>Leave blank to print a handwriting line.</small>
        {errors.teacherName && (
          <span role="alert" style={errorStyle}>
            {errors.teacherName}
          </span>
        )}
      </label>

      <fieldset>
        <legend>Supported content</legend>
        <p>Grade 6 · Unit 1</p>
      </fieldset>

      <div className="exam-filter-grid">
        <label style={fieldStyle}>
          Lesson
          <select
            value={filters.lesson}
            disabled={isLoadingQuestions || isBusy}
            onChange={(event) =>
              updateFilter('lesson', event.target.value)
            }
            style={inputStyle}
          >
            <option value="">All lessons</option>
            {availableLessons.map((lesson) => (
              <option key={lesson} value={lesson}>
                Lesson {lesson}
              </option>
            ))}
          </select>
        </label>

        <label style={fieldStyle}>
          Difficulty
          <select
            value={filters.difficulty}
            disabled={isLoadingQuestions || isBusy}
            onChange={(event) =>
              updateFilter(
                'difficulty',
                event.target.value as ExamQuestionFilters['difficulty'],
              )
            }
            style={inputStyle}
          >
            <option value="">All difficulties</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </label>
      </div>

      <fieldset>
        <legend>Question quantities by type</legend>
        <div className="exam-filter-grid">
          {SIMPLE_QUESTION_TYPES.map((type) => (
            <label style={fieldStyle} key={type}>
              {questionTypeLabels[type]}
              <input
                type="number"
                min="0"
                max={eligibleQuestionCounts[type]}
                step="1"
                value={getQuestionQuantities(settings)[type]}
                onChange={(event) => updateQuestionQuantity(type, event.target.valueAsNumber || 0)}
                disabled={isLoadingQuestions || isBusy}
                style={inputStyle}
              />
              <small>{eligibleQuestionCounts[type]} available</small>
            </label>
          ))}
        </div>
        {errors.questionCount && <span role="alert" style={errorStyle}>{errors.questionCount}</span>}
      </fieldset>

      <details open={Boolean(errors.selectionSeed)}>
      <summary>Advanced generation setting</summary>
      <label style={fieldStyle}>
        Paper seed
        <input
          type="number"
          min={EXAM_LIMITS.minimumSelectionSeed}
          max={EXAM_LIMITS.maximumSelectionSeed}
          step="1"
          value={settings.selectionSeed}
          onChange={(event) =>
            updateSetting(
              'selectionSeed',
              event.target.valueAsNumber || 0,
            )
          }
          aria-invalid={Boolean(errors.selectionSeed)}
          style={inputStyle}
        />
        <small>
          The same seed keeps the same selection when the banks and filters are unchanged. Preview again after changing it.
        </small>
        {errors.selectionSeed && (
          <span role="alert" style={errorStyle}>
            {errors.selectionSeed}
          </span>
        )}
      </label>
      </details>

      <output>
        Total marks: <strong>{review ? totalMarks ?? 'Fix question marks' : 'Preview to calculate'}</strong>
      </output>

      <div className="page-target">
        <label style={fieldStyle}>
          Question-page target
          <select
            value={pageTarget}
            disabled={isBusy}
            onChange={(event) =>
              setPageTarget(Number(event.target.value) as PageTarget)
            }
            style={inputStyle}
          >
            {[1, 2, 3, 4, 5].map((target) => (
              <option key={target} value={target}>
                {target} page{target === 1 ? '' : 's'}
              </option>
            ))}
          </select>
        </label>
        <small>
          Estimated question pages: {estimatedQuestionPages}. Final pagination
          can vary by content and Word settings.
        </small>
        {pageTargetWarning && (
          <p className="page-target-warning" role="alert">
            {pageTargetWarning}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={
          isBusy || questionLoadStatus !== 'ready'
        }
      >
        Preview questions
      </button>

      {review && (
        <section
          className="exam-review"
          aria-labelledby="exam-review-title"
        >
          <div className="section-heading">
            <div>
              <span className="eyebrow">Teacher review</span>
              <h3 id="exam-review-title">Selected questions</h3>
            </div>
            <span className="status-chip active">
              {review.length} selected
            </span>
          </div>

          <ol className="review-question-list">
            {review.map(({ question, locked }, index) => (
              <li
                key={question.id}
                className="review-question-card"
              >
                <div className="question-card-heading">
                  <strong>
                    {index + 1}. {questionTypeLabels[question.type]}
                  </strong>
                  {locked && (
                    <span className="status-chip">Locked</span>
                  )}
                </div>
                <p>{question.prompt}</p>
                <small>
                  Lesson {question.lesson} · {question.difficulty} ·{' '}
                  marks assigned for this exam
                </small>
                <label style={fieldStyle}>
                  Total marks for question {index + 1}
                  <input type="number" min="1" max="1000" step="1"
                    value={Number.isNaN(question.marks) ? '' : question.marks}
                    onChange={(event) => updateQuestionMarks(question.id, event.target.valueAsNumber)}
                    disabled={isBusy} style={inputStyle} />
                </label>
                <div className="review-question-actions">
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => handleLock(question.id)}
                    disabled={isBusy}
                    aria-pressed={locked}
                  >
                    {locked ? 'Unlock' : 'Lock'}
                  </button>
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => handleReplace(question.id)}
                    disabled={locked || isBusy}
                  >
                    Replace
                  </button>
                  <button
                    type="button"
                    className="button-quiet"
                    onClick={() => handleRemove(question.id)}
                    disabled={
                      locked || isBusy || review.length === 1
                    }
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ol>

          <div className="review-final-actions">
            <button
              type="button"
              className="button-secondary"
              onClick={() => void handleSaveDraft()}
              disabled={isBusy}
            >
              {isSaving ? 'Saving…' : 'Save draft'}
            </button>
            {draftSaved && (
              <button
                type="button"
                className="button-quiet"
                onClick={onViewDrafts}
              >
                View in My papers
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={isBusy}
            >
              {isGenerating
                ? 'Generating…'
                : 'Generate Exam + Answer Key'}
            </button>
          </div>

          {generatedDocuments && downloadResult && (
            <section
              className="document-downloads"
              aria-labelledby="document-downloads-title"
            >
              <h4 id="document-downloads-title">Prepared documents</h4>
              <ul>
                {([
                  generatedDocuments.exam,
                  generatedDocuments.answerKey,
                ] as const).map((preparedDocument) => {
                  const outcome =
                    preparedDocument.kind === 'exam'
                      ? downloadResult.exam
                      : downloadResult.answerKey

                  return (
                    <li key={preparedDocument.kind}>
                      <span>
                        <strong>{preparedDocument.filename}</strong>{' '}
                        —{' '}
                        {outcome.status === 'failed'
                          ? 'Download blocked'
                          : 'Download requested'}
                      </span>
                      <button
                        type="button"
                        className="button-secondary"
                        onClick={() =>
                          void handleIndividualDownload(
                            preparedDocument.kind,
                          )
                        }
                        disabled={isBusy}
                      >
                        Download {preparedDocument.kind === 'exam'
                          ? 'exam'
                          : 'answer key'}
                      </button>
                    </li>
                  )
                })}
              </ul>
              {downloadResult.hasFailures && (
                <button
                  type="button"
                  onClick={() => void handleRetryFailedDownloads()}
                  disabled={isBusy}
                >
                  Retry failed download
                </button>
              )}
            </section>
          )}
        </section>
      )}

      <p
        role={
          status === 'error' || questionLoadStatus === 'error'
            ? 'alert'
            : 'status'
        }
        aria-live="polite"
      >
        {message}
      </p>
    </form>
  )
}
