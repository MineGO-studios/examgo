import { useEffect, useState } from 'react'
import { getPhaseNineWorkflows, type SavedPhaseNineWorkflow } from '../lib/phaseNineRepository'
import { teacherErrorMessage } from '../lib/safeErrorDetails'

/** Lists either editable drafts or finalized papers; the two kinds are shown in separate My papers groups. */
export default function PhaseNineSavedWork({ onOpen, finalized }: { onOpen: (saved: SavedPhaseNineWorkflow) => void; finalized: boolean }) {
  const [rows, setRows] = useState<SavedPhaseNineWorkflow[]>([])
  const noun = finalized ? 'finalized Iraqi exercises paper' : 'Iraqi exercises draft'
  const [message, setMessage] = useState(`Loading ${noun}s…`)
  const [failed, setFailed] = useState(false)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let active = true
    void getPhaseNineWorkflows().then((next) => {
      if (active) { const own = next.filter(row => row.finalized === finalized); setRows(own); setFailed(false); setMessage(own.length ? `${own.length} ${noun}${own.length === 1 ? '' : 's'}.` : `No ${noun}s yet.`) }
    }).catch((error: unknown) => {
      if (active) { setFailed(true); setMessage(teacherErrorMessage(error, 'Unable to load saved structured work.')) }
    })
    return () => { active = false }
  }, [reload, finalized, noun])
  return <section className="card" aria-labelledby={`structured-saved-${finalized}`}>
    <h3 id={`structured-saved-${finalized}`}>{finalized ? 'Iraqi exercises and writing papers' : 'Iraqi exercises and writing drafts'}</h3>
    <p role={failed ? 'alert' : 'status'}>{message}</p>
    {failed && <button onClick={() => setReload((n) => n + 1)}>Retry loading structured work</button>}
    <ul>{rows.map((row) => <li key={`${row.finalized}:${row.id}`}>
      <strong>{row.intent.settings.examTitle}</strong> — {row.finalized ? 'Finalized; regenerate captured version' : `Draft, version ${row.version}`}<br />
      <button onClick={() => onOpen(row)}>Open {row.finalized ? 'finalized paper' : 'structured draft'}</button>
    </li>)}</ul>
  </section>
}
