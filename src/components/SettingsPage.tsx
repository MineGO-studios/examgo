import { useState } from 'react'
import { useI18n, type Language } from '../lib/i18n'
import { devicePreferencesAvailable, readPapersView, storePapersView, type PapersView } from '../lib/devicePreferences'
import { ChoiceChips } from './controls'
import { SETTINGS_STRINGS } from './SettingsPage.strings'
import { accountSelectionSeed, isValidSelectionSeed, readSelectionSeed, storeSelectionSeed } from '../lib/selectionSeed'


/** One section per scope: the account, choices kept on this device, and reviewer tools. */
export default function SettingsPage({ ownerId, email, onSignOut, onOpenReviewer }: {
  ownerId: string
  email: string | undefined
  onSignOut: (scope: 'local' | 'global') => void
  onOpenReviewer: () => void
}) {
  const { language, setLanguage } = useI18n()
  const s = SETTINGS_STRINGS[language]
  const [view, setView] = useState<PapersView>(readPapersView)
  const [status, setStatus] = useState<{ section: 'device' | 'papers' | 'selection'; saved: boolean } | null>(null)
  const [seedText, setSeedText] = useState(() => String(readSelectionSeed(ownerId)))
  const [seedError, setSeedError] = useState('')
  const saveSeed = (seed: number | null) => {
    if (seed !== null && !isValidSelectionSeed(seed)) { setSeedError(s.selectionInvalid); setStatus(null); return }
    setSeedError('')
    const saved = storeSelectionSeed(ownerId, seed)
    setSeedText(String(seed ?? accountSelectionSeed(ownerId)))
    setStatus({ section: 'selection', saved })
  }

  return <div className="settings-page">
    <header className="settings-head">
      <h2 id="settings-title">{s.title}</h2>
      <p>{s.lede}</p>
    </header>

    <section className="settings-section" aria-labelledby="settings-account">
      <h3 id="settings-account">{s.account}</h3>
      <p>{email ? <>{s.signedIn} <bdi>{email}</bdi></> : null}</p>
      <div className="settings-actions">
        <button type="button" className="button-secondary" onClick={() => onSignOut('local')}>{s.signOut}</button>
        <button type="button" className="button-secondary" aria-describedby="sign-out-all-hint" onClick={() => onSignOut('global')}>{s.signOutAll}</button>
      </div>
      <p id="sign-out-all-hint" className="field-hint">{s.signOutAllHint}</p>
    </section>

    <section className="settings-section" aria-labelledby="settings-device">
      <h3 id="settings-device">{s.device}</h3>
      <p className="field-help">{s.deviceHint}</p>
      <ChoiceChips legend={s.language} value={language}
        options={[{ value: 'en', label: 'English' }, { value: 'ar', label: 'العربية' }] as { value: Language; label: string }[]}
        onChange={(next) => { setLanguage(next); setStatus({ section: 'device', saved: devicePreferencesAvailable() }) }} />
      <p className="field-help">{s.appearance}</p>
      <p role="status" className="settings-status">{status?.section === 'device' ? (status.saved ? s.saved : s.notSaved) : ''}</p>
    </section>

    <section className="settings-section" aria-labelledby="settings-papers">
      <h3 id="settings-papers">{s.papers}</h3>
      <ChoiceChips legend={s.view} value={view}
        options={(['desk', 'list'] as const).map((key) => ({ value: key, label: s.views[key] }))}
        onChange={(next) => { setView(next); setStatus({ section: 'papers', saved: storePapersView(next) }) }} />
      <p role="status" className="settings-status">{status?.section === 'papers' ? (status.saved ? s.saved : s.notSaved) : ''}</p>
    </section>

    <section className="settings-section" aria-labelledby="settings-selection">
      <h3 id="settings-selection">{s.selection}</h3>
      <p className="field-help">{s.selectionHint}</p>
      <form className="settings-seed" noValidate onSubmit={(event) => { event.preventDefault(); saveSeed(seedText.trim() === '' ? NaN : Number(seedText)) }}>
        <label className="text-field" htmlFor="settings-seed">{s.selectionLabel}
          <input id="settings-seed" type="text" inputMode="numeric" dir="ltr" value={seedText} onChange={(event) => { setSeedText(event.target.value); setSeedError('') }}
            aria-invalid={Boolean(seedError)} aria-describedby={seedError ? 'settings-seed-error settings-seed-scope' : 'settings-seed-scope'} />
        </label>
        {seedError && <span id="settings-seed-error" className="field-error">{seedError}</span>}
        <div className="settings-actions">
          <button type="submit" className="button-secondary">{s.selectionSave}</button>
          <button type="button" className="button-quiet" onClick={() => saveSeed(null)}>{s.selectionReset}</button>
        </div>
      </form>
      <p id="settings-seed-scope" className="field-hint">{s.selectionScope}</p>
      <p role="status" className="settings-status">{status?.section === 'selection' ? (status.saved ? s.selectionSaved : s.notSaved) : ''}</p>
    </section>

    <section className="settings-section reviewer-entry" aria-labelledby="reviewer-entry-title">
      <h3 id="reviewer-entry-title">{s.reviewers}</h3>
      <p className="field-help">{s.reviewersHint}</p>
      <button type="button" className="button-secondary" onClick={onOpenReviewer}>{s.openReviewer}</button>
    </section>
  </div>
}
