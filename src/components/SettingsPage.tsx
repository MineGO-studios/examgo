import { useState } from 'react'
import { useI18n, type Language } from '../lib/i18n'
import { devicePreferencesAvailable, readPapersView, storePapersView, type PapersView } from '../lib/devicePreferences'
import { ChoiceChips } from './controls'
import { SETTINGS_STRINGS } from './SettingsPage.strings'


/** One section per scope: the account, choices kept on this device, and reviewer tools. */
export default function SettingsPage({ email, onSignOut, onOpenReviewer }: {
  email: string | undefined
  onSignOut: (scope: 'local' | 'global') => void
  onOpenReviewer: () => void
}) {
  const { language, setLanguage } = useI18n()
  const s = SETTINGS_STRINGS[language]
  const [view, setView] = useState<PapersView>(readPapersView)
  const [status, setStatus] = useState<{ section: 'device' | 'papers'; saved: boolean } | null>(null)

  return <div className="settings-page">
    <header className="settings-head">
      <h2 id="settings-title">{s.title}</h2>
      <p>{s.lede}</p>
    </header>

    <section className="settings-section" aria-labelledby="settings-account">
      <h3 id="settings-account">{s.account}</h3>
      <p>{email ? s.signedIn(email) : null}</p>
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

    <section className="settings-section reviewer-entry" aria-labelledby="reviewer-entry-title">
      <h3 id="reviewer-entry-title">{s.reviewers}</h3>
      <p className="field-help">{s.reviewersHint}</p>
      <button type="button" className="button-secondary" onClick={onOpenReviewer}>{s.openReviewer}</button>
    </section>
  </div>
}
