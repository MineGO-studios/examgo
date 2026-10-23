import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { LanguageContext, readStoredLanguage, storeLanguage, translate, useI18n, type Language } from '../lib/i18n'
import { IconButton } from './controls'

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

/** One language button (D6.5): it switches to the other language and names that language in itself. */
export function LanguageSwitch() {
  const { language, setLanguage, t } = useI18n()
  const next = language === 'en' ? 'ar' : 'en'
  return <div className="language-switch" role="group" aria-label={t('languageGroup')}>
    <IconButton icon="language" quiet lang={next} label={next === 'ar' ? 'العربية' : 'English'} onClick={() => setLanguage(next)} />
  </div>
}
