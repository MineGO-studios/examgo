import type { Language } from './i18n'

/*
 * Application-owned messages are written in English inside repositories and domain code,
 * and tests rely on that text. They are translated here, at the display boundary, so the
 * domain stays unchanged (MIN-56). An unlisted message is shown in English rather than
 * guessed; screens fill this catalog as they are translated.
 */

type Translation = string | ((match: RegExpMatchArray) => string)

/** Exact English text, or a pattern whose groups carry the variable parts. */
const ARABIC: ReadonlyArray<readonly [string | RegExp, Translation]> = [
  ['Nothing was changed.', 'لم يتغيّر شيء.'],
]

const REFERENCE = /\s*Reference: (EG-[0-9a-f-]+)$/i

function translateOne(message: string): string | undefined {
  for (const [source, target] of ARABIC) {
    if (typeof source === 'string') {
      if (source === message) return typeof target === 'string' ? target : undefined
      continue
    }
    const match = message.match(source)
    if (match && match[0] === message) return typeof target === 'string' ? target : target(match)
  }
  return undefined
}

/** A message built from known sentences; never a half-translated mix. */
function translateSentences(message: string): string | undefined {
  const sentences = message.match(/[^.!?]+[.!?]+/g)
  if (!sentences || sentences.join('').length !== message.length) return undefined
  const parts = sentences.map((sentence) => translateOne(sentence.trim()))
  return parts.every((part) => part !== undefined) ? parts.join(' ') : undefined
}

/** The Arabic for an application message, keeping any support reference code unchanged. */
export function localizeAppMessage(language: Language, message: string): string {
  if (language === 'en') return message
  const reference = message.match(REFERENCE)
  const body = reference ? message.slice(0, reference.index).trim() : message
  const translated = translateOne(body) ?? translateSentences(body) ?? body
  return reference ? `${translated} ${referenceLabel(language)} ${reference[1]}` : translated
}

export function referenceLabel(language: Language): string {
  return language === 'ar' ? 'الرمز المرجعي:' : 'Reference:'
}
