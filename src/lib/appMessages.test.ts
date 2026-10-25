import { describe, expect, it } from 'vitest'
import { localizeAppMessage } from './appMessages'

describe('localizeAppMessage', () => {
  it('leaves English unchanged', () => {
    expect(localizeAppMessage('en', 'Nothing was changed. Reference: EG-1a2b')).toBe('Nothing was changed. Reference: EG-1a2b')
  })

  it('translates known messages and keeps the reference code', () => {
    expect(localizeAppMessage('ar', 'Nothing was changed. Reference: EG-1a2b')).toBe('لم يتغيّر شيء. الرمز المرجعي: EG-1a2b')
  })

  it('shows an unknown message in English instead of a partial translation', () => {
    expect(localizeAppMessage('ar', 'The bank is locked. Nothing was changed.')).toBe('The bank is locked. Nothing was changed.')
  })
})

describe('New paper messages', () => {
  it('translates validation messages with their numbers', () => {
    expect(localizeAppMessage('ar', 'School name cannot exceed 80 characters.')).toBe('لا يمكن أن يتجاوز اسم المدرسة 80 حرفًا.')
    expect(localizeAppMessage('ar', 'Question quantity must be between 1 and 12.')).toBe('يجب أن يكون عدد الأسئلة بين 1 و12.')
  })

  it('translates a fallback and keeps its reference', () => {
    expect(localizeAppMessage('ar', 'Unable to save the exam draft. Reference: EG-12ab'))
      .toBe('تعذّر حفظ مسودة الامتحان. الرمز المرجعي: EG-12ab')
  })
})

describe('Sign-in, saved work and limit messages', () => {
  it('translates sign-in and session messages', () => {
    expect(localizeAppMessage('ar', 'Password must contain at least 12 characters.')).toBe('يجب أن تحتوي كلمة المرور على 12 حرفًا على الأقل.')
    expect(localizeAppMessage('ar', 'Unable to sign in. Check your email and password.')).toBe('تعذّر تسجيل الدخول. تحقّق من بريدك الإلكتروني وكلمة المرور.')
  })

  it('translates recovery issues with their question number', () => {
    expect(localizeAppMessage('ar', 'Question 3 changed after this draft was saved.')).toBe('تغيّر السؤال 3 بعد حفظ هذه المسودة.')
  })

  it('translates an account limit and keeps its reference', () => {
    expect(localizeAppMessage('ar', 'Your account has reached a usage limit. Contact MineGO to raise it. Reference: EG-9f'))
      .toBe('بلغ حسابك حدًّا للاستخدام. تواصل مع MineGO لرفعه. الرمز المرجعي: EG-9f')
  })
})
