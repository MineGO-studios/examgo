import { getEligibleSimplePresets } from '../lib/simplePresetRepository'
import {
  type FormEvent,
  type ReactNode,
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
  replaceQuestionWith,
  replacementCandidates,
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
import SimplePaperReview from './SimplePaperReview'
import PaperProgress from './PaperProgress'
import { ChoiceChips, FormGroup, Stepper, ToggleChipGroup } from './controls'
import { ErrorSummary } from './ErrorSummary'
import CouponProgress from './CouponProgress'
import { QUESTION_TYPE_LABELS_EN } from '../lib/questionTypeLabels'

type GenerationStatus =
  | 'idle'
  | 'generating'
  | 'saving'
  | 'success'
  | 'error'

type QuestionLoadStatus = 'loading' | 'ready' | 'error'

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

const questionTypeLabels: Record<SimpleQuestionType, string> = QUESTION_TYPE_LABELS_EN

interface ExamBuilderProps {
  /** How the paper starts; shown at the top of setup. */
  startOptions?: ReactNode
  reopenedDraft: ReopenedExamDraft | null
  onViewDrafts: () => void
  /** Opens the shared MineGO questions source when approved standalone questions exist. */
  onUseSharedQuestions?: () => void
}

export default function ExamBuilder({
  startOptions,
  reopenedDraft,
  onViewDrafts,
  onUseSharedQuestions,
}: ExamBuilderProps) {
  // Approved standalone supply: null while checking, -1 when it could not be checked.
  const [sharedCount, setSharedCount] = useState<number | null>(null)
  useEffect(() => {
    let active = true
    void getEligibleSimplePresets().then((pool) => { if (active) setSharedCount(pool.length) })
      .catch(() => { if (active) setSharedCount(-1) })
    return () => { active = false }
  }, [])
  const [settings, setSettings] = useState<ExamSettings>({
    ...DEFAULT_EXAM_SETTINGS,
  })
  const [filters, setFilters] = useState<ExamQuestionFilters>({
    ...DEFAULT_EXAM_QUESTION_FILTERS,
  })
  const [errors, setErrors] =
    useState<ExamSettingsErrors>({})
  const [failedAttempts, setFailedAttempts] = useState(0)
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
  const [focusedQuestion, setFocusedQuestion] = useState(0)
  const [showStarts, setShowStarts] = useState(false)

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
      setFailedAttempts((count) => count + 1)
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

  const handleReplaceWith = (questionId: string, replacementId: string): void => {
    if (!review) return
    try {
      setReview(replaceQuestionWith(review, questionId, replacementId, questions, settings, filters))
      setStatus('idle')
      setDraftSaved(false)
      setGeneratedDocuments(null)
      setDownloadResult(null)
      setMessage('Question replaced with your choice.')
    } catch (error) {
      setStatus('error')
      setMessage(teacherErrorMessage(error, 'Unable to replace question.'))
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
  const documentsReady = Boolean(generatedDocuments && downloadResult && !downloadResult.hasFailures && !isBusy)
  const statusMessage = (
    <p
      className="builder-status"
      role={status === 'error' || questionLoadStatus === 'error' ? 'alert' : 'status'}
      aria-live="polite"
    >
      {message}
    </p>
  )

  return (
    <form
      className={`card exam-builder${review ? ' has-review' : ''}`}
      onSubmit={handleSubmit}
      noValidate
    >
      <div className="section-heading exam-builder-heading">
        <div>
          <h2>New paper</h2>
          <p>
            Set up the paper, then review it as the student will see it before you download the paper and its answer key.
          </p>
        </div>
        <PaperProgress current={generatedDocuments ? 'download' : review ? 'review' : 'setup'} />
      </div>

      <div className="exam-settings">
      <ErrorSummary attempt={failedAttempts} items={([
        ['schoolName', 'exam-school-name'], ['examTitle', 'exam-title'], ['teacherName', 'exam-teacher-name'],
        ['questionCount', 'exam-question-count'], ['selectionSeed', 'exam-selection-seed'],
      ] as const).flatMap(([key, target]) => errors[key] ? [{ target, message: errors[key] as string }] : [])} />
      {!review || showStarts
        ? startOptions
        : startOptions && <button type="button" className="button-quiet start-again" onClick={() => setShowStarts(true)}>Start from something else</button>}
      <FormGroup title="Paper details">
        <label className="text-field">
          School name
          <input
            type="text"
            value={settings.schoolName}
            maxLength={EXAM_LIMITS.schoolNameMaxLength}
            dir="ltr"
            onChange={(event) => updateSetting('schoolName', event.target.value)}
            id="exam-school-name"
            aria-invalid={Boolean(errors.schoolName)}
            aria-describedby={errors.schoolName ? 'exam-school-name-error' : undefined}
          />
        </label>
        {errors.schoolName && <span id="exam-school-name-error" className="field-error">{errors.schoolName}</span>}

        <label className="text-field">
          Test title
          <input
            type="text"
            value={settings.examTitle}
            maxLength={EXAM_LIMITS.examTitleMaxLength}
            dir="ltr"
            onChange={(event) => updateSetting('examTitle', event.target.value)}
            id="exam-title"
            aria-invalid={Boolean(errors.examTitle)}
            aria-describedby={errors.examTitle ? 'exam-title-error' : undefined}
          />
        </label>
        {errors.examTitle && <span id="exam-title-error" className="field-error">{errors.examTitle}</span>}

        <label className="text-field">
          Teacher name for footer
          <input
            type="text"
            value={settings.teacherName ?? ''}
            maxLength={EXAM_LIMITS.teacherNameMaxLength}
            dir="ltr"
            onChange={(event) => updateSetting('teacherName', event.target.value)}
            id="exam-teacher-name"
            aria-invalid={Boolean(errors.teacherName)}
            aria-describedby={errors.teacherName ? 'exam-teacher-name-error' : undefined}
          />
          <small>Leave blank to print a line for handwriting.</small>
        </label>
        {errors.teacherName && <span id="exam-teacher-name-error" className="field-error">{errors.teacherName}</span>}
      </FormGroup>

      <FormGroup title="Questions" aside={<><span className="unit-swatch" style={{ ['--plan-unit' as string]: `var(--eg-unit-${settings.unit})` }} />Grade 6 · Unit {settings.unit}</>}>
        {banks.length > 0 && (
          <ToggleChipGroup legend="Question banks" disabled={isLoadingQuestions || isBusy}
            hint={`${Object.values(eligibleQuestionCounts).reduce((sum, count) => sum + count, 0)} questions available`}
            items={banks.map((bank) => {
              const checked = selectedBankIds.includes(bank.id)
              return { key: bank.id, label: bank.name, checked, disabled: checked && selectedBankIds.length === 1,
                onToggle: () => void changeBanks(checked ? selectedBankIds.filter((id) => id !== bank.id) : [...selectedBankIds, bank.id]) }
            })} />
        )}

        <div className="shared-source">
          {sharedCount === null
            ? <p role="status" className="field-help">Checking shared MineGO questions…</p>
            : sharedCount > 0 && onUseSharedQuestions
              ? <button type="button" className="button-secondary" onClick={onUseSharedQuestions}>Use shared MineGO questions ({sharedCount})</button>
              : <div className="source-unavailable" role="group" aria-label="Shared MineGO questions">
                  <span className="source-unavailable-title">Shared MineGO questions</span>
                  <span>{sharedCount === -1
                    ? 'Shared questions could not be checked right now. Your own banks still work.'
                    : 'No approved standalone questions are available yet. They will appear here once MineGO publishes them.'}</span>
                </div>}
        </div>

        <ChoiceChips legend="Lesson" disabled={isLoadingQuestions || isBusy} value={filters.lesson}
          onChange={(lesson) => updateFilter('lesson', lesson)}
          options={[{ value: '', label: 'All lessons' }, ...availableLessons.map((lesson) => ({ value: lesson, label: `Lesson ${lesson}` }))]} />

        <ChoiceChips legend="Difficulty" disabled={isLoadingQuestions || isBusy} value={filters.difficulty}
          onChange={(difficulty) => updateFilter('difficulty', difficulty)}
          options={[{ value: '', label: 'Any' }, { value: 'easy', label: 'Easy' }, { value: 'medium', label: 'Medium' }, { value: 'hard', label: 'Hard' }] as { value: ExamQuestionFilters['difficulty']; label: string }[]} />

        <fieldset className="stepper-group" id="exam-question-count" tabIndex={-1}
          aria-describedby={errors.questionCount ? 'exam-question-count-error' : undefined}>
          <legend>How many of each type</legend>
          {SIMPLE_QUESTION_TYPES.map((type) => (
            <Stepper key={type} label={questionTypeLabels[type]} hint={`${eligibleQuestionCounts[type]} available`}
              value={getQuestionQuantities(settings)[type]} max={eligibleQuestionCounts[type]}
              disabled={isLoadingQuestions || isBusy} onChange={(value) => updateQuestionQuantity(type, value)} />
          ))}
          {errors.questionCount && <span id="exam-question-count-error" className="field-error">{errors.questionCount}</span>}
        </fieldset>
      </FormGroup>

      <FormGroup title="Pages">
        <ChoiceChips legend="Question pages" disabled={isBusy} value={pageTarget}
          onChange={(target) => setPageTarget(target)}
          options={([1, 2, 3, 4, 5] as PageTarget[]).map((target) => ({ value: target, label: String(target) }))}
          hint={`About ${estimatedQuestionPages} page${estimatedQuestionPages === 1 ? '' : 's'} of questions. Word may break pages a little differently.`} />
        {pageTargetWarning && <p className="page-target-warning" role="alert">{pageTargetWarning}</p>}
      </FormGroup>

      <details className="more-options" open={Boolean(errors.selectionSeed)}>
        <summary>More options</summary>
        <label className="text-field">
          Selection number
          <input
            type="number"
            min={EXAM_LIMITS.minimumSelectionSeed}
            max={EXAM_LIMITS.maximumSelectionSeed}
            step="1"
            value={settings.selectionSeed}
            onChange={(event) => updateSetting('selectionSeed', event.target.valueAsNumber || 0)}
            id="exam-selection-seed"
            aria-invalid={Boolean(errors.selectionSeed)}
            aria-describedby={errors.selectionSeed ? 'exam-selection-seed-error' : undefined}
          />
          <small>Keep the same number to get the same questions again. Change it for a different selection.</small>
        </label>
        {errors.selectionSeed && <span id="exam-selection-seed-error" className="field-error">{errors.selectionSeed}</span>}
      </details>

      <p className="setup-total">
        Total marks <strong>{review ? totalMarks ?? 'Fix question marks' : 'after preview'}</strong>
      </p>

      <button
        type="submit"
        disabled={
          isBusy || questionLoadStatus !== 'ready'
        }
      >
        Preview questions
      </button>
      </div>

      {review && (
        <section
          className="exam-review"
          aria-labelledby="exam-review-title"
        >
          <div className="section-heading">
            <div>
              <h3 id="exam-review-title">Review the paper</h3>
            </div>
          </div>

          <SimplePaperReview
            questions={review.map((item) => item.question)}
            settings={settings}
            totalMarks={totalMarks}
            stamp={documentsReady ? 'Ready' : undefined}
            focusedIndex={focusedQuestion}
            onFocusQuestion={setFocusedQuestion}
            emptySlots={Math.max(Object.values(getQuestionQuantities(settings)).reduce((sum, count) => sum + count, 0) - review.length, 0)}
            renderControls={(question, index) => {
              const locked = review[index].locked
              return <>
                <small>
                  {questionTypeLabels[question.type]} · Lesson {question.lesson} · {question.difficulty}
                  {locked && <> · <span className="status-chip">Locked</span></>}
                </small>
                <label>
                  Total marks for question {index + 1}
                  <input type="number" min="1" max="1000" step="1"
                    value={Number.isNaN(question.marks) ? '' : question.marks}
                    onChange={(event) => updateQuestionMarks(question.id, event.target.valueAsNumber)}
                    disabled={isBusy} />
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
              </>
            }}
          />

          <aside className="paper-actions" aria-label="Save and download">
          {(() => {
            const slot = Math.min(Math.max(focusedQuestion, 0), review.length - 1)
            const target = review[slot]
            if (!target) return null
            const candidates = target.locked ? [] : replacementCandidates(review, target.question.id, questions, settings, filters)
            return <section className="replace-panel" aria-labelledby="replace-panel-title">
              <h4 id="replace-panel-title">Replace question {slot + 1}</h4>
              {target.locked
                ? <p className="field-help">Unlock this question to choose a replacement.</p>
                : candidates.length === 0
                  ? <p className="field-help">No other question of this type matches your banks and filters.</p>
                  : <ul className="replace-candidates">
                    {candidates.slice(0, 5).map((candidate) => <li key={candidate.id}>
                      <p className="question-row-prompt">{candidate.prompt}</p>
                      <p className="question-row-meta">Lesson {candidate.lesson} · {candidate.difficulty}</p>
                      <button type="button" className="button-secondary" disabled={isBusy}
                        aria-label={`Use this question instead of question ${slot + 1}: ${candidate.prompt}`}
                        onClick={() => handleReplaceWith(target.question.id, candidate.id)}>Use this question</button>
                    </li>)}
                  </ul>}
              {candidates.length > 5 && <p className="field-help">{candidates.length - 5} more match. Narrow the lesson or difficulty to see others.</p>}
            </section>
          })()}
          <CouponProgress working={isGenerating} steps={['Paper setup', 'Paper reviewed']} />

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
              className={documentsReady ? 'button-secondary' : undefined}
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
                        className={documentsReady ? undefined : 'button-secondary'}
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
          {statusMessage}
          </aside>
        </section>
      )}

      {!review && statusMessage}
    </form>
  )
}
