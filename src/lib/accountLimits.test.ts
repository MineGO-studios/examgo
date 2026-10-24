import { describe, expect, it } from 'vitest'
import { accountLimitError } from './accountLimits'
import { isApplicationError } from './safeErrorDetails'

describe('accountLimitError', () => {
  it('ignores other errors', () => {
    expect(accountLimitError(null)).toBeNull()
    expect(accountLimitError({ code: '23505' })).toBeNull()
  })

  it.each([
    ['account-limit:question_banks:total', /limit of question banks/],
    ['account-limit:questions:total', /limit of questions/],
    ['account-limit:exam_drafts:total', /limit of saved drafts/],
    ['account-limit:exam_snapshots:total', /limit of finalized papers/],
    ['account-limit:exam_snapshots:rate', /finalized many papers in the last hour/],
    ['account-limit:catalogue_imports:rate', /many imports today/],
  ])('translates %s', (hint, expected) => {
    const error = accountLimitError({ code: '53400', hint })
    expect(error?.message).toMatch(expected)
    expect(error?.message).not.toMatch(/\d/)
    expect(isApplicationError(error)).toBe(true)
  })

  it('falls back safely for an unknown or malformed hint', () => {
    expect(accountLimitError({ code: '53400', hint: 'relation "private.x" leaked' })?.message)
      .toBe('Your account has reached a usage limit. Contact MineGO to raise it.')
    expect(accountLimitError({ code: '53400' })?.message).toMatch(/usage limit/)
  })
})
