import { useState } from 'react'
import { useI18n, type Language } from '../lib/i18n'
import { devicePreferencesAvailable, readPapersView, storePapersView, type PapersView } from '../lib/devicePreferences'
import { ChoiceChips } from './controls'

const STRINGS = {
  en: {
    title: 'Settings',
    lede: 'Each section says where its choices apply.',
    account: 'Account',
    signedIn: (email: string) => `Signed in as ${email}`,
    signOut: 'Sign out',
    signOutAll: 'Sign out of all devices',
    signOutAllHint: 'Ends ExamGO on every phone, tablet and computer where this account is signed in.',
    device: 'Language and appearance on this device',
    deviceHint: 'Everyone who uses ExamGO on this device shares these choices.',
    language: 'Interface language',
    appearance: 'Appearance follows your device’s light or dark setting.',
    papers: 'My papers on this device',
    view: 'Default view',
    views: { desk: 'Desk', list: 'List' } as Record<PapersView, string>,
    saved: 'Saved on this device.',
    notSaved: 'Applied for now; this browser won’t remember it.',
    reviewers: 'For MineGO reviewers',
    reviewersHint: 'Source evidence, approvals and publishing for preset papers.',
    openReviewer: 'Open reviewer tools',
  },
  ar: {
    title: 'الإعدادات',
    lede: 'يوضّح كل قسم أين تنطبق اختياراته.',
    account: 'الحساب',
    signedIn: (email: string) => `تم تسجيل الدخول باسم ${email}`,
    signOut: 'تسجيل الخروج',
    signOutAll: 'تسجيل الخروج من كل الأجهزة',
    signOutAllHint: 'يُنهي ExamGO على كل هاتف وجهاز لوحي وحاسوب سُجّل فيه الدخول بهذا الحساب.',
    device: 'اللغة والمظهر على هذا الجهاز',
    deviceHint: 'يشترك في هذه الاختيارات كل من يستخدم ExamGO على هذا الجهاز.',
    language: 'لغة الواجهة',
    appearance: 'يتبع المظهر إعداد الوضع الفاتح أو الداكن في جهازك.',
    papers: 'أوراقي على هذا الجهاز',
    view: 'طريقة العرض الافتراضية',
    views: { desk: 'المكتب', list: 'القائمة' } as Record<PapersView, string>,
    saved: 'حُفظ على هذا الجهاز.',
    notSaved: 'طُبّق الآن؛ لن يتذكره هذا المتصفح.',
    reviewers: 'لمراجعي MineGO',
    reviewersHint: 'أدلة المصادر والموافقات ونشر الأوراق الجاهزة.',
    openReviewer: 'فتح أدوات المراجعة',
  },
} satisfies Record<Language, unknown>

/** One section per scope: the account, choices kept on this device, and reviewer tools. */
export default function SettingsPage({ email, onSignOut, onOpenReviewer }: {
  email: string | undefined
  onSignOut: (scope: 'local' | 'global') => void
  onOpenReviewer: () => void
}) {
  const { language, setLanguage } = useI18n()
  const s = STRINGS[language]
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
