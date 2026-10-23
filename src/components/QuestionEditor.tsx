import { ChoiceChips, Stepper } from './controls'
import { Icon } from './icons'
import { QUESTION_TYPE_GROUPS, questionTypeLabel, questionTypeUse } from '../lib/questionTypeLabels'
import { useI18n } from '../lib/i18n'
import { localizeAppMessage } from '../lib/appMessages'
import { QUESTION_BANK_STRINGS } from './QuestionBanks.strings'
import QuestionBankBrowser from './QuestionBankBrowser'
import { presetBankViews, presetUnitContent } from '../lib/presetBankViews'
import PublishedPresetGroups from './PublishedPresetGroups'
import { getPresetBanks, getPresetBankBrowser, type PresetBank, type PresetBrowserQuestion, type PresetBrowserGroup } from '../lib/presetBankRepository'
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
import { EMPTY_BANK_FILTERS, type BankQuestionFilters } from '../lib/questionBankBrowse'
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
type Strings = (typeof QUESTION_BANK_STRINGS)['en']
/** Messages resolve at render time so a language switch translates the current one. */
type Message = (s: Strings) => string
/** The bank opens to its question list; authoring, import, linked groups and bank management are focused views. */
type BankView = 'list' | 'question' | 'import' | 'groups' | 'manage'

const PassageGroupEditor = lazy(() => import('./PassageGroupEditor'))
const QuestionImportPreview = lazy(() => import('./QuestionImportPreview'))

function getErrorMessage(error: unknown): string {
  return teacherErrorMessage(error, 'Something went wrong. Please try again.')
}


function splitNonEmptyLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

export default function QuestionEditor({ ownerId, onUsePresets }: { ownerId: string; onUsePresets: () => void }) {
  const { language } = useI18n()
  const s = QUESTION_BANK_STRINGS[language]
  const tm = (text: string | undefined): string => text ? localizeAppMessage(language, text) : ''
  const typeName = (type: string) => questionTypeLabel(type, language)
  const [banks, setBanks] = useState<QuestionBank[]>([])
  const [selectedBankId, setSelectedBankId] = useState('')
  const [presetBanks,setPresetBanks]=useState<PresetBank[]>([])
  const [presetError,setPresetError]=useState('')
  const [presetQuestions,setPresetQuestions]=useState<PresetBrowserQuestion[]>([])
  const [presetGroups,setPresetGroups]=useState<PresetBrowserGroup[]>([])
  const [presetReload,setPresetReload]=useState(0)
  const presetViews = presetBankViews(presetBanks)
  const selectedPreset = presetViews.find(bank => bank.value === selectedBankId)
  const selectedPresetBankId = selectedPreset?.bankId
  const isPresetBank = !!selectedPreset
  const presetContent = presetUnitContent(presetQuestions, presetGroups, selectedPreset?.unit)
  const allBanks = [...banks.map(bank => ({value:bank.id,label:bank.name})), ...presetViews]
  useEffect(()=>{let active=true
    void getPresetBanks().then(value=>{if(active){setPresetBanks(value);setPresetError('');setSelectedBankId(current=>current|| (value[0]?'preset:'+value[0].id:''))}})
      .catch(()=>{if(active)setPresetError('failed')})
    return()=>{active=false}
  },[presetReload])
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
  const [message, setMessage] = useState<Message>(() => (t: Strings) => t.loadingBanks)
  const say = (next: Message): void => setMessage(() => next)
  const sayText = (text: string): void => setMessage(() => () => text)
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
          say((t) => t.firstBank)
          return
        }

        const initialBankId = loadedBanks[0].id
        setSelectedBankId(initialBankId)
        setEditingQuestionId(null)
        setDraft(createEmptyQuestionInput(initialBankId))
        setValidationErrors({})
        setStatus('loading')
        say((t) => t.loadingQuestions)
      } catch (error) {
        if (!active) {
          return
        }

        setStatus('error')
        sayText(getErrorMessage(error))
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
        if(selectedPresetBankId) {
          const result=await getPresetBankBrowser(selectedPresetBankId)
          if(!active)return
          setPresetQuestions(result.questions);setPresetGroups(result.groups)
          setLinkedIds(new Set(result.questions.filter(q=>q.linked).map(q=>q.id)))
          setStatus('idle');sayText('');return
        }
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
        // The list header carries the counts; the message line stays for saves and errors.
        sayText('')
      } catch (error) {
        if (!active) {
          return
        }

        setStatus('error')
        sayText(getErrorMessage(error))
      }
    }

    void loadQuestions()

    return () => {
      active = false
    }
  }, [selectedBankId, selectedPresetBankId, questionReload])

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
    setPresetQuestions([])
    setPresetGroups([])
    setLinkedIds(null)
    setFilters(EMPTY_BANK_FILTERS)
    setPage(1)
    setView('list')
    setEditingQuestionId(null)
    setDraft(createEmptyQuestionInput(bankId))
    setValidationErrors({})
    setStatus('loading')
    say((t) => t.loadingQuestions)
  }

  const handleCreateBank = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault()
    setStatus('saving')
    say((t) => t.creatingBank)

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
      sayText(getErrorMessage(error))
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
      sayText(firstError)
      return
    }

    setStatus('saving')
    say((t) => editingQuestionId ? t.updating : t.savingQuestion)

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
      say((t) => editingQuestionId ? t.updated : t.saved)
    } catch (error) {
      setStatus('error')
      sayText(getErrorMessage(error))
    }
  }

  const handleComposeBank = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    setStatus('saving')
    say((t) => t.creatingCombined)
    try {
      const bank = await createQuestionBankFromBanks(combinedBankName, sourceBankIds)
      setBanks((current) => [...current, bank].sort((a, b) => a.name.localeCompare(b.name)))
      setCombinedBankName('')
      setSourceBankIds([])
      selectBank(bank.id)
    } catch (error) {
      setStatus('error')
      sayText(getErrorMessage(error))
    }
  }

  const editQuestion = (question: Question): void => {
    try {
      setDraft(questionToInput(question))
      setEditingQuestionId(question.id)
      setValidationErrors({})
      setView('question')
      setStatus('idle')
      say((t) => t.editing)
    } catch (error) {
      setStatus('error')
      sayText(getErrorMessage(error))
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
    sayText('')
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
      <header className="qb-head">
        <div>
          <h2 id="question-editor-title" className="qb-title">{s.title}</h2>
          <p className="qb-lede">{selectedBankId && allBanks.length > 0
            ? <>{s.inBank((isPresetBank?presetContent.questions:questions).length)} <bdi>{selectedPreset?.label.replace(' (Preset)', '') ?? banks.find((bank) => bank.id === selectedBankId)?.name ?? s.thisBank}</bdi></>
            : s.lede}</p>
        </div>
        {!isPresetBank && banks.length > 0 && selectedBankId && <button type="button" className="qb-add" disabled={isBusy} onClick={() => { resetDraft(); setView('question') }}>
          <Icon name="add" />{s.addQuestion}
        </button>}
      </header>

      {presetError && <div role="alert"><p>{s.presetFailed}</p><button type="button" className="button-secondary" onClick={()=>setPresetReload(n=>n+1)}>{s.retryPresets}</button></div>}
      {allBanks.length > 0 && <ChoiceChips legend={s.activeBank} value={selectedBankId} disabled={isBusy} maxInlineOptions={6}
        onChange={(bankId) => selectBank(bankId)}
        options={allBanks} />}

      {isPresetBank && <div className="field-help"><p>{s.presetNote}</p>
        <div className="recovery-actions"><button type="button" className="button-secondary" onClick={onUsePresets}>{s.createFromPresets}</button>
        <button type="button" className="button-secondary" disabled={isBusy} onClick={()=>{setPresetQuestions([]);setPresetGroups([]);setStatus('loading');setQuestionReload(n=>n+1)}}>{s.reloadBank}</button></div></div>}

      {allBanks.length > 0 && selectedBankId && (() => {
        const sections = [['list', s.questionsSection], ['import', s.importSection], ['groups', s.passagesSection], ['manage', s.manageSection]] as const
        const open = (key: typeof sections[number][0]) => key === 'list' ? showList() : setView(key)
        return <div className="qb-sections">
          <div className="eg-seg qb-seg" role="group" aria-label={s.sections}>
            {sections.map(([key, label]) => <button key={key} type="button" aria-pressed={view === key} disabled={isBusy || (isPresetBank && (key==='import' || key==='manage'))} onClick={() => open(key)}>{label}</button>)}
          </div>
          <label className="eg-select qb-section-select">
            <span className="visually-hidden">{s.section}</span>
            <select value={sections.some(([key]) => key === view) ? view : ''} disabled={isBusy}
              onChange={(event) => open(event.target.value as typeof sections[number][0])}>
              {!sections.some(([key]) => key === view) && <option value="" disabled>{editingQuestionId ? s.editingQuestion : s.addingQuestion}</option>}
              {sections.map(([key, label]) => <option key={key} value={key} disabled={isPresetBank && (key==='import' || key==='manage')}>{label}</option>)}
            </select>
          </label>
        </div>
      })()}

      <p
        className={`editor-message ${status === 'error' ? 'error' : ''}`}
        role={status === 'error' ? 'alert' : 'status'}
        aria-live="polite"
      >
        {tm(message(s))}
      </p>

      {!isPresetBank && (banks.length === 0 || view === 'manage') && <section className="bank-focus" aria-label={s.manage}>
        <form className="create-bank" onSubmit={handleCreateBank}>
          <label>
            {s.newBank}
            <input
              type="text"
              value={newBankName}
              maxLength={100}
              required
              placeholder={s.newBankPlaceholder}
              onChange={(event) => setNewBankName(event.target.value)}
            />
          </label>
          <button type="submit" disabled={isBusy}>
            {s.createBank}
          </button>
        </form>

        {banks.length > 0 && <details className="create-bank">
          <summary>{s.combine}</summary>
          <p>{s.combineNote}</p>
          <form onSubmit={(event) => void handleComposeBank(event)}>
            <label>{s.combinedName}<input type="text" value={combinedBankName} maxLength={100} required
              onChange={(event) => setCombinedBankName(event.target.value)} /></label>
            <fieldset disabled={isBusy}>
              <legend>{s.sourceBanks}</legend>
              {banks.map((bank) => <label key={bank.id} className="checkbox-field">
                <input type="checkbox" checked={sourceBankIds.includes(bank.id)}
                  onChange={(event) => setSourceBankIds((current) => event.target.checked
                    ? [...current, bank.id] : current.filter((id) => id !== bank.id))} />
                {bank.name}
              </label>)}
            </fieldset>
            <button type="submit" disabled={isBusy || sourceBankIds.length === 0}>{s.createCombined}</button>
          </form>
        </details>}

        <p className="field-help">{s.reviewerNote}</p>
      </section>}

      {!isPresetBank && view === 'import' && <section className="bank-focus" aria-label={s.importFile}>
        {selectedBankId && <Suspense fallback={<p role="status">{s.loadingImport}</p>}>
          <QuestionImportPreview key={selectedBankId} bankId={selectedBankId}
            onCommitted={() => setQuestionReload((current) => current + 1)}
            bankName={banks.find((bank) => bank.id === selectedBankId)?.name ?? ''} />
        </Suspense>}
      </section>}

      {!isPresetBank && selectedBankId && view === 'question' && (
        <div className="editor-layout question-view">
          <form
            className="question-form"
            onSubmit={handleSubmit}
            noValidate
          >
            <div className="form-title-row">
              <h3>
                {editingQuestionId ? s.editTitle : s.addTitle}
              </h3>
              <button
                type="button"
                className="button-quiet"
                onClick={showList}
                disabled={isBusy}
              >
                {editingQuestionId ? s.cancelEdit : s.backToQuestions}
              </button>
            </div>

            <label className="text-field eg-select question-type-chooser">
              {s.questionType}
              <select value={draft.questionType} aria-describedby="question-type-use"
                onChange={(event) => updateDraft('questionType', event.target.value as QuestionInput['questionType'])}>
                {QUESTION_TYPE_GROUPS.map((group) => <optgroup key={group.id} label={group.label[language]}>
                  {group.types.map((type) => <option key={type} value={type}>{typeName(type)}</option>)}
                </optgroup>)}
              </select>
              <small id="question-type-use" className="field-help">{questionTypeUse(draft.questionType, language)}</small>
            </label>

            <div className="question-placement">
              <Stepper label={s.unit} value={draft.unit} min={1} max={20} onChange={(unit) => updateDraft('unit', unit)} />
              {validationErrors.unit && <small className="field-error">{tm(validationErrors.unit)}</small>}
              <label className="text-field">
                {s.lesson}
                <input
                  type="text"
                  value={draft.lesson}
                  maxLength={40}
                  aria-invalid={Boolean(validationErrors.lesson)}
                  onChange={(event) => updateDraft('lesson', event.target.value)}
                />
                {validationErrors.lesson && <small className="field-error">{tm(validationErrors.lesson)}</small>}
              </label>
            </div>

            <ChoiceChips legend={s.difficulty} value={draft.difficulty}
              onChange={(difficulty) => updateDraft('difficulty', difficulty)}
              options={[{ value: 'easy', label: s.easy }, { value: 'medium', label: s.medium }, { value: 'hard', label: s.hard }] as { value: QuestionInput['difficulty']; label: string }[]} />

            <label>
              {s.questionText}
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
                  {tm(validationErrors.prompt)}
                </small>
              )}
            </label>

            {draft.questionType === 'multiple-choice' && (
            <fieldset className="options-fieldset">
              <legend>{s.answerOptions}</legend>
              <p className="field-hint">
                {s.optionsHint}
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
                    aria-label={s.markCorrect(index + 1)}
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
                    aria-label={s.optionLabel(index + 1)}
                    onChange={(event) =>
                      updateOption(index, 'label', event.target.value)
                    }
                  />
                  <input
                    type="text"
                    value={option.text}
                    aria-label={s.optionText(index + 1)}
                    onChange={(event) =>
                      updateOption(index, 'text', event.target.value)
                    }
                  />
                  <button
                    type="button"
                    className="button-quiet"
                    disabled={draft.options.length <= 2}
                    aria-label={s.removeOption(index + 1)}
                    onClick={() => removeOption(index)}
                  >
                    {s.remove}
                  </button>
                </div>
              ))}
              {(validationErrors.options ||
                validationErrors.correctOptionLabel) && (
                <small className="field-error">
                  {tm(validationErrors.options ??
                    validationErrors.correctOptionLabel)}
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
                {s.addOption}
              </button>
            </fieldset>
            )}

            {draft.questionType === 'binary' && (
              <fieldset className="options-fieldset">
                <legend>{s.binaryAnswer}</legend>
                <label>
                  {s.studentLabels}
                  <select
                    value={draft.binaryLabelMode}
                    onChange={(event) =>
                      updateDraft(
                        'binaryLabelMode',
                        event.target.value as QuestionInput['binaryLabelMode'],
                      )
                    }
                  >
                    <option value="true-false">{s.trueFalse}</option>
                    <option value="yes-no">{s.yesNo}</option>
                  </select>
                </label>
                <label>
                  {s.correctAnswer}
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
                <legend>{s.referenceAnswer}</legend>
                <label>
                  {s.correctAnswer}
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
                    <small className="field-error">{tm(validationErrors.canonicalAnswer)}</small>
                  )}
                </label>
                <label>
                  {s.otherAccepted}
                  <textarea
                    value={draft.approvedVariants.join('\n')}
                    rows={3}
                    onChange={(event) =>
                      updateDraft('approvedVariants', event.target.value.split(/\r?\n/))
                    }
                  />
                  {validationErrors.approvedVariants && (
                    <small className="field-error">{tm(validationErrors.approvedVariants)}</small>
                  )}
                </label>
                <label>
                  {s.answerLines}
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
                  {s.caseSensitive}
                </label>
              </fieldset>
            )}

            {draft.questionType === 'completion' && (
              <fieldset className="options-fieldset">
                <legend>{typeName('completion')}</legend>
                <label>
                  {s.completionItems}
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
                    {s.completionHint}
                  </small>
                  {validationErrors.completionText && (
                    <small className="field-error">
                      {tm(validationErrors.completionText)}
                    </small>
                  )}
                </label>
                <label>
                  {s.wordBank}
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
                      {tm(validationErrors.completionWordBank)}
                    </small>
                  )}
                </label>
                <label>
                  {s.wordBankOrder}
                  <select
                    value={draft.completionWordBankOrder ?? 'unordered'}
                    onChange={(event) =>
                      updateDraft(
                        'completionWordBankOrder',
                        event.target.value as 'ordered' | 'unordered',
                      )
                    }
                  >
                    <option value="unordered">{s.unordered}</option>
                    <option value="ordered">{s.ordered}</option>
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
                  {s.allowReuse}
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
                  {s.requireAll}
                </label>
                <div className="form-grid">
                  {(draft.completionBlankIds ?? []).map((id, index) => (
                    <label key={id}>
                      {s.correctForItem(index + 1)}
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
                    {tm(validationErrors.completionBlankIds ??
                      validationErrors.completionAnswers)}
                  </small>
                )}
              </fieldset>
            )}

            {draft.questionType === 'matching' && (
              <fieldset className="options-fieldset">
                <legend>{s.matchingLegend}</legend>
                <p className="field-hint">{s.matchingHint}</p>
                {(draft.matchingLeft ?? []).map((left, index) => <div className="form-grid" key={left.id}>
                  <label>{s.listA(index + 1)}<input value={left.text} maxLength={1000} onChange={(event) => updateDraft('matchingLeft', (draft.matchingLeft ?? []).map((item) => item.id === left.id ? { ...item, text: event.target.value } : item))} /></label>
                  <label>{s.correctListB}<select value={draft.matchingPairs?.find((pair) => pair.leftId === left.id)?.rightId ?? ''} onChange={(event) => setMatchingTarget(left.id, event.target.value)}>
                    {(draft.matchingRight ?? []).map((right, rightIndex) => <option key={right.id} value={right.id}>{String.fromCharCode(97 + rightIndex)}. {right.text || s.empty}</option>)}
                  </select></label>
                  <button type="button" className="button-secondary" disabled={(draft.matchingLeft?.length ?? 0) <= 2} onClick={() => removeMatchingPair(left.id)}>{s.removePair(index + 1)}</button>
                </div>)}
                <h4>{s.listBOrder}</h4>
                {(draft.matchingRight ?? []).map((right, index) => <div className="form-grid" key={right.id}>
                  <label>{s.listB(String.fromCharCode(97 + index))}<input value={right.text} maxLength={1000} onChange={(event) => updateDraft('matchingRight', (draft.matchingRight ?? []).map((item) => item.id === right.id ? { ...item, text: event.target.value } : item))} /></label>
                  <button type="button" className="button-secondary" disabled={index === 0} onClick={() => { const next = [...(draft.matchingRight ?? [])]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; updateDraft('matchingRight', next) }}>{s.moveUp}</button>
                  <button type="button" className="button-secondary" disabled={index === (draft.matchingRight?.length ?? 0) - 1} onClick={() => { const next = [...(draft.matchingRight ?? [])]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; updateDraft('matchingRight', next) }}>{s.moveDown}</button>
                </div>)}
                <button type="button" className="button-secondary" disabled={(draft.matchingLeft?.length ?? 0) >= 20} onClick={addMatchingPair}>{s.addPair}</button>
                {(validationErrors.matchingLeft || validationErrors.matchingRight || validationErrors.matchingPairs) && <small className="field-error">{tm(validationErrors.matchingLeft ?? validationErrors.matchingRight ?? validationErrors.matchingPairs)}</small>}
              </fieldset>
            )}

            {draft.questionType === 'odd-word' && (
              <fieldset className="options-fieldset">
                <legend>{typeName('odd-word')}</legend>
                <label>
                  {s.oddWords}
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
                      {tm(validationErrors.oddWords)}
                    </small>
                  )}
                </label>
                <label>
                  {s.correctOdd}
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
                      {tm(validationErrors.oddWordAnswer)}
                    </small>
                  )}
                </label>
              </fieldset>
            )}

            {draft.questionType === 'word-relationship' && (
              <fieldset className="options-fieldset">
                <legend>{typeName('word-relationship')}</legend>
                <p className="field-hint">
                  {s.relationshipHint}
                </p>
                <div className="form-grid">
                  {[0, 1].map((index) => (
                    <label key={index}>
                      {s.demonstrated(index + 1)}
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
                    {tm(validationErrors.relationshipWords)}
                  </small>
                )}
                <label>
                  {s.correctMissing}
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
                      {tm(validationErrors.relationshipAcceptedAnswers)}
                    </small>
                  )}
                </label>
              </fieldset>
            )}

            {draft.questionType === 'rewrite' && (
              <fieldset className="options-fieldset">
                <legend>{s.rewriteLegend}</legend>
                <p className="field-hint">
                  {s.rewriteHint}
                </p>
                <label>
                  {s.rewriteInstruction}
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
                      {tm(validationErrors.rewriteInstruction)}
                    </small>
                  )}
                </label>
                <label>
                  {s.correctRewrite}
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
                      {tm(validationErrors.rewriteAcceptedAnswers)}
                    </small>
                  )}
                </label>
              </fieldset>
            )}

            {draft.questionType === 'extended-writing' && (
              <fieldset className="options-fieldset">
                <legend>{typeName('extended-writing')}</legend>
                <p className="field-hint">
                  {s.writingHint}
                </p>
                <div className="form-grid">
                  <label>
                    {s.minWords}
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
                    {s.maxWords}
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
                    {tm(validationErrors.writingMinimumWords ??
                      validationErrors.writingMaximumWords)}
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
                  {s.manualOnly}
                </label>
                {(draft.writingGuidance?.manualOnly ?? true) ? (
                  <p className="field-hint">
                    {s.answerKeyNote} <bdi>{MANUAL_MARKING_NOTE}</bdi>
                  </p>
                ) : (
                  <>
                    <label>
                      {s.modelAnswer}
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
                      {s.rubric}
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
                    {tm(validationErrors.writingGuidance)}
                  </small>
                )}
              </fieldset>
            )}

            <label className="switch-field">
              <input
                type="checkbox"
                role="switch"
                checked={draft.isActive}
                onChange={(event) => updateDraft('isActive', event.target.checked)}
              />
              <span className="switch-track" aria-hidden="true" />
              <span>{s.useInPapers}</span>
            </label>

            <button type="submit" disabled={isBusy}>
              {status === 'saving' ? s.saving : editingQuestionId ? s.updateQuestion : s.saveQuestion}
            </button>
          </form>

        </div>
      )}
      {selectedBankId && view === 'list' && status === 'loading' && (isPresetBank?presetQuestions:questions).length === 0 &&
        <div className="empty-state" aria-busy="true">{s.loadingBankQuestions}</div>}
      {selectedBankId && view === 'list' && !(status === 'loading' && (isPresetBank?presetQuestions:questions).length === 0) && <QuestionBankBrowser<Question | PresetBrowserQuestion>
        questions={isPresetBank ? presetContent.questions : questions} linkedIds={linkedIds} filters={filters} setFilters={setFilters}
        page={page} setPage={setPage} readOnly={isPresetBank} isBusy={isBusy}
        onAction={question => { const own=questions.find(row=>row.id===question.id); if(!isPresetBank && own) { if(own.bank_id===selectedBankId)editQuestion(own);else selectBank(own.bank_id) } }}
        actionLabel={question => 'bank_id' in question && question.bank_id!==selectedBankId ? s.openBank : s.edit}
        onAdd={()=>{resetDraft();setView('question')}} onImport={()=>setView('import')} />}
      {isPresetBank && view === 'groups' && <PublishedPresetGroups groups={presetContent.groups} questions={presetQuestions} />}
      {!isPresetBank && selectedBankId && view === 'groups' && <Suspense fallback={<p role="status">{s.loadingPassages}</p>}>
        <PassageGroupEditor key={`${selectedBankId}:${questions.map((question) => `${question.id}:${question.current_revision}`).join(',')}`}
          ownerId={ownerId} bankId={selectedBankId} onOpenSourceBank={selectBank} />
      </Suspense>}
    </section>
  )
}
