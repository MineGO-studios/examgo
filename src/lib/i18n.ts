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
    account: 'Settings',
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
    privatePreview: 'Private preview',
    noBankReason: 'Add or import questions to a bank in Question banks first.',
    loadingPresets: 'Loading approved presets…',
    loadingShared: 'Loading shared MineGO questions…',
    loadingIraqi: 'Loading source-specific builder…',
    loadingCandidate: 'Loading complete-paper candidate…',
    loadingStructured: 'Loading structured paper…',
    loadingReviewer: 'Loading reviewer tools…',
    backToSettings: 'Back to settings',
  },
  ar: {
    productTagline: 'أوراق امتحانات اللغة الإنكليزية للصف السادس',
    family: 'من MineGO Studio',
    workspaceNav: 'مساحة عمل المعلم',
    createExam: 'ورقة جديدة',
    myPapers: 'أوراقي',
    questionBanks: 'بنوك الأسئلة',
    account: 'الإعدادات',
    languageGroup: 'لغة الواجهة',
    checkingSession: 'جارٍ التحقق من الجلسة…',
    signInIntro: 'سجّل الدخول إلى مساحة عمل المعلم.',
    authMode: 'تسجيل الدخول أو إنشاء حساب',
    signIn: 'تسجيل الدخول',
    createAccount: 'إنشاء حساب',
    email: 'البريد الإلكتروني',
    password: 'كلمة المرور',
    passwordHint: '12 حرفًا على الأقل.',
    pleaseWait: 'يرجى الانتظار…',
    authAside: 'أنشئ ورقة من بنوك أسئلتك، وراجعها كما سيراها الطالب، ثم نزّل الورقة مع مفتاح الإجابة المطابق.',
    chooseFormat: 'اختر نوع الورقة',
    developmentOnly: 'للتطوير فقط',
    stepFormat: 'البداية',
    stepSetup: 'إعداد الورقة',
    stepReview: 'مراجعة الورقة',
    stepDownload: 'التنزيل',
    progress: 'مراحل الورقة',
    privatePreview: 'معاينة خاصة',
    noBankReason: 'أضف أسئلة إلى بنك أو استوردها من بنوك الأسئلة أولًا.',
    loadingPresets: 'جارٍ تحميل الأوراق الجاهزة المعتمدة…',
    loadingShared: 'جارٍ تحميل أسئلة MineGO المشتركة…',
    loadingIraqi: 'جارٍ تحميل منشئ التمارين…',
    loadingCandidate: 'جارٍ تحميل الورقة الكاملة التجريبية…',
    loadingStructured: 'جارٍ تحميل الورقة المنظّمة…',
    loadingReviewer: 'جارٍ تحميل أدوات المراجعة…',
    backToSettings: 'العودة إلى الإعدادات',
  },
} as const satisfies Record<Language, Record<string, string>>

/** The shell dictionary, exported for the completeness test. */
export const SHELL_STRINGS = STRINGS

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
