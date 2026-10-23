import { defineStrings } from '../lib/localize'

export const PAPER_STARTS_STRINGS = defineStrings({
  en: {
    title: 'What kind of paper?',
    simple: 'Pick questions by type',
    simpleDescription: 'Choose how many of each question type and set the marks.',
    presets: 'Use a preset exam paper made by MineGO',
    presetsDescription: 'A ready-made MineGO paper, kept in source order with its answer key.',
    candidate: 'Complete paper candidate',
    candidateDescription: 'Fixed-profile paper for development checks.',
    structured: 'Structured paper',
    structuredDescription: 'Configurable structure, in development.',
    unit: (n: number) => `Unit ${n}`,
    development: 'Development builds only',
  },
  ar: {
    title: 'ما نوع الورقة؟',
    simple: 'اختيار الأسئلة حسب النوع',
    simpleDescription: 'اختر عدد الأسئلة من كل نوع وحدّد الدرجات.',
    presets: 'استخدام ورقة امتحان جاهزة من MineGO',
    presetsDescription: 'ورقة جاهزة من MineGO بترتيب مصدرها ومع مفتاح الإجابة.',
    candidate: 'ورقة كاملة تجريبية',
    candidateDescription: 'ورقة بقالب ثابت لفحوص التطوير.',
    structured: 'ورقة منظّمة',
    structuredDescription: 'بنية قابلة للتعديل، قيد التطوير.',
    unit: (n: number) => `الوحدة ${n}`,
    development: 'لنسخ التطوير فقط',
  },
})
