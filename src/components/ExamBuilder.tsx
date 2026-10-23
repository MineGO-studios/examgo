import { getEligibleSimplePresets } from '../lib/simplePresetRepository'
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  prepareExamQuestions,
  prepareReviewedExamDocuments,
} from '../lib/generateExam'
import {
  downloadExamDocumentPair,
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
  getPaperLengthWarning,
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
import { ChoiceChips, FormGroup, IconButton, Stepper, ToggleChipGroup } from './controls'
import { Icon } from './icons'
import { ErrorSummary } from './ErrorSummary'
import { readSelectionSeed } from '../lib/selectionSeed'
import CouponProgress from './CouponProgress'
import WordFilePreview from './WordFilePreview'
import { questionTypeLabel } from '../lib/questionTypeLabels'
import { useI18n } from '../lib/i18n'
import { localizeAppMessage } from '../lib/appMessages'
import { EXAM_BUILDER_STRINGS } from './ExamBuilder.strings'

type Strings = (typeof EXAM_BUILDER_STRINGS)['en']
/** Status messages resolve at render time, so switching language translates the current message too. */
type Message = (s: Strings) => string

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

interface ExamBuilderProps {
  /** How the paper starts; shown at the top of setup. */
  startOptions?: ReactNode
  reopenedDraft: ReopenedExamDraft | null
  onViewDrafts: () => void
  /** Opens the shared MineGO questions source when approved standalone questions exist. */
  onUseSharedQuestions?: () => void
  /** The signed-in teacher; new papers use this teacher's selection number from Settings. */
  ownerId: string
}

export default function ExamBuilder({
  startOptions,
  reopenedDraft,
  onViewDrafts,
  onUseSharedQuestions,
  ownerId,
}: ExamBuilderProps) {
  const { language } = useI18n()
  const s = EXAM_BUILDER_STRINGS[language]
  const tm = (text: string): string => localizeAppMessage(language, text)
  // Approved standalone supply: null while checking, -1 when it could not be checked.
  const [sharedCount, setSharedCount] = useState<number | null>(null)
  useEffect(() => {
    let active = true
    void getEligibleSimplePresets().then((pool) => { if (active) setSharedCount(pool.length) })
      .catch(() => { if (active) setSharedCount(-1) })
    return () => { active = false }
  }, [])
  const [settings, setSettings] = useState<ExamSettings>(() => ({
    ...DEFAULT_EXAM_SETTINGS,
    selectionSeed: readSelectionSeed(ownerId),
  }))
  const [filters, setFilters] = useState<ExamQuestionFilters>({
    ...DEFAULT_EXAM_QUESTION_FILTERS,
  })
  const [errors, setErrors] =
    useState<ExamSettingsErrors>({})
  const [failedAttempts, setFailedAttempts] = useState(0)
  const [status, setStatus] =
    useState<GenerationStatus>('idle')
  const [message, setMessage] = useState<Message>(() => (t: Strings) => t.loadingQuestions)
  const say = (next: Message): void => setMessage(() => next)
  const [banks, setBanks] = useState<QuestionBank[]>([])
  const [selectedBankId, setSelectedBankId] = useState('')
  const [selectedBankIds, setSelectedBankIds] = useState<string[]>([])
  const bankLoadVersion = useRef(0)
  const [questions, setQuestions] = useState<ExamQuestion[]>([])
  const [review, setReview] = useState<ReviewedQuestion[] | null>(
    null,
  )
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
          say((t: Strings) => t.noBanks)
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
        const reopenedTitle = reopenedDraft?.draft.exam_title
        say((t: Strings) => reopenedTitle !== undefined ? t.reopened(reopenedTitle) : t.activeAvailable(examQuestions.length))
      } catch (error) {
        if (!active) {
          return
        }

        setQuestionLoadStatus('error')
        const reason = getErrorMessage(error)
        say(() => reason)
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
        say((t: Strings) => t.selectionChanged)
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
    say((t: Strings) => t.loadingApproved)

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
      say((t: Strings) => t.activeFromBanks(examQuestions.length, bankIds.length))
    } catch (error) {
      if (loadVersion !== bankLoadVersion.current) return
      setQuestionLoadStatus('error')
      const reason = getErrorMessage(error)
      say(() => reason)
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
    const matching = Object.values(nextAvailableCounts).reduce((sum, count) => sum + count, 0)
    say((t: Strings) => matching > 0 ? t.match(matching) : t.noMatch)
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
      say(() => firstError)
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
      say((t: Strings) => t.previewReady)
    } catch (error) {
      const errorMessage =
        teacherErrorMessage(error, 'Unknown generation error.')

      setStatus('error')
      say((t: Strings) => t.previewFailed(tm(errorMessage)))
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
    say((t: Strings) => t.quantitiesChanged)
  }

  const handleLock = (questionId: string): void => {
    if (!review) return

    setReview(toggleQuestionLock(review, questionId))
    setStatus('idle')
    setDraftSaved(false)
    say((t: Strings) => t.lockUpdated)
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
      catch (error) { throw new Error(s.questionError(index + 1, tm(teacherErrorMessage(error, 'invalid marks')))) }
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
      say((t: Strings) => t.removed)
    } catch (error) {
      setStatus('error')
      const reason = teacherErrorMessage(error, 'Unable to remove question.')
      say(() => reason)
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
      say((t: Strings) => t.replaced)
    } catch (error) {
      setStatus('error')
      const reason = teacherErrorMessage(error, 'Unable to replace question.')
      say(() => reason)
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
      say((t: Strings) => t.replacedChoice)
    } catch (error) {
      setStatus('error')
      const reason = teacherErrorMessage(error, 'Unable to replace question.')
      say(() => reason)
    }
  }

  const handleGenerate = async (): Promise<void> => {
    if (!review) {
      setStatus('error')
      say((t: Strings) => t.previewFirst)
      return
    }

    setStatus('generating')
    say((t: Strings) => t.generatingStatus)

    try {
      validateReviewMarks()
      // Preview first (D8.8): the files are built in the browser and downloaded only when the teacher asks.
      const documents = await prepareReviewedExamDocuments(
        settings,
        review.map((item) => item.question),
      )
      setGeneratedDocuments(documents)
      setDownloadResult(null)
      setStatus('success')
      say((t: Strings) => t.previewReadyStatus)
    } catch (error) {
      const errorMessage =
        teacherErrorMessage(error, 'Unknown generation error.')

      setStatus('error')
      say((t: Strings) => t.generationFailed(tm(errorMessage)))
    }
  }

  const handleDownloadBoth = async (): Promise<void> => {
    if (!generatedDocuments) return
    const delivery = await downloadExamDocumentPair(generatedDocuments)
    setDownloadResult(delivery)
    setStatus(delivery.hasFailures ? 'error' : 'success')
    say((t: Strings) => delivery.hasFailures ? t.blockedStatus : t.readyStatus)
  }

  const handleRetryFailedDownloads = async (): Promise<void> => {
    if (!generatedDocuments || !downloadResult) {
      return
    }

    setStatus('generating')
    say((t: Strings) => t.retrying)

    const nextResult = await retryFailedDocumentDownloads(
      generatedDocuments,
      downloadResult,
    )

    setDownloadResult(nextResult)
    setStatus(nextResult.hasFailures ? 'error' : 'success')
    say((t: Strings) => nextResult.hasFailures ? t.stillBlocked : t.retried)
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
    say((t: Strings) => outcome.status === 'failed' ? t.fileFailed(outcome.filename) : t.fileRequested(outcome.filename))
  }

  const handleSaveDraft = async (): Promise<void> => {
    if (!review) {
      setStatus('error')
      say((t: Strings) => t.previewBeforeSave)
      return
    }

    setStatus('saving')
    say((t: Strings) => t.savingDraft)

    try {
      validateReviewMarks()
      await saveExamDraft(selectedBankId, settings, review, selectedBankIds)
      setStatus('success')
      setDraftSaved(true)
      say((t: Strings) => t.draftSaved)
    } catch (error) {
      setStatus('error')
      const reason = teacherErrorMessage(error, 'Unable to save the exam draft.')
      say(() => reason)
    }
  }

  const totalMarks = review?.every((item) => Number.isSafeInteger(item.question.marks) &&
    item.question.marks >= 1 && item.question.marks <= 1000)
    ? review.reduce((total, item) => total + item.question.marks, 0) : null
  const effectiveQuestionCount = review?.length ?? settings.questionCount
  const paperLengthWarning = getPaperLengthWarning(effectiveQuestionCount)
  const isGenerating = status === 'generating'
  const isSaving = status === 'saving'
  const isBusy = isGenerating || isSaving
  const isLoadingQuestions = questionLoadStatus === 'loading'
  const documentsReady = Boolean(generatedDocuments && !downloadResult?.hasFailures && !isBusy)
  const statusMessage = (
    <p
      className="builder-status"
      role={status === 'error' || questionLoadStatus === 'error' ? 'alert' : 'status'}
      aria-live="polite"
    >
      {tm(message(s))}
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
          <h2>{s.title}</h2>
          <p>{s.lede}</p>
        </div>
        <PaperProgress current={generatedDocuments ? 'download' : review ? 'review' : 'setup'} />
      </div>

      <div className="exam-settings">
      <ErrorSummary title={s.errorTitle} attempt={failedAttempts} items={([
        ['schoolName', 'exam-school-name'], ['examTitle', 'exam-title'], ['teacherName', 'exam-teacher-name'],
        ['questionCount', 'exam-question-count'],
      ] as const).flatMap(([key, target]) => errors[key] ? [{ target, message: tm(errors[key] as string) }] : [])} />
      {!review || showStarts
        ? startOptions
        : startOptions && <button type="button" className="button-quiet start-again" onClick={() => setShowStarts(true)}>{s.startAgain}</button>}
      <FormGroup title={s.details}>
        <label className="text-field">
          {s.school}
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
        {errors.schoolName && <span id="exam-school-name-error" className="field-error">{tm(errors.schoolName)}</span>}

        <label className="text-field">
          {s.testTitle}
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
        {errors.examTitle && <span id="exam-title-error" className="field-error">{tm(errors.examTitle)}</span>}

        <label className="text-field">
          {s.teacher}
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
          <small>{s.teacherHint}</small>
        </label>
        {errors.teacherName && <span id="exam-teacher-name-error" className="field-error">{tm(errors.teacherName)}</span>}
      </FormGroup>

      <FormGroup title={s.questions} aside={<><span className="unit-swatch" style={{ ['--plan-unit' as string]: `var(--eg-unit-${settings.unit})` }} />{s.gradeUnit(settings.unit)}</>}>
        {banks.length > 0 && (
          <ToggleChipGroup legend={s.banks} disabled={isLoadingQuestions || isBusy}
            hint={s.available(Object.values(eligibleQuestionCounts).reduce((sum, count) => sum + count, 0))}
            items={banks.map((bank) => {
              const checked = selectedBankIds.includes(bank.id)
              return { key: bank.id, label: bank.name, checked, disabled: checked && selectedBankIds.length === 1,
                onToggle: () => void changeBanks(checked ? selectedBankIds.filter((id) => id !== bank.id) : [...selectedBankIds, bank.id]) }
            })} />
        )}

        <div className="shared-source">
          {sharedCount === null
            ? <p role="status" className="field-help">{s.checkingShared}</p>
            : sharedCount > 0 && onUseSharedQuestions
              ? <button type="button" className="button-secondary" onClick={onUseSharedQuestions}>{s.useShared(sharedCount)}</button>
              : <div className="source-unavailable" role="group" aria-label={s.shared}>
                  <span className="source-unavailable-title">{s.shared}</span>
                  <span>{sharedCount === -1
                    ? s.sharedFailed
                    : s.sharedNone}</span>
                </div>}
        </div>

        <ChoiceChips legend={s.lesson} disabled={isLoadingQuestions || isBusy} value={filters.lesson}
          onChange={(lesson) => updateFilter('lesson', lesson)}
          options={[{ value: '', label: s.allLessons }, ...availableLessons.map((lesson) => ({ value: lesson, label: s.lessonN(lesson) }))]} />

        <ChoiceChips legend={s.difficulty} disabled={isLoadingQuestions || isBusy} value={filters.difficulty}
          onChange={(difficulty) => updateFilter('difficulty', difficulty)}
          options={[{ value: '', label: s.any }, { value: 'easy', label: s.easy }, { value: 'medium', label: s.medium }, { value: 'hard', label: s.hard }] as { value: ExamQuestionFilters['difficulty']; label: string }[]} />

        <fieldset className="stepper-group" id="exam-question-count" tabIndex={-1}
          aria-describedby={errors.questionCount ? 'exam-question-count-error' : undefined}>
          <legend>{s.howMany}</legend>
          {SIMPLE_QUESTION_TYPES.map((type) => (
            <Stepper key={type} label={questionTypeLabel(type, language)} hint={s.typeAvailable(eligibleQuestionCounts[type])}
              value={getQuestionQuantities(settings)[type]} max={eligibleQuestionCounts[type]}
              disabled={isLoadingQuestions || isBusy} onChange={(value) => updateQuestionQuantity(type, value)} />
          ))}
          {errors.questionCount && <span id="exam-question-count-error" className="field-error">{tm(errors.questionCount)}</span>}
        </fieldset>
        {paperLengthWarning && <p className="page-target-warning" role="status">{tm(paperLengthWarning)}</p>}
      </FormGroup>

      <p className="setup-total">
        {s.totalMarks} <strong>{review ? totalMarks ?? s.fixMarks : s.afterPreview}</strong>
      </p>

      <button
        type="submit"
        disabled={
          isBusy || questionLoadStatus !== 'ready'
        }
      >
        {s.preview}
      </button>
      </div>

      {review && (
        <section
          className="exam-review"
          aria-labelledby="exam-review-title"
        >
          <div className="section-heading">
            <div>
              <h3 id="exam-review-title">{s.review}</h3>
            </div>
          </div>

          {generatedDocuments && <WordFilePreview documents={generatedDocuments} downloaded={Boolean(downloadResult)} busy={isBusy} onDownload={() => void handleDownloadBoth()} />}
          <SimplePaperReview
            onEditDetails={(field) => {
              // Change links (D8.3): bring the setup field into view and focus it; the review keeps its state.
              const element = document.getElementById(field === 'teacher' ? 'exam-teacher-name' : 'exam-title')
              element?.scrollIntoView({ block: 'center', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
              element?.focus({ preventScroll: true })
            }}
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
                  {questionTypeLabel(question.type, language)} · {s.lessonN(question.lesson)} · {s[question.difficulty as 'easy' | 'medium' | 'hard'] ?? question.difficulty}
                  {locked && <> · <span className="status-chip">{s.locked}</span></>}
                </small>
                <label>
                  {s.questionMarks(index + 1)}
                  <input type="number" min="1" max="1000" step="1"
                    value={Number.isNaN(question.marks) ? '' : question.marks}
                    onChange={(event) => updateQuestionMarks(question.id, event.target.valueAsNumber)}
                    disabled={isBusy} />
                </label>
                <div className="review-question-actions icon-actions">
                  <IconButton icon={locked ? 'lock' : 'unlock'} label={s.lockQ(index + 1)} pressed={locked}
                    onClick={() => handleLock(question.id)} disabled={isBusy} />
                  <IconButton icon="replace" label={s.replaceQ(index + 1)}
                    onClick={() => handleReplace(question.id)} disabled={locked || isBusy} />
                  <IconButton icon="delete" label={s.removeQ(index + 1)}
                    onClick={() => handleRemove(question.id)} disabled={locked || isBusy || review.length === 1} />
                </div>
              </>
            }}
          />

          <aside className="paper-actions" aria-label={s.saveAndDownload}>
          {(() => {
            const slot = Math.min(Math.max(focusedQuestion, 0), review.length - 1)
            const target = review[slot]
            if (!target) return null
            const candidates = target.locked ? [] : replacementCandidates(review, target.question.id, questions, settings, filters)
            return <section className="replace-panel" aria-labelledby="replace-panel-title">
              <h4 id="replace-panel-title">{s.replaceTitle(slot + 1)}</h4>
              {target.locked
                ? <p className="field-help">{s.unlockToReplace}</p>
                : candidates.length === 0
                  ? <p className="field-help">{s.noReplacement}</p>
                  : <ul className="replace-candidates">
                    {candidates.slice(0, 5).map((candidate) => <li key={candidate.id}>
                      <p className="question-row-prompt">{candidate.prompt}</p>
                      <p className="question-row-meta">{s.lessonN(candidate.lesson)} · {s[candidate.difficulty as 'easy' | 'medium' | 'hard'] ?? candidate.difficulty}</p>
                      <button type="button" className="button-secondary" disabled={isBusy}
                        aria-label={s.useThisLabel(slot + 1, candidate.prompt)}
                        onClick={() => handleReplaceWith(target.question.id, candidate.id)}>{s.useThis}</button>
                    </li>)}
                  </ul>}
              {candidates.length > 5 && <p className="field-help">{s.moreMatch(candidates.length - 5)}</p>}
            </section>
          })()}
          <CouponProgress working={isGenerating} steps={[s.stepSetup, s.stepReviewed]} pendingLabel={s.preparing} />

          <div className="review-final-actions">
            <button
              type="button"
              className="button-secondary"
              onClick={() => void handleSaveDraft()}
              disabled={isBusy}
            >
              {isSaving ? s.saving : s.saveDraft}
            </button>
            {draftSaved && (
              <button
                type="button"
                className="button-quiet"
                onClick={onViewDrafts}
              >
                {s.viewInPapers}
              </button>
            )}
            <button
              type="button"
              className={documentsReady ? 'button-secondary' : undefined}
              onClick={() => void handleGenerate()}
              disabled={isBusy}
            >
              {isGenerating ? s.generating : s.generate}
            </button>
          </div>

          {generatedDocuments && downloadResult && (
            <section
              className="document-downloads"
              aria-labelledby="document-downloads-title"
            >
              <h4 id="document-downloads-title">{s.prepared}</h4>
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
                        {outcome.status === 'failed' ? s.blocked : s.requested}
                      </span>
                      <IconButton icon="download" label={preparedDocument.kind === 'exam' ? s.downloadExam : s.downloadKey}
                        onClick={() => void handleIndividualDownload(preparedDocument.kind)} disabled={isBusy} />
                    </li>
                  )
                })}
              </ul>
              {downloadResult.hasFailures && (
                <button
                  type="button"
                  className="button-with-icon"
                  onClick={() => void handleRetryFailedDownloads()}
                  disabled={isBusy}
                >
                  <Icon name="reload" />{s.retry}
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
