import { lazy, Suspense, useEffect, useState } from 'react'
import { getQuestionBanks, type QuestionBank } from '../lib/questionBankRepository'
import { teacherErrorMessage } from '../lib/safeErrorDetails'

const PresetCurationDetails = lazy(() => import('./PresetCurationDetails'))

/**
 * Preset review and publication administration, kept apart from ordinary teacher bank and exam tasks.
 * Authorization is unchanged: the server decides reviewer authority and the panel shows controls only to reviewers.
 */
export default function PresetReviewTools() {
  const [banks, setBanks] = useState<QuestionBank[]>([])
  const [bankId, setBankId] = useState('')
  const [message, setMessage] = useState('Loading banks…')
  useEffect(() => {
    let active = true
    void getQuestionBanks().then((loaded) => {
      if (active) { setBanks(loaded); setMessage(loaded.length ? 'Choose a bank to open its preset review records.' : 'No banks are available.') }
    }).catch((error: unknown) => { if (active) setMessage(teacherErrorMessage(error, 'Banks could not be loaded.')) })
    return () => { active = false }
  }, [])
  return <section className="card preset-review-tools" aria-labelledby="preset-review-title">
    <h2 id="preset-review-title">Preset review and publication</h2>
    <p>Recording source evidence, approving exact revisions and publishing presets for all teachers are reviewer decisions, separate from building exams and managing your own banks. Only the assigned MineGO reviewer can make them; other accounts can read the records but see no review controls.</p>
    <p>Teachers see published presets with their source and approval details in New paper → Use an approved exercise, or under Pick questions by type → Shared MineGO questions.</p>
    <p role="status">{message}</p>
    {banks.length > 0 && <label>Bank<select value={bankId} onChange={(event) => setBankId(event.target.value)}>
      <option value="">Choose a bank</option>
      {banks.map((bank) => <option key={bank.id} value={bank.id}>{bank.name}</option>)}
    </select></label>}
    {bankId && <Suspense fallback={<p role="status">Loading preset review…</p>}>
      <PresetCurationDetails key={bankId} bankId={bankId} />
    </Suspense>}
  </section>
}
