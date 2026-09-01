import {
  type FormEvent,
  useState,
} from 'react'
import './App.css'
import { sampleQuestions } from './data/sampleQuestions'
import { generateExamDocuments } from './lib/generateExam'
import {
  getFirstValidationError,
  validateExamSettings,
  type ExamSettingsErrors,
} from './lib/validateExamSettings'
import {
  DEFAULT_EXAM_SETTINGS,
  EXAM_LIMITS,
  type ExamSettings,
} from './types/exam'

type GenerationStatus =
  | 'idle'
  | 'generating'
  | 'success'
  | 'error'

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

function App() {
  const [settings, setSettings] = useState<ExamSettings>({
    ...DEFAULT_EXAM_SETTINGS,
  })
  const [errors, setErrors] =
    useState<ExamSettingsErrors>({})
  const [status, setStatus] =
    useState<GenerationStatus>('idle')
  const [message, setMessage] = useState(
    'Enter the test settings, then generate both documents.',
  )

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

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault()

    const nextErrors = validateExamSettings(
      settings,
      sampleQuestions.length,
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
    setMessage('Generating the exam and answer key...')

    try {
      await generateExamDocuments(settings)

      setStatus('success')
      setMessage(
        'Exam and answer key generated successfully.',
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

  return (
    <main>
      <h1>ExamGO</h1>
      <p>Grade 6 Iraqi English monthly-test generator</p>

      <form
        className="card"
        onSubmit={handleSubmit}
        noValidate
        style={{
          display: 'grid',
          gap: '1rem',
          maxWidth: '32rem',
          margin: '0 auto',
        }}
      >
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
          <legend>Prototype scope</legend>
          <p>Grade 6 · Unit 1 · Multiple choice</p>
        </fieldset>

        <label style={fieldStyle}>
          Question quantity
          <input
            type="number"
            min={EXAM_LIMITS.minimumQuestionCount}
            max={EXAM_LIMITS.maximumQuestionCount}
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
            aria-invalid={Boolean(
              errors.marksPerQuestion,
            )}
            style={inputStyle}
          />
          {errors.marksPerQuestion && (
            <span role="alert" style={errorStyle}>
              {errors.marksPerQuestion}
            </span>
          )}
        </label>

        <output>
          Total marks: <strong>{totalMarks}</strong>
        </output>

        <button type="submit" disabled={isGenerating}>
          {isGenerating
            ? 'Generating…'
            : 'Generate Exam + Answer Key'}
        </button>

        <p
          role={status === 'error' ? 'alert' : 'status'}
          aria-live="polite"
        >
          {message}
        </p>
      </form>
    </main>
  )
}

export default App