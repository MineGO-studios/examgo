import type { Language } from './i18n'

/*
 * Interface localization helpers (MIN-56). Each screen keeps its strings in a sibling
 * `*.strings.ts` file built with `defineStrings`, so a missing Arabic entry fails the
 * typecheck and the completeness test finds every dictionary on its own.
 * Arabic text uses Western digits, matching the app copy (examgo-design).
 */

export type StringEntry = string | ((...args: never[]) => string) | { readonly [key: string]: StringEntry }

/** English is the shape; Arabic must provide the same keys and function signatures. */
export function defineStrings<T extends Record<string, StringEntry>>(strings: { en: T; ar: NoInfer<T> }): Record<Language, T> {
  return strings
}

/** Arabic dates use Iraqi month names with Latin numbering. */
export function localeFor(language: Language): string {
  return language === 'ar' ? 'ar-IQ-u-nu-latn' : 'en-GB'
}

export function formatNumber(language: Language, value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(localeFor(language), options).format(value)
}

export function formatDate(language: Language, value: Date | string | number, options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }): string {
  return new Intl.DateTimeFormat(localeFor(language), options).format(new Date(value))
}

export type PluralForms = { other: string } & Partial<Record<Intl.LDMLPluralRule, string>>

/**
 * Picks the grammatical form for a count; `{n}` becomes the formatted number.
 * Arabic uses zero, one, two, few (3–10), many (11–99) and other; English uses one and other.
 */
export function plural(language: Language, count: number, forms: PluralForms): string {
  const rule = new Intl.PluralRules(language).select(count)
  return (forms[rule] ?? forms.other).replaceAll('{n}', formatNumber(language, count))
}

const EASTERN_DIGITS = /[٠-٩۰-۹]/g
const HAS_EASTERN_DIGIT = /[٠-٩۰-۹]/

/** Converts Arabic-Indic and Persian digits to Western digits. */
export function westernDigits(text: string): string {
  return text.replace(EASTERN_DIGITS, (digit) => String(digit.charCodeAt(0) & 0xf))
}

export interface StringIssue { path: string; problem: string }

const SAMPLE_ARGS = [3, 7, 'Sample']
const LETTERS = /[A-Za-z]{3,}/
const ARABIC = /[؀-ۿ]/
// Product names and codes that stay in English inside Arabic text.
const KEEP_LATIN = /\b(ExamGO|MineGO|Studio|EN|DOCX|CSV|Word|v\d+)\b/g

/** Finds empty, untranslated and Eastern-digit Arabic entries; used by the completeness test. */
export function checkStrings(strings: Record<Language, Record<string, StringEntry>>, prefix = ''): StringIssue[] {
  const issues: StringIssue[] = []
  const walk = (en: StringEntry | undefined, ar: StringEntry | undefined, path: string) => {
    if (ar === undefined) { issues.push({ path, problem: 'missing in Arabic' }); return }
    if (typeof en === 'object' && typeof ar === 'object') {
      for (const key of Object.keys(en)) walk(en[key], ar[key], `${path}.${key}`)
      return
    }
    const sample = (entry: StringEntry | undefined) =>
      typeof entry === 'function' ? (entry as (...args: unknown[]) => string)(...SAMPLE_ARGS) : String(entry)
    const arText = sample(ar)
    if (!arText.trim()) issues.push({ path, problem: 'empty' })
    else if (HAS_EASTERN_DIGIT.test(arText)) issues.push({ path, problem: 'Eastern digits' })
    else if (LETTERS.test(arText.replace(KEEP_LATIN, '').replace(/Sample/g, '')) && !ARABIC.test(arText)) issues.push({ path, problem: 'not translated' })
  }
  for (const key of Object.keys(strings.en)) walk(strings.en[key], strings.ar[key], `${prefix}${key}`)
  return issues
}
