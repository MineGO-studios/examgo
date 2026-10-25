import { describe, expect, it } from 'vitest'
import { checkStrings, defineStrings, formatDate, formatNumber, plural, westernDigits } from './localize'

describe('localize helpers', () => {
  it('formats Arabic numbers and dates with Western digits', () => {
    expect(formatNumber('ar', 1234)).toMatch(/^1[,٬]?234$/)
    const date = formatDate('ar', '2026-10-21T12:00:00Z', { day: 'numeric', month: 'long', year: 'numeric' })
    expect(date).toContain('2026')
    expect(date).toMatch(/[؀-ۿ]/)
    expect(date).not.toMatch(/[٠-٩]/)
  })

  it('chooses Arabic plural forms by count', () => {
    const forms = { zero: 'لا أسئلة', one: 'سؤال واحد', two: 'سؤالان', few: '{n} أسئلة', many: '{n} سؤالًا', other: '{n} سؤال' }
    expect([0, 1, 2, 3, 10, 11, 99, 100].map((n) => plural('ar', n, forms)))
      .toEqual(['لا أسئلة', 'سؤال واحد', 'سؤالان', '3 أسئلة', '10 أسئلة', '11 سؤالًا', '99 سؤالًا', '100 سؤال'])
    expect(plural('en', 1, { one: '{n} mark', other: '{n} marks' })).toBe('1 mark')
    expect(plural('en', 4, { one: '{n} mark', other: '{n} marks' })).toBe('4 marks')
  })

  it('converts Eastern digits to Western digits', () => {
    expect(westernDigits('١٢ حرفًا و۳')).toBe('12 حرفًا و3')
  })

  it('reports empty, untranslated and Eastern-digit Arabic entries', () => {
    const strings = defineStrings({
      en: { ok: 'Save', empty: 'Cancel', english: 'Open paper', digits: 'At least 12', fn: (n: number) => `${n} items`, nested: { a: 'Desk' } },
      ar: { ok: 'حفظ', empty: ' ', english: 'Open paper', digits: '١٢ على الأقل', fn: (n: number) => `${n} عناصر`, nested: { a: 'Desk' } },
    })
    expect(checkStrings(strings).map((issue) => `${issue.path}: ${issue.problem}`))
      .toEqual(['empty: empty', 'english: not translated', 'digits: Eastern digits', 'nested.a: not translated'])
  })
})
