import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { LanguageContext, readStoredLanguage, storeLanguage, translate, useI18n, type Language } from '../lib/i18n'

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(readStoredLanguage)
  useEffect(() => {
    document.documentElement.lang = language
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr'
  }, [language])
  const value = useMemo(() => ({
    language,
    setLanguage: (next: Language) => { storeLanguage(next); setLanguageState(next) },
    t: (key: Parameters<typeof translate>[1]) => translate(language, key),
  }), [language])
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

/** The studio's language pair: each button names its language in that language. */
export function LanguageSwitch() {
  const { language, setLanguage, t } = useI18n()
  return <div className="language-switch" role="group" aria-label={t('languageGroup')}>
    <button type="button" lang="en" aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>EN</button>
    <button type="button" lang="ar" aria-pressed={language === 'ar'} onClick={() => setLanguage('ar')}>العربية</button>
  </div>
}
