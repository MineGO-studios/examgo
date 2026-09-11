import {
  type FormEvent,
  useEffect,
  useState,
} from 'react'
import { generateExamDocuments } from '../lib/generateExam'
import { getQuestionBanks } from '../lib/questionBankRepository'
import { getActiveQuestions } from '../lib/questionRepository'
import { questionToExamQuestion } from '../lib/questions'
import {
  getFirstValidationError,
  validateExamSettings,
  type ExamSettingsErrors,
} from '../lib/validateExamSettings'
import {
  DEFAULT_EXAM_SETTINGS,
  EXAM_LIMITS,
  type ExamSettings,
} from '../types/exam'
import type { ExamQuestion } from '../types/question'
import type { QuestionBank } from '../lib/questionBankRepository'

type GenerationStatus =
  | 'idle'
  | 'generating'
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
): number {
  return questions.filter(
    (question) =>
      question.unit === unit &&
      question.type === 'multiple-choice',
  ).length
}

export default function ExamBuilder() {
  const [settings, setSettings] = useState<ExamSettings>({
    ...DEFAULT_EXAM_SETTINGS,
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
  }

  const changeBank = async (bankId: string): Promise<void> => {
    const bank = banks.find((candidate) => candidate.id === bankId)
    setSelectedBankId(bankId)
    setQuestions([])
    setQuestionLoadStatus('loading')
    setStatus('idle')
    setMessage('Loading approved questions…')

    try {
      const rows = await getActiveQuestions(bankId)
      const examQuestions = rows.map(questionToExamQuestion)
      const availableCount = getAvailableQuestionCount(
        examQuestions,
        settings.unit,
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
  )

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
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

    setErrors({})
    setStatus('generating')
    setMessage('Generating the exam and answer key…')

    try {
      await generateExamDocuments(settings, questions)

      setStatus('success')
      setMessage(
        'Exam and answer key generated successfully from your approved questions.',
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

  const totalMarks =
    settings.questionCount * settings.marksPerQuestion
  const isGenerating = status === 'generating'
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
            disabled={isLoadingQuestions || isGenerating}
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
        <p>Grade 6 · Unit 1 · Multiple choice</p>
      </fieldset>

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

      <button
        type="submit"
        disabled={
          isGenerating || questionLoadStatus !== 'ready'
        }
      >
        {isGenerating
          ? 'Generating…'
          : 'Generate Exam + Answer Key'}
      </button>

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
