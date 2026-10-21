import { describe, expect, it } from 'vitest'
import type { Language } from './i18n'
import { SHELL_STRINGS } from './i18n'
import { checkStrings, type StringEntry } from './localize'

type Dictionary = Record<Language, Record<string, StringEntry>>

// Every screen dictionary lives in a `*.strings.ts` file and is found here automatically.
const modules = import.meta.glob<Record<string, unknown>>('../**/*.strings.ts', { eager: true })

describe('interface strings', () => {
  const dictionaries: [string, Dictionary][] = [['i18n.ts', SHELL_STRINGS as unknown as Dictionary]]
  for (const [file, exports] of Object.entries(modules)) {
    for (const [name, value] of Object.entries(exports)) dictionaries.push([`${file}#${name}`, value as Dictionary])
  }

  it('finds the screen dictionaries', () => {
    expect(dictionaries.length).toBeGreaterThan(2)
  })

  it.each(dictionaries)('%s has a complete Arabic translation', (_name, dictionary) => {
    expect(checkStrings(dictionary)).toEqual([])
  })
})
