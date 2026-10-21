import { createContext, useContext } from 'react'

export type Language = 'en' | 'ar'

/**
 * Interface strings. Paper content stays in its source language; only the workspace
 * around it is translated. Arabic strings need review by a native-speaking teacher.
 */
const STRINGS = {
  en: {
    productTagline: 'Exam papers for Grade 6 English',
    family: 'by MineGO Studio',
    workspaceNav: 'Teacher workspace',
    createExam: 'New paper',
    myPapers: 'My papers',
    questionBanks: 'Question banks',
    account: 'Account',
    languageGroup: 'Interface language',
    checkingSession: 'Checking your session…',
    signInIntro: 'Sign in to your teacher workspace.',
    authMode: 'Sign in or create an account',
    signIn: 'Sign in',
    createAccount: 'Create account',
    email: 'Email',
    password: 'Password',
    passwordHint: 'At least 12 characters.',
    pleaseWait: 'Please wait…',
    authAside: 'Build a paper from your question banks, review it as the student will see it, and download the paper with its matching answer key.',
    chooseFormat: 'Choose a paper format',
    developmentOnly: 'Development only',
    stepFormat: 'Start',
    stepSetup: 'Paper setup',
    stepReview: 'Review the paper',
    stepDownload: 'Download',
    progress: 'Paper progress',
  },
  ar: {
    productTagline: 'أوراق امتحانات اللغة الإنكليزية للصف السادس',
    family: 'من MineGO Studio',
    workspaceNav: 'مساحة عمل المعلم',
    createExam: 'ورقة جديدة',
    myPapers: 'أوراقي',
    questionBanks: 'بنوك الأسئلة',
    account: 'الحساب',
    languageGroup: 'لغة الواجهة',
    checkingSession: 'جارٍ التحقق من الجلسة…',
    signInIntro: 'سجّل الدخول إلى مساحة عمل المعلم.',
    authMode: 'تسجيل الدخول أو إنشاء حساب',
    signIn: 'تسجيل الدخول',
    createAccount: 'إنشاء حساب',
    email: 'البريد الإلكتروني',
    password: 'كلمة المرور',
    passwordHint: '١٢ حرفًا على الأقل.',
    pleaseWait: 'يرجى الانتظار…',
    authAside: 'أنشئ ورقة من بنوك أسئلتك، وراجعها كما سيراها الطالب، ثم نزّل الورقة مع مفتاح الإجابة المطابق.',
    chooseFormat: 'اختر نوع الورقة',
    developmentOnly: 'للتطوير فقط',
    stepFormat: 'البداية',
    stepSetup: 'إعداد الورقة',
    stepReview: 'مراجعة الورقة',
    stepDownload: 'التنزيل',
    progress: 'مراحل الورقة',
  },
} as const satisfies Record<Language, Record<string, string>>

export type MessageKey = keyof typeof STRINGS.en

export function translate(language: Language, key: MessageKey): string {
  return STRINGS[language][key]
}

const STORAGE_KEY = 'examgo.language'

/** Device preference only; the page works the same when storage is unavailable. */
export function readStoredLanguage(): Language {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'ar' ? 'ar' : 'en'
  } catch {
    return 'en'
  }
}

export function storeLanguage(language: Language): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, language)
  } catch {
    // Storage can be blocked; the choice still applies to this page.
  }
}

export interface I18n {
  language: Language
  setLanguage: (language: Language) => void
  t: (key: MessageKey) => string
}

export const LanguageContext = createContext<I18n>({
  language: 'en',
  setLanguage: () => {},
  t: (key) => translate('en', key),
})

export function useI18n(): I18n {
  return useContext(LanguageContext)
}
