import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useState,
} from 'react'
import {
  createQuestionBank,
  getQuestionBanks,
  type QuestionBank,
} from '../lib/questionBankRepository'
import {
  createQuestion,
  createQuestions,
  getQuestions,
  updateQuestion,
} from '../lib/questionRepository'
import { parseQuestionCsv } from '../lib/questionCsv'
import {
  getFirstQuestionValidationError,
  questionToInput,
  validateQuestionInput,
  type Question,
  type QuestionInput,
  type QuestionValidationErrors,
} from '../lib/questions'
import {
  addQuestionOption,
  createEmptyQuestionInput,
  removeQuestionOption,
  sortQuestions,
} from '../lib/questionEditor'

type EditorStatus = 'idle' | 'loading' | 'saving' | 'error'

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return 'Something went wrong. Please try again.'
}

export default function QuestionEditor() {
  const [banks, setBanks] = useState<QuestionBank[]>([])
  const [selectedBankId, setSelectedBankId] = useState('')
  const [questions, setQuestions] = useState<Question[]>([])
  const [editingQuestionId, setEditingQuestionId] =
    useState<string | null>(null)
  const [draft, setDraft] = useState<QuestionInput>(() =>
    createEmptyQuestionInput(''),
  )
  const [validationErrors, setValidationErrors] =
    useState<QuestionValidationErrors>({})
  const [newBankName, setNewBankName] = useState('')
  const [status, setStatus] = useState<EditorStatus>('loading')
  const [message, setMessage] = useState(
    'Loading your question banks…',
  )

  useEffect(() => {
    let active = true

    const loadBanks = async (): Promise<void> => {
      try {
        const loadedBanks = await getQuestionBanks()

        if (!active) {
          return
        }

        setBanks(loadedBanks)

        if (loadedBanks.length === 0) {
          setStatus('idle')
          setMessage(
            'Create your first question bank to start adding approved questions.',
          )
          return
        }

        const initialBankId = loadedBanks[0].id
        setSelectedBankId(initialBankId)
        setEditingQuestionId(null)
        setDraft(createEmptyQuestionInput(initialBankId))
        setValidationErrors({})
        setStatus('loading')
        setMessage('Loading questions…')
      } catch (error) {
        if (!active) {
          return
        }

        setStatus('error')
        setMessage(getErrorMessage(error))
      }
    }

    void loadBanks()

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true

    if (!selectedBankId) {
      return () => {
        active = false
      }
    }

    const loadQuestions = async (): Promise<void> => {
      try {
        const loadedQuestions = await getQuestions(selectedBankId)

        if (!active) {
          return
        }

        setQuestions(sortQuestions(loadedQuestions))
        setStatus('idle')
        setMessage(
          loadedQuestions.length === 0
            ? 'This bank has no questions yet.'
            : `${loadedQuestions.length} question${loadedQuestions.length === 1 ? '' : 's'} loaded.`,
        )
      } catch (error) {
        if (!active) {
          return
        }

        setStatus('error')
        setMessage(getErrorMessage(error))
      }
    }

    void loadQuestions()

    return () => {
      active = false
    }
  }, [selectedBankId])

  const updateDraft = <K extends keyof QuestionInput>(
    field: K,
    value: QuestionInput[K],
  ): void => {
    setDraft((current) => ({ ...current, [field]: value }))
    setValidationErrors((current) => ({
      ...current,
      [field]: undefined,
    }))
  }

  const resetDraft = (): void => {
    setEditingQuestionId(null)
    setDraft(createEmptyQuestionInput(selectedBankId))
    setValidationErrors({})
  }

  const selectBank = (bankId: string): void => {
    setSelectedBankId(bankId)
    setQuestions([])
    setEditingQuestionId(null)
    setDraft(createEmptyQuestionInput(bankId))
    setValidationErrors({})
    setStatus('loading')
    setMessage('Loading questions…')
  }

  const handleCreateBank = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault()
    setStatus('saving')
    setMessage('Creating question bank…')

    try {
      const bank = await createQuestionBank(newBankName)
      setBanks((current) =>
        [...current, bank].sort((left, right) =>
          left.name.localeCompare(right.name),
        ),
      )
      setNewBankName('')
      selectBank(bank.id)
    } catch (error) {
      setStatus('error')
      setMessage(getErrorMessage(error))
    }
  }

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault()

    const nextErrors = validateQuestionInput(draft)
    const firstError = getFirstQuestionValidationError(nextErrors)

    if (firstError) {
      setValidationErrors(nextErrors)
      setStatus('error')
      setMessage(firstError)
      return
    }

    setStatus('saving')
    setMessage(
      editingQuestionId
        ? 'Updating question…'
        : 'Saving question…',
    )

    try {
      const savedQuestion = editingQuestionId
        ? await updateQuestion(editingQuestionId, draft)
        : await createQuestion(draft)

      setQuestions((current) =>
        sortQuestions([
          ...current.filter(
            (question) => question.id !== savedQuestion.id,
          ),
          savedQuestion,
        ]),
      )
      resetDraft()
      setStatus('idle')
      setMessage(
        editingQuestionId
          ? 'Question updated successfully.'
          : 'Question saved successfully.',
      )
    } catch (error) {
      setStatus('error')
      setMessage(getErrorMessage(error))
    }
  }

  const handleCsvImport = async (
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> => {
    const input = event.currentTarget
    const file = input.files?.[0]

    if (!file) {
      return
    }

    if (file.size > 1024 * 1024) {
      setStatus('error')
      setMessage('CSV files must be 1 MB or smaller.')
      input.value = ''
      return
    }

    setStatus('saving')
    setMessage(`Importing ${file.name}…`)

    try {
      const parsedQuestions = parseQuestionCsv(
        await file.text(),
        selectedBankId,
      )
      const importedQuestions = await createQuestions(parsedQuestions)

      setQuestions((current) =>
        sortQuestions([...current, ...importedQuestions]),
      )
      setStatus('idle')
      setMessage(
        `${importedQuestions.length} question${importedQuestions.length === 1 ? '' : 's'} imported successfully.`,
      )
    } catch (error) {
      setStatus('error')
      setMessage(getErrorMessage(error))
    } finally {
      input.value = ''
    }
  }

  const editQuestion = (question: Question): void => {
    try {
      setDraft(questionToInput(question))
      setEditingQuestionId(question.id)
      setValidationErrors({})
      setStatus('idle')
      setMessage(`Editing ${question.external_id}.`)
    } catch (error) {
      setStatus('error')
      setMessage(getErrorMessage(error))
    }
  }

  const updateOption = (
    index: number,
    field: 'label' | 'text',
    value: string,
  ): void => {
    const previousLabel = draft.options[index]?.label
    const options = draft.options.map((option, optionIndex) =>
      optionIndex === index
        ? { ...option, [field]: value }
        : option,
    )

    updateDraft('options', options)

    if (
      field === 'label' &&
      previousLabel === draft.correctOptionLabel
    ) {
      updateDraft('correctOptionLabel', value)
    }
  }

  const removeOption = (index: number): void => {
    const removedLabel = draft.options[index]?.label
    const options = removeQuestionOption(draft.options, index)
    updateDraft('options', options)

    if (
      removedLabel &&
      draft.correctOptionLabel === removedLabel &&
      options[0]
    ) {
      updateDraft('correctOptionLabel', options[0].label)
    }
  }

  const isBusy = status === 'loading' || status === 'saving'

  return (
    <section
      className="question-editor"
      aria-labelledby="question-editor-title"
    >
      <div className="section-heading">
        <div>
          <span className="eyebrow">Approved content</span>
          <h2 id="question-editor-title">Question bank</h2>
          <p>
            Create and maintain the trusted questions used in
            ExamGO papers.
          </p>
        </div>
        {banks.length > 0 && (
          <label className="bank-picker">
            Active bank
            <select
              value={selectedBankId}
              disabled={isBusy}
              onChange={(event) =>
                selectBank(event.target.value)
              }
            >
              {banks.map((bank) => (
                <option key={bank.id} value={bank.id}>
                  {bank.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <form className="create-bank" onSubmit={handleCreateBank}>
        <label>
          New Grade 6 English bank
          <input
            type="text"
            value={newBankName}
            maxLength={100}
            required
            placeholder="e.g. Unit 1 approved questions"
            onChange={(event) => setNewBankName(event.target.value)}
          />
        </label>
        <button type="submit" disabled={isBusy}>
          Create bank
        </button>
      </form>

      {selectedBankId && (
        <section className="csv-import" aria-labelledby="csv-import-title">
          <div>
            <h3 id="csv-import-title">Import questions from CSV</h3>
            <p>
              Required headers: external_id, unit, lesson, difficulty,
              prompt, option_a, option_b, and correct_option_label.
            </p>
          </div>
          <label>
            CSV file
            <input
              type="file"
              accept=".csv,text/csv"
              disabled={isBusy}
              onChange={(event) => void handleCsvImport(event)}
            />
          </label>
        </section>
      )}

      <p
        className={`editor-message ${status === 'error' ? 'error' : ''}`}
        role={status === 'error' ? 'alert' : 'status'}
        aria-live="polite"
      >
        {message}
      </p>

      {selectedBankId && (
        <div className="editor-layout">
          <form
            className="question-form"
            onSubmit={handleSubmit}
            noValidate
          >
            <div className="form-title-row">
              <h3>
                {editingQuestionId
                  ? 'Edit question'
                  : 'Add question'}
              </h3>
              {editingQuestionId && (
                <button
                  type="button"
                  className="button-secondary"
                  onClick={resetDraft}
                  disabled={isBusy}
                >
                  Cancel edit
                </button>
              )}
            </div>

            <div className="form-grid">
              <label>
                Question ID
                <input
                  type="text"
                  value={draft.externalId}
                  maxLength={80}
                  placeholder="U1-Q001"
                  aria-invalid={Boolean(
                    validationErrors.externalId,
                  )}
                  onChange={(event) =>
                    updateDraft('externalId', event.target.value)
                  }
                />
                {validationErrors.externalId && (
                  <small className="field-error">
                    {validationErrors.externalId}
                  </small>
                )}
              </label>

              <label>
                Unit
                <input
                  type="number"
                  min="1"
                  max="20"
                  step="1"
                  value={draft.unit}
                  aria-invalid={Boolean(validationErrors.unit)}
                  onChange={(event) =>
                    updateDraft(
                      'unit',
                      event.target.valueAsNumber || 0,
                    )
                  }
                />
                {validationErrors.unit && (
                  <small className="field-error">
                    {validationErrors.unit}
                  </small>
                )}
              </label>

              <label>
                Lesson
                <input
                  type="text"
                  value={draft.lesson}
                  maxLength={40}
                  aria-invalid={Boolean(validationErrors.lesson)}
                  onChange={(event) =>
                    updateDraft('lesson', event.target.value)
                  }
                />
                {validationErrors.lesson && (
                  <small className="field-error">
                    {validationErrors.lesson}
                  </small>
                )}
              </label>

              <label>
                Difficulty
                <select
                  value={draft.difficulty}
                  aria-invalid={Boolean(
                    validationErrors.difficulty,
                  )}
                  onChange={(event) =>
                    updateDraft(
                      'difficulty',
                      event.target.value as QuestionInput['difficulty'],
                    )
                  }
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </label>
            </div>

            <label>
              Question text
              <textarea
                value={draft.prompt}
                maxLength={2000}
                rows={4}
                aria-invalid={Boolean(validationErrors.prompt)}
                onChange={(event) =>
                  updateDraft('prompt', event.target.value)
                }
              />
              {validationErrors.prompt && (
                <small className="field-error">
                  {validationErrors.prompt}
                </small>
              )}
            </label>

            <fieldset className="options-fieldset">
              <legend>Answer options</legend>
              <p className="field-hint">
                Select the radio button beside the correct answer.
              </p>
              {draft.options.map((option, index) => (
                <div className="option-row" key={index}>
                  <input
                    type="radio"
                    name="correct-option"
                    value={option.label}
                    checked={
                      draft.correctOptionLabel === option.label
                    }
                    aria-label={`Mark option ${index + 1} as correct`}
                    onChange={() =>
                      updateDraft(
                        'correctOptionLabel',
                        option.label,
                      )
                    }
                  />
                  <input
                    className="option-label"
                    type="text"
                    value={option.label}
                    maxLength={10}
                    aria-label={`Option ${index + 1} label`}
                    onChange={(event) =>
                      updateOption(index, 'label', event.target.value)
                    }
                  />
                  <input
                    type="text"
                    value={option.text}
                    aria-label={`Option ${index + 1} answer text`}
                    onChange={(event) =>
                      updateOption(index, 'text', event.target.value)
                    }
                  />
                  <button
                    type="button"
                    className="button-quiet"
                    disabled={draft.options.length <= 2}
                    aria-label={`Remove option ${index + 1}`}
                    onClick={() => removeOption(index)}
                  >
                    Remove
                  </button>
                </div>
              ))}
              {(validationErrors.options ||
                validationErrors.correctOptionLabel) && (
                <small className="field-error">
                  {validationErrors.options ??
                    validationErrors.correctOptionLabel}
                </small>
              )}
              <button
                type="button"
                className="button-secondary"
                disabled={draft.options.length >= 6}
                onClick={() =>
                  updateDraft(
                    'options',
                    addQuestionOption(draft.options),
                  )
                }
              >
                Add option
              </button>
            </fieldset>

            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={draft.isActive}
                onChange={(event) =>
                  updateDraft('isActive', event.target.checked)
                }
              />
              Active and available for exam selection
            </label>

            <button type="submit" disabled={isBusy}>
              {status === 'saving'
                ? 'Saving…'
                : editingQuestionId
                  ? 'Update question'
                  : 'Save question'}
            </button>
          </form>

          <section
            className="question-list"
            aria-labelledby="saved-questions-title"
          >
            <div className="form-title-row">
              <h3 id="saved-questions-title">Saved questions</h3>
              <span>{questions.length}</span>
            </div>
            {questions.length === 0 ? (
              <p className="empty-state">
                Add the first approved question to this bank.
              </p>
            ) : (
              <div className="question-cards">
                {questions.map((question) => (
                  <article className="question-card" key={question.id}>
                    <div className="question-card-heading">
                      <strong>{question.external_id}</strong>
                      <span
                        className={`status-chip ${question.is_active ? 'active' : ''}`}
                      >
                        {question.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <p>{question.prompt}</p>
                    <small>
                      Unit {question.unit} · Lesson {question.lesson} ·{' '}
                      {question.difficulty}
                    </small>
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={isBusy}
                      onClick={() => editQuestion(question)}
                    >
                      Edit
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  )
}
