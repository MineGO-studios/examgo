import { useEffect, useState } from 'react'
import { getExamBlueprints, type SavedExamBlueprint } from '../lib/examBlueprintRepository'
import { getBlueprintPapers, type SavedBlueprintPaper } from '../lib/blueprintPaperRepository'
import BlueprintFinalPaper from './BlueprintFinalPaper'
import { teacherErrorMessage } from '../lib/safeErrorDetails'

export function EditableBlueprints({ ownerId, onOpen }: { ownerId: string; onOpen: (saved: SavedExamBlueprint) => void }) {
  const [rows, setRows] = useState<SavedExamBlueprint[]>([])
  const [message, setMessage] = useState('Loading editable blueprints…')
  const [failed, setFailed] = useState(false), [busy, setBusy] = useState(false), [reload, setReload] = useState(0)
  useEffect(() => {
    let active = true
    void getExamBlueprints(ownerId).then(next => {
      if (active) { setRows(next); setFailed(false); setMessage(next.length ? `${next.length} editable blueprint${next.length === 1 ? '' : 's'} on this page.` : 'No editable blueprints saved yet.') }
    }).catch((error: unknown) => { if (active) { setFailed(true); setMessage(teacherErrorMessage(error, 'Saved blueprints could not be loaded.')) } })
    return () => { active = false }
  }, [ownerId, reload])
  return <section className="card" aria-labelledby="saved-blueprints-title">
    <h3 id="saved-blueprints-title">Structured paper blueprints</h3>
    <p>Reusable question plans, with saved versions. Reopening reviews current bank content. A blueprint is separate from an immutable generated paper.</p>
    <p role={failed ? 'alert' : 'status'}>{message}</p>
    <ul>{rows.map(row => <li key={row.id}><strong>{row.intent.settings.examTitle}</strong> · Editable version {row.version} · {row.intent.blueprint.totalMarks} marks
      <p><button type="button" disabled={busy} onClick={() => onOpen(row)}>Open blueprint {row.intent.settings.examTitle}</button></p></li>)}</ul>
    <button type="button" disabled={busy} onClick={() => setReload(n => n + 1)}>Reload blueprints</button>
    {rows.length === 25 && <button type="button" disabled={busy} onClick={() => {
      setBusy(true); setFailed(false)
      void getExamBlueprints(ownerId, rows.at(-1)).then(next => { setRows(next); setMessage(`${next.length} editable blueprints on this page.`) })
        .catch((error: unknown) => { setFailed(true); setMessage(teacherErrorMessage(error, 'The next page could not be loaded.')) })
        .finally(() => setBusy(false))
    }}>Next editable blueprints</button>}
  </section>
}

export function GeneratedBlueprintPapers({ ownerId }: { ownerId: string }) {
  const [rows, setRows] = useState<SavedBlueprintPaper[]>([]), [selected, setSelected] = useState<SavedBlueprintPaper | null>(null)
  const [message, setMessage] = useState('Loading immutable generated papers…'), [failed, setFailed] = useState(false)
  const [cursor, setCursor] = useState<SavedBlueprintPaper | undefined>(), [reload, setReload] = useState(0), [busy, setBusy] = useState(true)
  useEffect(() => {
    let active = true
    void getBlueprintPapers(ownerId, cursor).then(next => {
      if (active) { setRows(next); setFailed(false); setMessage(next.length ? `${next.length} immutable paper${next.length === 1 ? '' : 's'} on this page.` : 'No generated blueprint papers on this page.') }
    }).catch((error: unknown) => { if (active) { setFailed(true); setMessage(teacherErrorMessage(error, 'Generated papers could not load.')) } })
      .finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [ownerId, cursor, reload])
  return <section className="card" aria-labelledby="generated-blueprint-papers-title">
    <h3 id="generated-blueprint-papers-title">Structured papers</h3>
    <p>Captured source versions, order and exam marks. Reopening this paper does not select from current banks or replace an editable blueprint.</p>
    <p role={failed ? 'alert' : 'status'}>{message}</p>
    <ul>{rows.map(row => <li key={row.id}><strong>{row.intent.intent.settings.examTitle}</strong> · Generated from blueprint version {row.intent.intent.blueprint.version} · {row.intent.snapshot.totalMarks} marks
      <p><button type="button" disabled={busy} onClick={() => setSelected(row)}>Open generated paper {row.intent.intent.settings.examTitle}</button></p></li>)}</ul>
    <button type="button" disabled={busy} onClick={() => { setBusy(true); setCursor(undefined); setReload(n => n + 1) }}>Reload generated papers</button>
    {rows.length === 25 && <button type="button" disabled={busy} onClick={() => { setBusy(true); setCursor(rows.at(-1)) }}>Next generated papers</button>}
    {selected && <><button type="button" onClick={() => setSelected(null)}>Close generated paper</button><BlueprintFinalPaper key={selected.id} paper={selected} /></>}
  </section>
}
