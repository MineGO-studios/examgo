import {
  type FormEvent,
  useEffect,
  useState,
} from 'react'
import {
  generateReviewedExamDocuments,
  prepareExamQuestions,
} from '../lib/generateExam'
import { saveExamDraft } from '../lib/examDraftRepository'
import { getQuestionBanks } from '../lib/questionBankRepository'
import { getActiveQuestions } from '../lib/questionRepository'
import { questionToExamQuestion } from '../lib/questions'
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
  type ExamQuestionFilters,
  type ExamSettings,
} from '../types/exam'
import type { ExamQuestion } from '../types/question'
import type { QuestionBank } from '../lib/questionBankRepository'

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
  return error instanceof Error
    ? error.message
    : 'Unable to load approved questions. Please try again.'
}

function getAvailableQuestionCount(
  questions: readonly ExamQuestion[],
  unit: number,
  filters: ExamQuestionFilters,
): number {
  return questions.filter(
    (question) =>
      question.unit === unit &&
      question.type === filters.questionType &&
      (!filters.lesson || question.lesson === filters.lesson) &&
      (!filters.difficulty ||
        question.difficulty === filters.difficulty),
  ).length
}

export default function ExamBuilder() {
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
  const [questions, setQuestions] = useState<ExamQuestion[]>([])
  const [review, setReview] = useState<ReviewedQuestion[] | null>(
    null,
  )
  const [pageTarget, setPageTarget] = useState<PageTarget>(1)
  const [questionLoadStatus, setQuestionLoadStatus] =
    useState<QuestionLoadStatus>('loading')

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

        const bankId = loadedBanks[0].id
        const rows = await getActiveQuestions(bankId)

        if (!active) {
          return
        }

        const examQuestions = rows.map(questionToExamQuestion)
        const availableCount = getAvailableQuestionCount(
          examQuestions,
          DEFAULT_EXAM_SETTINGS.unit,
          DEFAULT_EXAM_QUESTION_FILTERS,
        )
        setSelectedBankId(bankId)
        setQuestions(examQuestions)
        setSettings((current) =>
          availableCount > 0 &&
          current.questionCount > availableCount
            ? { ...current, questionCount: availableCount }
            : current,
        )
        setQuestionLoadStatus('ready')
        setMessage(
          `${examQuestions.length} active question${examQuestions.length === 1 ? '' : 's'} available from ${loadedBanks[0].name}.`,
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
  }, [])

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

  const changeBank = async (bankId: string): Promise<void> => {
    const bank = banks.find((candidate) => candidate.id === bankId)
    setSelectedBankId(bankId)
    setQuestions([])
    setReview(null)
    setQuestionLoadStatus('loading')
    setStatus('idle')
    setMessage('Loading approved questions…')

    try {
      const rows = await getActiveQuestions(bankId)
      const examQuestions = rows.map(questionToExamQuestion)
      const availableCount = getAvailableQuestionCount(
        examQuestions,
        settings.unit,
        filters,
      )
      setQuestions(examQuestions)
      setSettings((current) =>
        availableCount > 0 &&
        current.questionCount > availableCount
          ? { ...current, questionCount: availableCount }
          : current,
      )
      setQuestionLoadStatus('ready')
      setMessage(
        `${examQuestions.length} active question${examQuestions.length === 1 ? '' : 's'} available${bank ? ` from ${bank.name}` : ''}.`,
      )
    } catch (error) {
      setQuestionLoadStatus('error')
      setMessage(getErrorMessage(error))
    }
  }

  const eligibleQuestionCount = getAvailableQuestionCount(
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
            question.type === filters.questionType,
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
    const nextAvailableCount = getAvailableQuestionCount(
      questions,
      settings.unit,
      nextFilters,
    )

    setFilters(nextFilters)
    setSettings((current) =>
      nextAvailableCount > 0 &&
      current.questionCount > nextAvailableCount
        ? { ...current, questionCount: nextAvailableCount }
        : current,
    )
    setErrors((current) => ({
      ...current,
      questionCount: undefined,
    }))
    setStatus('idle')
    setReview(null)
    setMessage(
      nextAvailableCount > 0
        ? `${nextAvailableCount} approved question${nextAvailableCount === 1 ? '' : 's'} match the selected controls.`
        : 'No approved questions match the selected controls.',
    )
  }

  const handleSubmit = (
    event: FormEvent<HTMLFormElement>,
  ): void => {
    event.preventDefault()

    const nextErrors = validateExamSettings(
      settings,
      eligibleQuestionCount,
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
      setStatus('success')
      setMessage(
        'Question preview ready. Lock, remove, or replace questions before generating.',
      )
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Unknown generation error.'

      setStatus('error')
      setMessage(`Preview failed: ${errorMessage}`)
    }
  }

  const handleLock = (questionId: string): void => {
    if (!review) return

    setReview(toggleQuestionLock(review, questionId))
    setStatus('idle')
    setMessage('Question lock updated.')
  }

  const handleRemove = (questionId: string): void => {
    if (!review) return

    try {
      const nextReview = removeQuestionFromReview(review, questionId)
      setReview(nextReview)
      setSettings((current) => ({
        ...current,
        questionCount: nextReview.length,
      }))
      setStatus('idle')
      setMessage('Question removed from this exam preview.')
    } catch (error) {
      setStatus('error')
      setMessage(
        error instanceof Error
          ? error.message
          : 'Unable to remove question.',
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
      setMessage('Question replaced with another eligible question.')
    } catch (error) {
      setStatus('error')
      setMessage(
        error instanceof Error
          ? error.message
          : 'Unable to replace question.',
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
      await generateReviewedExamDocuments(
        settings,
        review.map((item) => item.question),
      )
      setStatus('success')
      setMessage(
        'Exam and answer key generated successfully from the reviewed questions.',
      )
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Unknown generation error.'

      setStatus('error')
      setMessage(`Generation failed: ${errorMessage}`)
    }
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
      await saveExamDraft(selectedBankId, settings, review)
      setStatus('success')
      setMessage('Exam draft saved successfully.')
    } catch (error) {
      setStatus('error')
      setMessage(
        error instanceof Error
          ? error.message
          : 'Unable to save the exam draft.',
      )
    }
  }

  const totalMarks =
    (review?.length ?? settings.questionCount) *
    settings.marksPerQuestion
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
            your approved question bank.
          </p>
        </div>
      </div>

      {banks.length > 0 && (
        <label style={fieldStyle}>
          Question bank
          <select
            value={selectedBankId}
            disabled={isLoadingQuestions || isBusy}
            onChange={(event) => void changeBank(event.target.value)}
            style={inputStyle}
          >
            {banks.map((bank) => (
              <option key={bank.id} value={bank.id}>
                {bank.name}
              </option>
            ))}
          </select>
          <small>
            {eligibleQuestionCount} active Unit {settings.unit}{' '}
            question{eligibleQuestionCount === 1 ? '' : 's'}
          </small>
        </label>
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

      <fieldset>
        <legend>V1 scope</legend>
        <p>Grade 6 · Unit 1</p>
      </fieldset>

      <div className="exam-filter-grid">
        <label style={fieldStyle}>
          Question type
          <select
            value={filters.questionType}
            disabled={isLoadingQuestions || isBusy}
            onChange={(event) =>
              updateFilter(
                'questionType',
                event.target.value as ExamQuestionFilters['questionType'],
              )
            }
            style={inputStyle}
          >
            <option value="multiple-choice">Multiple choice</option>
          </select>
        </label>

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

      <label style={fieldStyle}>
        Question quantity
        <input
          type="number"
          min={EXAM_LIMITS.minimumQuestionCount}
          max={Math.min(
            EXAM_LIMITS.maximumQuestionCount,
            Math.max(1, eligibleQuestionCount),
          )}
          step="1"
          value={settings.questionCount}
          onChange={(event) =>
            updateSetting(
              'questionCount',
              event.target.valueAsNumber || 0,
            )
          }
          aria-invalid={Boolean(errors.questionCount)}
          style={inputStyle}
        />
        {errors.questionCount && (
          <span role="alert" style={errorStyle}>
            {errors.questionCount}
          </span>
        )}
      </label>

      <label style={fieldStyle}>
        Marks per question
        <input
          type="number"
          min={EXAM_LIMITS.minimumMarksPerQuestion}
          max={EXAM_LIMITS.maximumMarksPerQuestion}
          step="1"
          value={settings.marksPerQuestion}
          onChange={(event) =>
            updateSetting(
              'marksPerQuestion',
              event.target.valueAsNumber || 0,
            )
          }
          aria-invalid={Boolean(errors.marksPerQuestion)}
          style={inputStyle}
        />
        {errors.marksPerQuestion && (
          <span role="alert" style={errorStyle}>
            {errors.marksPerQuestion}
          </span>
        )}
      </label>

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
          The same seed produces the same question selection.
        </small>
        {errors.selectionSeed && (
          <span role="alert" style={errorStyle}>
            {errors.selectionSeed}
          </span>
        )}
      </label>

      <output>
        Total marks: <strong>{totalMarks}</strong>
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
                    {index + 1}. {question.id}
                  </strong>
                  {locked && (
                    <span className="status-chip">Locked</span>
                  )}
                </div>
                <p>{question.prompt}</p>
                <small>
                  Lesson {question.lesson} · {question.difficulty}
                </small>
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
