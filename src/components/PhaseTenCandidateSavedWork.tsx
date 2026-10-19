import { useEffect, useState } from 'react'
import { getPhaseTenCandidateWorkflows, type SavedPhaseTenCandidate } from '../lib/phaseTenCandidateRepository'
import { teacherErrorMessage } from '../lib/safeErrorDetails'
import { SavedWorkStatus } from './SavedWorkStatus'
import { listLoadState, useReportListLoadState, type ReportListLoadState } from './savedWorkLoadState'

/** Lists either editable candidates or finalized papers; the two kinds are shown in separate My papers groups. */
export default function PhaseTenCandidateSavedWork({ onOpen, finalized, onLoadState }: { onOpen: (saved: SavedPhaseTenCandidate) => void; finalized: boolean; onLoadState?: ReportListLoadState }) {
  const [rows, setRows] = useState<SavedPhaseTenCandidate[]>([])
  const noun = finalized ? 'finalized complete paper' : 'complete-paper candidate draft'
  const [message, setMessage] = useState(`Loading ${noun}s…`)
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let active = true
    void getPhaseTenCandidateWorkflows().then((next) => {
      if (active) { const own = next.filter(row => row.finalized === finalized); setRows(own); setFailed(false); setLoaded(true); setMessage(own.length ? `${own.length} ${noun}${own.length === 1 ? '' : 's'}.` : `No ${noun}s yet.`) }
    }).catch((error: unknown) => {
      if (active) { setFailed(true); setLoaded(true); setMessage(teacherErrorMessage(error, 'Unable to load saved complete papers.')) }
    })
    return () => { active = false }
  }, [reload, finalized, noun])
  const state = listLoadState(loaded, failed, rows.length)
  useReportListLoadState(onLoadState, state)
  if (onLoadState && state === 'empty') return null
  return <section className="paper-list" aria-labelledby={`candidate-saved-${finalized}`}>
    <h3 id={`candidate-saved-${finalized}`}>Complete paper candidates</h3>
    <SavedWorkStatus message={message} failed={failed} managed={Boolean(onLoadState)} />
    {failed && !onLoadState && <button onClick={() => setReload((value) => value + 1)}>Retry loading saved papers</button>}
    <ul className="paper-rows">{rows.map((row) => <li key={`${row.finalized}:${row.id}`} className="paper-row">
      <strong>{row.intent.settings.examTitle}</strong> <span className="paper-row-meta">{row.finalized ? 'Finalized' : `Draft · version ${row.version}`}</span>
      <button onClick={() => onOpen(row)}>Open {row.finalized ? 'finalized paper' : 'candidate draft'}</button>
    </li>)}</ul>
  </section>
}
