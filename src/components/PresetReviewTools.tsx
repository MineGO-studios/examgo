import { lazy, Suspense, useEffect, useState } from 'react'
import { localizeAppMessage } from '../lib/appMessages'
import { useI18n } from '../lib/i18n'
import { getQuestionBanks, type QuestionBank } from '../lib/questionBankRepository'
import { teacherErrorMessage } from '../lib/safeErrorDetails'
import { PRESET_REVIEW_STRINGS } from './PresetReview.strings'

const PresetCurationDetails = lazy(() => import('./PresetCurationDetails'))

type Strings = typeof PRESET_REVIEW_STRINGS.en.tools
type Message = (s: Strings) => string

/**
 * Preset review and publication administration, kept apart from ordinary teacher bank and exam tasks.
 * Authorization is unchanged: the server decides reviewer authority and the panel shows controls only to reviewers.
 */
export default function PresetReviewTools() {
  const { language } = useI18n(), s = PRESET_REVIEW_STRINGS[language].tools
  const [banks, setBanks] = useState<QuestionBank[]>([])
  const [bankId, setBankId] = useState('')
  const [message, setMessage] = useState<Message>(() => (t: Strings) => t.loadingBanks)
  useEffect(() => {
    let active = true
    const say = (next: Message) => setMessage(() => next)
    void getQuestionBanks().then((loaded) => {
      if (active) { setBanks(loaded); say((t) => loaded.length ? t.chooseBankPrompt : t.noBanks) }
    }).catch((error: unknown) => {
      if (active) { const text = teacherErrorMessage(error, PRESET_REVIEW_STRINGS.en.tools.banksFailed); say(() => text) }
    })
    return () => { active = false }
  }, [])
  return <section className="card preset-review-tools" aria-labelledby="preset-review-title">
    <h2 id="preset-review-title">{s.title}</h2>
    <p>{s.intro}</p>
    <p>{s.teachersSee}</p>
    <p role="status">{localizeAppMessage(language, message(s))}</p>
    {banks.length > 0 && <label>{s.bank}<select value={bankId} onChange={(event) => setBankId(event.target.value)}>
      <option value="">{s.chooseBank}</option>
      {banks.map((bank) => <option key={bank.id} value={bank.id}>{bank.name}</option>)}
    </select></label>}
    {bankId && <Suspense fallback={<p role="status">{s.loadingReview}</p>}>
      <PresetCurationDetails key={bankId} bankId={bankId} />
    </Suspense>}
  </section>
}
