import type { QuestionType } from '../domain/questionDomain'
import type { Language } from './i18n'

/*
 * One teacher-facing name per canonical question type, used on every screen (D9.1, MIN-249).
 * Names follow the owner's Figma type list of 30 October 2026 where a type maps one to one.
 * Stored content and canonical type values are never renamed. Arabic needs native-teacher review.
 */
const LABELS: Record<Language, Record<QuestionType, string>> = {
  en: {
    'multiple-choice': 'Choose the correct answer between the brackets',
    binary: 'True/False or Yes/No',
    'short-answer': 'Short answer',
    completion: 'Use the words in the box',
    'odd-word': 'Odd word out',
    matching: 'Match List A with List B',
    'word-relationship': 'Fill the blank with missing words or letters',
    rewrite: 'Rewrite with proper punctuation',
    'extended-writing': 'Writing',
  },
  ar: {
    'multiple-choice': 'اختر الإجابة الصحيحة من بين الأقواس',
    binary: 'صح/خطأ أو نعم/لا',
    'short-answer': 'إجابة قصيرة',
    completion: 'استخدم الكلمات في الصندوق',
    'odd-word': 'الكلمة المختلفة',
    matching: 'مطابقة القائمة أ بالقائمة ب',
    'word-relationship': 'املأ الفراغ بالكلمات أو الأحرف المفقودة',
    rewrite: 'إعادة الكتابة بعلامات ترقيم صحيحة',
    'extended-writing': 'الكتابة',
  },
}

/** English labels for screens that are not yet translated. */
export const QUESTION_TYPE_LABELS_EN: Record<QuestionType, string> = LABELS.en

export function questionTypeLabel(type: string, language: Language = 'en'): string {
  return LABELS[language][type as QuestionType] ?? type
}

/** The type chooser groups types by what the student does. */
export const QUESTION_TYPE_GROUPS: readonly { id: 'choose' | 'write'; label: Record<Language, string>; types: readonly QuestionType[] }[] = [
  { id: 'choose', label: { en: 'Choose the answer', ar: 'اختيار الإجابة' }, types: ['multiple-choice', 'binary', 'odd-word', 'matching'] },
  { id: 'write', label: { en: 'Write the answer', ar: 'كتابة الإجابة' }, types: ['short-answer', 'completion', 'word-relationship', 'rewrite', 'extended-writing'] },
]

const PICK_BY_TYPE: readonly QuestionType[] = ['multiple-choice', 'binary', 'short-answer']

/** Where a type can be used in hosted papers today, from the D9.1 support matrix. */
export function questionTypeUse(type: QuestionType, language: Language = 'en'): string {
  if (PICK_BY_TYPE.includes(type)) return language === 'ar' ? 'تُستخدم في: اختيار الأسئلة حسب النوع.' : 'Used in: Pick questions by type.'
  return language === 'ar' ? 'غير متاحة في الأوراق بعد. يمكنك حفظها في بنكك.' : 'Not in hosted papers yet. You can still save it in your bank.'
}
