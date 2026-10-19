import { useEffect, useState } from 'react'
import { getPhaseTenCandidateWorkflows, type SavedPhaseTenCandidate } from '../lib/phaseTenCandidateRepository'
import { teacherErrorMessage } from '../lib/safeErrorDetails'
import { SavedWorkStatus } from './SavedWorkStatus'

/** Lists either editable candidates or finalized papers; the two kinds are shown in separate My papers groups. */
export default function PhaseTenCandidateSavedWork({ onOpen, finalized, onLoadFailure }: { onOpen: (saved: SavedPhaseTenCandidate) => void; finalized: boolean; onLoadFailure?: (failed: boolean) => void }) {
  const [rows, setRows] = useState<SavedPhaseTenCandidate[]>([])
  const noun = finalized ? 'finalized complete paper' : 'complete-paper candidate draft'
  const [message, setMessage] = useState(`Loading ${noun}s…`)
  const [failed, setFailed] = useState(false)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let active = true
    void getPhaseTenCandidateWorkflows().then((next) => {
      if (active) { const own = next.filter(row => row.finalized === finalized); setRows(own); setFailed(false); setMessage(own.length ? `${own.length} ${noun}${own.length === 1 ? '' : 's'}.` : `No ${noun}s yet.`) }
    }).catch((error: unknown) => {
      if (active) { setFailed(true); setMessage(teacherErrorMessage(error, 'Unable to load saved complete papers.')) }
    })
    return () => { active = false }
  }, [reload, finalized, noun])
  return <section className="card" aria-labelledby={`candidate-saved-${finalized}`}>
    <h3 id={`candidate-saved-${finalized}`}>{finalized ? 'Complete papers' : 'Complete-paper candidate drafts'}</h3>
    <SavedWorkStatus message={message} failed={failed} onLoadFailure={onLoadFailure} />
    {failed && !onLoadFailure && <button onClick={() => setReload((value) => value + 1)}>Retry loading saved papers</button>}
    <ul>{rows.map((row) => <li key={`${row.finalized}:${row.id}`}>
      <strong>{row.intent.settings.examTitle}</strong> — {row.finalized ? 'Finalized; regenerate captured version' : `Draft, version ${row.version}`}<br />
      <button onClick={() => onOpen(row)}>Open {row.finalized ? 'finalized paper' : 'candidate draft'}</button>
    </li>)}</ul>
  </section>
}
