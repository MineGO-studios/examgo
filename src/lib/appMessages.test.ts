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
