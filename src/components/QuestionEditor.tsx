import {
  type FormEvent,
  lazy,
  Suspense,
  useEffect,
  useState,
} from 'react'
import {
  createQuestionBank,
  createQuestionBankFromBanks,
  getQuestionBanks,
  type QuestionBank,
} from '../lib/questionBankRepository'
import {
  createQuestion,
  updateQuestion,
} from '../lib/questionRepository'
import { getQuestionsForBanks } from '../lib/questionMembershipRepository'
import { getStructuredQuestionPoolForBanks } from '../lib/passageGroupRepository'
import { EMPTY_BANK_FILTERS, bankQuestionCounts, browseBankQuestions, type BankQuestionFilters } from '../lib/questionBankBrowse'
import {
  getFirstQuestionValidationError,
  questionToInput,
  validateQuestionInput,
  type Question,
  type QuestionInput,
  type QuestionValidationErrors,
  type WritingGuidanceInput,
} from '../lib/questions'
import { MANUAL_MARKING_NOTE } from '../domain/questionDomain'
import {
  addQuestionOption,
  createEmptyQuestionInput,
  removeQuestionOption,
  sortQuestions,
} from '../lib/questionEditor'
import { teacherErrorMessage } from '../lib/safeErrorDetails'

type EditorStatus = 'idle' | 'loading' | 'saving' | 'error'
/** The bank opens to its question list; authoring, import, linked groups and bank management are focused views. */
type BankView = 'list' | 'question' | 'import' | 'groups' | 'manage'

const PassageGroupEditor = lazy(() => import('./PassageGroupEditor'))
const QuestionImportPreview = lazy(() => import('./QuestionImportPreview'))

function getErrorMessage(error: unknown): string {
  return teacherErrorMessage(error, 'Something went wrong. Please try again.')
}

const questionTypeLabels: Record<QuestionInput['questionType'], string> = {
  'multiple-choice': 'Multiple choice',
  binary: 'True/False or Yes/No',
  'short-answer': 'Short open answer',
  completion: 'Word-bank completion',
  'odd-word': 'Odd-word selection',
  'word-relationship': 'Word relationship / transformation',
  rewrite: 'Punctuation / capitalization rewrite',
  'extended-writing': 'Extended writing / composition',
  matching: 'Match List A and List B',
}

function splitNonEmptyLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

export default function QuestionEditor({ ownerId }: { ownerId: string }) {
  const [banks, setBanks] = useState<QuestionBank[]>([])
  const [selectedBankId, setSelectedBankId] = useState('')
  const [questions, setQuestions] = useState<Question[]>([])
  const [questionReload, setQuestionReload] = useState(0)
  const [editingQuestionId, setEditingQuestionId] =
    useState<string | null>(null)
  const [draft, setDraft] = useState<QuestionInput>(() =>
    createEmptyQuestionInput(''),
  )
  const [validationErrors, setValidationErrors] =
    useState<QuestionValidationErrors>({})
  const [newBankName, setNewBankName] = useState('')
  const [combinedBankName, setCombinedBankName] = useState('')
  const [sourceBankIds, setSourceBankIds] = useState<string[]>([])
  const [status, setStatus] = useState<EditorStatus>('loading')
  const [message, setMessage] = useState(
    'Loading your question banks…',
  )
  const [view, setView] = useState<BankView>('list')
  const [filters, setFilters] = useState<BankQuestionFilters>(EMPTY_BANK_FILTERS)
  const [page, setPage] = useState(1)
  const [linkedIds, setLinkedIds] = useState<ReadonlySet<string> | null>(null)

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
        const loadedQuestions = await getQuestionsForBanks([selectedBankId])

        if (!active) {
          return
        }

        setQuestions(sortQuestions(loadedQuestions))
        void getStructuredQuestionPoolForBanks([selectedBankId]).then((pool) => {
          const standalone = new Set(pool.standaloneQuestionIds)
          if (active) setLinkedIds(new Set(loadedQuestions.filter((question) => !standalone.has(question.id)).map((question) => question.id)))
        }).catch(() => { if (active) setLinkedIds(null) })
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
  }, [selectedBankId, questionReload])

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
    setLinkedIds(null)
    setFilters(EMPTY_BANK_FILTERS)
    setPage(1)
    setView('list')
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
      setView('list')
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

  const handleComposeBank = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    setStatus('saving')
    setMessage('Creating combined bank…')
    try {
      const bank = await createQuestionBankFromBanks(combinedBankName, sourceBankIds)
      setBanks((current) => [...current, bank].sort((a, b) => a.name.localeCompare(b.name)))
      setCombinedBankName('')
      setSourceBankIds([])
      selectBank(bank.id)
    } catch (error) {
      setStatus('error')
      setMessage(getErrorMessage(error))
    }
  }

  const editQuestion = (question: Question): void => {
    try {
      setDraft(questionToInput(question))
      setEditingQuestionId(question.id)
      setValidationErrors({})
      setView('question')
      setStatus('idle')
      setMessage('Editing the selected question.')
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

  const showList = (): void => {
    resetDraft()
    setView('list')
    setStatus('idle')
    setMessage(`${questions.length} question${questions.length === 1 ? '' : 's'} in this bank.`)
  }

  const addMatchingPair = () => {
    const leftId = crypto.randomUUID(); const rightId = crypto.randomUUID()
    setDraft((current) => ({ ...current,
      matchingLeft: [...(current.matchingLeft ?? []), { id: leftId, text: '' }],
      matchingRight: [...(current.matchingRight ?? []), { id: rightId, text: '' }],
      matchingPairs: [...(current.matchingPairs ?? []), { leftId, rightId }],
    }))
  }
  const removeMatchingPair = (leftId: string) => {
    setDraft((current) => {
      const rightId = current.matchingPairs?.find((pair) => pair.leftId === leftId)?.rightId
      return { ...current,
        matchingLeft: current.matchingLeft?.filter((item) => item.id !== leftId),
        matchingRight: current.matchingRight?.filter((item) => item.id !== rightId),
        matchingPairs: current.matchingPairs?.filter((pair) => pair.leftId !== leftId),
      }
    })
  }
  const setMatchingTarget = (leftId: string, rightId: string) => {
    setDraft((current) => {
      const oldTarget = current.matchingPairs?.find((pair) => pair.leftId === leftId)?.rightId
      const otherLeft = current.matchingPairs?.find((pair) => pair.rightId === rightId)?.leftId
      return { ...current, matchingPairs: current.matchingPairs?.map((pair) =>
        pair.leftId === leftId ? { ...pair, rightId } : pair.leftId === otherLeft && oldTarget ? { ...pair, rightId: oldTarget } : pair) }
    })
  }

  return (
    <section
      className="question-editor"
      aria-labelledby="question-editor-title"
    >
      <div className="section-heading">
        <div>
          <span className="eyebrow">Question content</span>
          <h2 id="question-editor-title">Question bank</h2>
          <p>
            Create and maintain your questions used in
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

      {banks.length > 0 && selectedBankId && <div className="recovery-actions bank-actions" role="group" aria-label="Question bank actions">
        <button type="button" aria-pressed={view === 'list'} disabled={isBusy} onClick={showList}>Questions</button>
        <button type="button" aria-pressed={view === 'question' && !editingQuestionId} disabled={isBusy} onClick={() => { resetDraft(); setView('question') }}>Add question</button>
        <button type="button" aria-pressed={view === 'import'} disabled={isBusy} onClick={() => setView('import')}>Import file</button>
        <button type="button" aria-pressed={view === 'groups'} disabled={isBusy} onClick={() => setView('groups')}>Passages and linked exercises</button>
        <button type="button" className="button-secondary" aria-pressed={view === 'manage'} disabled={isBusy} onClick={() => setView('manage')}>Manage banks</button>
      </div>}

      <p
        className={`editor-message ${status === 'error' ? 'error' : ''}`}
        role={status === 'error' ? 'alert' : 'status'}
        aria-live="polite"
      >
        {message}
      </p>

      {(banks.length === 0 || view === 'manage') && <section className="bank-focus" aria-label="Manage banks">
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

        {banks.length > 0 && <details className="create-bank">
          <summary>Create bank from existing banks</summary>
          <p>The new bank shares the questions currently in your selected banks. Editing a source question updates every bank that shares it; later source additions are not added automatically. Removing a question from this collection keeps the source question. Inactive questions and archived banks are excluded from new papers; finalized papers keep their captured questions.</p>
          <form onSubmit={(event) => void handleComposeBank(event)}>
            <label>New bank name<input type="text" value={combinedBankName} maxLength={100} required
              onChange={(event) => setCombinedBankName(event.target.value)} /></label>
            <fieldset disabled={isBusy}>
              <legend>Source banks</legend>
              {banks.map((bank) => <label key={bank.id} className="checkbox-field">
                <input type="checkbox" checked={sourceBankIds.includes(bank.id)}
                  onChange={(event) => setSourceBankIds((current) => event.target.checked
                    ? [...current, bank.id] : current.filter((id) => id !== bank.id))} />
                {bank.name}
              </label>)}
            </fieldset>
            <button type="submit" disabled={isBusy || sourceBankIds.length === 0}>Create combined bank</button>
          </form>
        </details>}

        <p className="field-help">Preset review and publication for MineGO reviewers is under Account.</p>
      </section>}

      {view === 'import' && <section className="bank-focus" aria-label="Import file">
        {selectedBankId && <Suspense fallback={<p role="status">Loading intake preview…</p>}>
          <QuestionImportPreview key={selectedBankId} bankId={selectedBankId}
            onCommitted={() => setQuestionReload((current) => current + 1)}
            bankName={banks.find((bank) => bank.id === selectedBankId)?.name ?? ''} />
        </Suspense>}
      </section>}

      {selectedBankId && view === 'question' && (
        <div className="editor-layout question-view">
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
              <button
                type="button"
                className="button-secondary"
                onClick={showList}
                disabled={isBusy}
              >
                {editingQuestionId ? 'Cancel edit' : 'Back to questions'}
              </button>
            </div>

            <div className="form-grid">
              <label>
                Question type
                <select
                  value={draft.questionType}
                  aria-invalid={Boolean(validationErrors.questionType)}
                  onChange={(event) =>
                    updateDraft(
                      'questionType',
                      event.target.value as QuestionInput['questionType'],
                    )
                  }
                >
                  <option value="multiple-choice">Multiple choice</option>
                  <option value="binary">True/False or Yes/No</option>
                  <option value="short-answer">Short open answer</option>
                  <option value="matching">Match List A and List B</option>
                  <option value="completion">Word-bank completion</option>
                  <option value="odd-word">Odd-word selection</option>
                  <option value="word-relationship">
                    Word relationship / transformation
                  </option>
                  <option value="rewrite">
                    Punctuation / capitalization rewrite
                  </option>
                  <option value="extended-writing">
                    Extended writing / composition
                  </option>
                </select>
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

            {draft.questionType === 'multiple-choice' && (
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
            )}

            {draft.questionType === 'binary' && (
              <fieldset className="options-fieldset">
                <legend>Binary answer</legend>
                <label>
                  Student labels
                  <select
                    value={draft.binaryLabelMode}
                    onChange={(event) =>
                      updateDraft(
                        'binaryLabelMode',
                        event.target.value as QuestionInput['binaryLabelMode'],
                      )
                    }
                  >
                    <option value="true-false">True / False</option>
                    <option value="yes-no">Yes / No</option>
                  </select>
                </label>
                <label>
                  Correct answer
                  <select
                    value={draft.binaryAnswer ? 'true' : 'false'}
                    onChange={(event) =>
                      updateDraft('binaryAnswer', event.target.value === 'true')
                    }
                  >
                    <option value="true">
                      {draft.binaryLabelMode === 'yes-no' ? 'Yes' : 'True'}
                    </option>
                    <option value="false">
                      {draft.binaryLabelMode === 'yes-no' ? 'No' : 'False'}
                    </option>
                  </select>
                </label>
              </fieldset>
            )}

            {draft.questionType === 'short-answer' && (
              <fieldset className="options-fieldset">
                <legend>Reference answer</legend>
                <label>
                  Correct answer
                  <textarea
                    value={draft.canonicalAnswer}
                    rows={3}
                    maxLength={2000}
                    aria-invalid={Boolean(validationErrors.canonicalAnswer)}
                    onChange={(event) =>
                      updateDraft('canonicalAnswer', event.target.value)
                    }
                  />
                  {validationErrors.canonicalAnswer && (
                    <small className="field-error">{validationErrors.canonicalAnswer}</small>
                  )}
                </label>
                <label>
                  Other accepted answers (one per line)
                  <textarea
                    value={draft.approvedVariants.join('\n')}
                    rows={3}
                    onChange={(event) =>
                      updateDraft('approvedVariants', event.target.value.split(/\r?\n/))
                    }
                  />
                  {validationErrors.approvedVariants && (
                    <small className="field-error">{validationErrors.approvedVariants}</small>
                  )}
                </label>
                <label>
                  Answer lines
                  <input
                    type="number"
                    min="1"
                    max="20"
                    step="1"
                    value={draft.answerLines}
                    onChange={(event) =>
                      updateDraft('answerLines', event.target.valueAsNumber || 0)
                    }
                  />
                </label>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={draft.caseSensitive}
                    onChange={(event) =>
                      updateDraft('caseSensitive', event.target.checked)
                    }
                  />
                  Accepted answers require the same capital letters
                </label>
              </fieldset>
            )}

            {draft.questionType === 'completion' && (
              <fieldset className="options-fieldset">
                <legend>Word-bank completion</legend>
                <label>
                  Ordered completion items
                  <textarea
                    value={draft.completionText ?? ''}
                    rows={6}
                    aria-invalid={Boolean(validationErrors.completionText)}
                    onChange={(event) => {
                      const text = event.target.value
                      const itemCount = splitNonEmptyLines(text).length
                      const blankIds = Array.from(
                        { length: itemCount },
                        (_, index) =>
                          draft.completionBlankIds?.[index] ??
                          `blank-${index + 1}`,
                      )
                      const answers = Object.fromEntries(
                        blankIds.map((id) => [
                          id,
                          draft.completionAnswers?.[id] ?? '',
                        ]),
                      )
                      setDraft((current) => ({
                        ...current,
                        completionText: text,
                        completionBlankIds: blankIds,
                        completionAnswers: answers,
                      }))
                      setValidationErrors((current) => ({
                        ...current,
                        completionText: undefined,
                        completionBlankIds: undefined,
                        completionAnswers: undefined,
                      }))
                    }}
                  />
                  <small className="field-hint">
                    One source-approved item per line, in the exact displayed order.
                    Preserve its visible blank and punctuation.
                  </small>
                  {validationErrors.completionText && (
                    <small className="field-error">
                      {validationErrors.completionText}
                    </small>
                  )}
                </label>
                <label>
                  Word bank (one supplied word per line)
                  <textarea
                    value={(draft.completionWordBank ?? []).join('\n')}
                    rows={4}
                    aria-invalid={Boolean(validationErrors.completionWordBank)}
                    onChange={(event) =>
                      updateDraft(
                        'completionWordBank',
                        splitNonEmptyLines(event.target.value),
                      )
                    }
                  />
                  {validationErrors.completionWordBank && (
                    <small className="field-error">
                      {validationErrors.completionWordBank}
                    </small>
                  )}
                </label>
                <label>
                  Supplied word-bank order
                  <select
                    value={draft.completionWordBankOrder ?? 'unordered'}
                    onChange={(event) =>
                      updateDraft(
                        'completionWordBankOrder',
                        event.target.value as 'ordered' | 'unordered',
                      )
                    }
                  >
                    <option value="unordered">Unordered</option>
                    <option value="ordered">Ordered</option>
                  </select>
                </label>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={draft.completionAllowWordReuse ?? false}
                    onChange={(event) =>
                      updateDraft(
                        'completionAllowWordReuse',
                        event.target.checked,
                      )
                    }
                  />
                  The supplied exercise allows word reuse
                </label>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={draft.completionRequireAllWordsUsed ?? false}
                    onChange={(event) =>
                      updateDraft(
                        'completionRequireAllWordsUsed',
                        event.target.checked,
                      )
                    }
                  />
                  The supplied instruction requires every bank word
                </label>
                <div className="form-grid">
                  {(draft.completionBlankIds ?? []).map((id, index) => (
                    <label key={id}>
                      Correct answer for item {index + 1}
                      <input
                        type="text"
                        value={draft.completionAnswers?.[id] ?? ''}
                        onChange={(event) =>
                          updateDraft('completionAnswers', {
                            ...(draft.completionAnswers ?? {}),
                            [id]: event.target.value,
                          })
                        }
                      />
                    </label>
                  ))}
                </div>
                {(validationErrors.completionBlankIds ||
                  validationErrors.completionAnswers) && (
                  <small className="field-error">
                    {validationErrors.completionBlankIds ??
                      validationErrors.completionAnswers}
                  </small>
                )}
              </fieldset>
            )}

            {draft.questionType === 'matching' && (
              <fieldset className="options-fieldset">
                <legend>List A / List B matching</legend>
                <p className="field-hint">Each List A item must have one unique List B answer. List B is printed in its own order and can be shuffled reproducibly when a paper is generated.</p>
                {(draft.matchingLeft ?? []).map((left, index) => <div className="form-grid" key={left.id}>
                  <label>List A {index + 1}<input value={left.text} maxLength={1000} onChange={(event) => updateDraft('matchingLeft', (draft.matchingLeft ?? []).map((item) => item.id === left.id ? { ...item, text: event.target.value } : item))} /></label>
                  <label>Correct List B item<select value={draft.matchingPairs?.find((pair) => pair.leftId === left.id)?.rightId ?? ''} onChange={(event) => setMatchingTarget(left.id, event.target.value)}>
                    {(draft.matchingRight ?? []).map((right, rightIndex) => <option key={right.id} value={right.id}>{String.fromCharCode(97 + rightIndex)}. {right.text || '(empty)'}</option>)}
                  </select></label>
                  <button type="button" className="button-secondary" disabled={(draft.matchingLeft?.length ?? 0) <= 2} onClick={() => removeMatchingPair(left.id)}>Remove pair {index + 1}</button>
                </div>)}
                <h4>List B display order</h4>
                {(draft.matchingRight ?? []).map((right, index) => <div className="form-grid" key={right.id}>
                  <label>List B {String.fromCharCode(97 + index)}<input value={right.text} maxLength={1000} onChange={(event) => updateDraft('matchingRight', (draft.matchingRight ?? []).map((item) => item.id === right.id ? { ...item, text: event.target.value } : item))} /></label>
                  <button type="button" className="button-secondary" disabled={index === 0} onClick={() => { const next = [...(draft.matchingRight ?? [])]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; updateDraft('matchingRight', next) }}>Move up</button>
                  <button type="button" className="button-secondary" disabled={index === (draft.matchingRight?.length ?? 0) - 1} onClick={() => { const next = [...(draft.matchingRight ?? [])]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; updateDraft('matchingRight', next) }}>Move down</button>
                </div>)}
                <button type="button" className="button-secondary" disabled={(draft.matchingLeft?.length ?? 0) >= 20} onClick={addMatchingPair}>Add pair</button>
                {(validationErrors.matchingLeft || validationErrors.matchingRight || validationErrors.matchingPairs) && <small className="field-error">{validationErrors.matchingLeft ?? validationErrors.matchingRight ?? validationErrors.matchingPairs}</small>}
              </fieldset>
            )}

            {draft.questionType === 'odd-word' && (
              <fieldset className="options-fieldset">
                <legend>Odd-word selection</legend>
                <label>
                  Ordered word set (one supplied word per line)
                  <textarea
                    value={(draft.oddWords ?? []).join('\n')}
                    rows={5}
                    aria-invalid={Boolean(validationErrors.oddWords)}
                    onChange={(event) =>
                      updateDraft(
                        'oddWords',
                        splitNonEmptyLines(event.target.value),
                      )
                    }
                  />
                  {validationErrors.oddWords && (
                    <small className="field-error">
                      {validationErrors.oddWords}
                    </small>
                  )}
                </label>
                <label>
                  Correct odd word
                  <input
                    type="text"
                    value={draft.oddWordAnswer ?? ''}
                    aria-invalid={Boolean(validationErrors.oddWordAnswer)}
                    onChange={(event) =>
                      updateDraft('oddWordAnswer', event.target.value)
                    }
                  />
                  {validationErrors.oddWordAnswer && (
                    <small className="field-error">
                      {validationErrors.oddWordAnswer}
                    </small>
                  )}
                </label>
              </fieldset>
            )}

            {draft.questionType === 'word-relationship' && (
              <fieldset className="options-fieldset">
                <legend>Word relationship / transformation</legend>
                <p className="field-hint">
                  Keep the exact incomplete target pair and punctuation in the
                  question text above.
                </p>
                <div className="form-grid">
                  {[0, 1].map((index) => (
                    <label key={index}>
                      Demonstrated pair — form {index + 1}
                      <input
                        type="text"
                        value={draft.relationshipWords?.[index] ?? ''}
                        onChange={(event) => {
                          const words = [
                            ...(draft.relationshipWords ?? ['', '']),
                          ] as [string, string]
                          words[index] = event.target.value
                          updateDraft('relationshipWords', words)
                        }}
                      />
                    </label>
                  ))}
                </div>
                {validationErrors.relationshipWords && (
                  <small className="field-error">
                    {validationErrors.relationshipWords}
                  </small>
                )}
                <label>
                  Correct missing form
                  <input
                    type="text"
                    value={draft.relationshipAcceptedAnswers?.[0] ?? ''}
                    aria-invalid={Boolean(
                      validationErrors.relationshipAcceptedAnswers,
                    )}
                    onChange={(event) =>
                      updateDraft(
                        'relationshipAcceptedAnswers',
                        event.target.value ? [event.target.value] : [],
                      )
                    }
                  />
                  {validationErrors.relationshipAcceptedAnswers && (
                    <small className="field-error">
                      {validationErrors.relationshipAcceptedAnswers}
                    </small>
                  )}
                </label>
              </fieldset>
            )}

            {draft.questionType === 'rewrite' && (
              <fieldset className="options-fieldset">
                <legend>Punctuation / capitalization rewrite</legend>
                <p className="field-hint">
                  Keep the exact original text in the question text field above.
                </p>
                <label>
                  Supplied rewrite instruction
                  <textarea
                    value={draft.rewriteInstruction ?? ''}
                    rows={2}
                    aria-invalid={Boolean(validationErrors.rewriteInstruction)}
                    onChange={(event) =>
                      updateDraft('rewriteInstruction', event.target.value)
                    }
                  />
                  {validationErrors.rewriteInstruction && (
                    <small className="field-error">
                      {validationErrors.rewriteInstruction}
                    </small>
                  )}
                </label>
                <label>
                  Correct rewritten sentence
                  <textarea
                    value={draft.rewriteAcceptedAnswers?.[0] ?? ''}
                    rows={2}
                    aria-invalid={Boolean(
                      validationErrors.rewriteAcceptedAnswers,
                    )}
                    onChange={(event) =>
                      updateDraft(
                        'rewriteAcceptedAnswers',
                        event.target.value ? [event.target.value] : [],
                      )
                    }
                  />
                  {validationErrors.rewriteAcceptedAnswers && (
                    <small className="field-error">
                      {validationErrors.rewriteAcceptedAnswers}
                    </small>
                  )}
                </label>
              </fieldset>
            )}

            {draft.questionType === 'extended-writing' && (
              <fieldset className="options-fieldset">
                <legend>Extended writing / composition</legend>
                <p className="field-hint">
                  The question text above is one supplied writing prompt. A-or-B
                  choice is represented by the paper structure, not inside this
                  question payload.
                </p>
                <div className="form-grid">
                  <label>
                    Minimum words (only when supplied)
                    <input
                      type="number"
                      min="1"
                      max="1000"
                      value={draft.writingMinimumWords ?? ''}
                      onChange={(event) =>
                        updateDraft(
                          'writingMinimumWords',
                          event.target.value ? event.target.valueAsNumber : null,
                        )
                      }
                    />
                  </label>
                  <label>
                    Maximum words (only when supplied)
                    <input
                      type="number"
                      min="1"
                      max="2000"
                      value={draft.writingMaximumWords ?? ''}
                      onChange={(event) =>
                        updateDraft(
                          'writingMaximumWords',
                          event.target.value ? event.target.valueAsNumber : null,
                        )
                      }
                    />
                  </label>
                </div>
                {(validationErrors.writingMinimumWords ||
                  validationErrors.writingMaximumWords) && (
                  <small className="field-error">
                    {validationErrors.writingMinimumWords ??
                      validationErrors.writingMaximumWords}
                  </small>
                )}
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={draft.writingGuidance?.manualOnly ?? true}
                    onChange={(event) => {
                      const guidance: WritingGuidanceInput = {
                        modelAnswer:
                          draft.writingGuidance?.modelAnswer ?? '',
                        rubricCriteria:
                          draft.writingGuidance?.rubricCriteria ?? [],
                        manualOnly: event.target.checked,
                      }
                      updateDraft('writingGuidance', guidance)
                    }}
                  />
                  No approved model or rubric is supplied
                </label>
                {(draft.writingGuidance?.manualOnly ?? true) ? (
                  <p className="field-hint">
                    Answer key: {MANUAL_MARKING_NOTE}
                  </p>
                ) : (
                  <>
                    <label>
                      Teacher-approved model answer (optional)
                      <textarea
                        value={draft.writingGuidance?.modelAnswer ?? ''}
                        rows={5}
                        onChange={(event) =>
                          updateDraft('writingGuidance', {
                            modelAnswer: event.target.value,
                            rubricCriteria:
                              draft.writingGuidance?.rubricCriteria ?? [],
                            manualOnly: false,
                          })
                        }
                      />
                    </label>
                    <label>
                      Teacher-approved rubric criteria (one per line, optional)
                      <textarea
                        value={(
                          draft.writingGuidance?.rubricCriteria ?? []
                        ).join('\n')}
                        rows={4}
                        onChange={(event) =>
                          updateDraft('writingGuidance', {
                            modelAnswer:
                              draft.writingGuidance?.modelAnswer ?? '',
                            rubricCriteria: splitNonEmptyLines(
                              event.target.value,
                            ),
                            manualOnly: false,
                          })
                        }
                      />
                    </label>
                  </>
                )}
                {validationErrors.writingGuidance && (
                  <small className="field-error">
                    {validationErrors.writingGuidance}
                  </small>
                )}
              </fieldset>
            )}

            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={draft.isActive}
                onChange={(event) =>
                  updateDraft('isActive', event.target.checked)
                }
              />
              Active in this question bank
            </label>

            <button type="submit" disabled={isBusy}>
              {status === 'saving'
                ? 'Saving…'
                : editingQuestionId
                  ? 'Update question'
                  : 'Save question'}
            </button>
          </form>

        </div>
      )}
      {selectedBankId && view === 'list' && status === 'loading' && questions.length === 0 &&
        <div className="empty-state" aria-busy="true">Loading this bank's questions…</div>}
      {selectedBankId && view === 'list' && !(status === 'loading' && questions.length === 0) && (() => {
        const counts = bankQuestionCounts(questions, linkedIds)
        const result = browseBankQuestions(questions, filters, linkedIds, page)
        const types = [...new Set(questions.map((question) => question.question_type))].sort()
        const setFilter = (patch: Partial<BankQuestionFilters>) => { setFilters((current) => ({ ...current, ...patch })); setPage(1) }
        return <section className="question-list" aria-labelledby="saved-questions-title">
          <div className="form-title-row">
            <h3 id="saved-questions-title">Questions in this bank</h3>
          </div>
          <dl className="bank-counts" aria-label="Question counts">
            <div><dt>Total</dt><dd>{counts.total}</dd></div>
            <div><dt>Usable in new papers</dt><dd>{counts.usable}</dd></div>
            <div><dt>Inactive (excluded from new papers)</dt><dd>{counts.inactive}</dd></div>
            <div><dt>In linked passages or exercises</dt><dd>{counts.linked ?? 'Not available'}</dd></div>
          </dl>
          <p className="field-help">Linked questions are used only together with their complete passage or exercise. Imported files waiting for review are not counted here; open Import file to review them.</p>
          <div className="bank-filters" role="search" aria-label="Find questions">
            <label>Search<input type="search" value={filters.search} placeholder="Question text, identifier, unit or lesson"
              onChange={(event) => setFilter({ search: event.target.value })} /></label>
            <label>Question type<select value={filters.type} onChange={(event) => setFilter({ type: event.target.value })}>
              <option value="">All types</option>
              {types.map((type) => <option key={type} value={type}>{questionTypeLabels[type as QuestionInput['questionType']] ?? type}</option>)}
            </select></label>
            <label>Status<select value={filters.status} onChange={(event) => setFilter({ status: event.target.value as BankQuestionFilters['status'] })}>
              <option value="all">All</option><option value="usable">Usable</option><option value="inactive">Inactive</option>
            </select></label>
            <label>Context<select value={filters.linked} disabled={!linkedIds} onChange={(event) => setFilter({ linked: event.target.value as BankQuestionFilters['linked'] })}>
              <option value="all">All</option><option value="standalone">Standalone questions</option><option value="linked">In linked passages or exercises</option>
            </select></label>
          </div>
          <p role="status">{result.matching === 0 ? (questions.length ? 'No questions match these filters.' : 'This bank has no questions yet.')
            : `Showing ${result.first}–${result.last} of ${result.matching} matching question${result.matching === 1 ? '' : 's'}.`}</p>
          {questions.length === 0 ? (
            <div className="empty-state">
              <p>Add the first approved question to this bank, or import a file.</p>
              <div className="recovery-actions">
                <button type="button" onClick={() => { resetDraft(); setView('question') }}>Add question</button>
                <button type="button" className="button-secondary" onClick={() => setView('import')}>Import file</button>
              </div>
            </div>
          ) : (
            <div className="question-cards">
              {result.rows.map((question) => (
                    <article className="question-card" key={question.id}>
                      <div className="question-card-heading">
                        <strong>
                          {questionTypeLabels[question.question_type as QuestionInput['questionType']] ?? question.question_type} · Unit {question.unit} · Lesson{' '}
                          {question.lesson}
                        </strong>
                        <span
                          className={`status-chip ${question.is_active ? 'active' : ''}`}
                        >
                          {question.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <p>{question.prompt}</p>
                      <small>{question.difficulty} difficulty · Marks set when composing an exam</small>
                      {linkedIds?.has(question.id) && <small> · In a linked passage or exercise: usable only with its complete group</small>}
                      {question.bank_id === selectedBankId ? <button
                        type="button"
                        className="button-secondary"
                        disabled={isBusy}
                        onClick={() => editQuestion(question)}
                      >
                        Edit
                      </button> : <button type="button" className="button-secondary" disabled={isBusy}
                        onClick={() => selectBank(question.bank_id)}>Open source bank to edit</button>}
                    </article>
              ))}
            </div>
          )}
          {result.pages > 1 && <div className="recovery-actions" aria-label="Question pages">
            <button type="button" className="button-secondary" disabled={result.page <= 1} onClick={() => setPage(result.page - 1)}>Previous 25</button>
            <span>Page {result.page} of {result.pages}</span>
            <button type="button" className="button-secondary" disabled={result.page >= result.pages} onClick={() => setPage(result.page + 1)}>Next 25</button>
          </div>}
        </section>
      })()}
      {selectedBankId && view === 'groups' && <Suspense fallback={<p role="status">Loading passage groups…</p>}>
        <PassageGroupEditor key={`${selectedBankId}:${questions.map((question) => `${question.id}:${question.current_revision}`).join(',')}`}
          ownerId={ownerId} bankId={selectedBankId} onOpenSourceBank={selectBank} />
      </Suspense>}
    </section>
  )
}
