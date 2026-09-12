import { describe, expect, it } from 'vitest'
import { getSafeErrorDetails } from './safeErrorDetails'

describe('getSafeErrorDetails', () => {
  it('keeps only allow-listed diagnostic fields', () => {
    const error = Object.assign(
      new Error('Password and private user detail'),
      {
        name: 'AuthApiError',
        code: 'invalid_credentials',
        status: 400,
        password: 'do-not-log-this',
        token: 'do-not-log-this-either',
      },
    )

    expect(getSafeErrorDetails(error)).toEqual({
      name: 'AuthApiError',
      code: 'invalid_credentials',
      status: 400,
    })
  })

  it('rejects unsafe or malformed diagnostic values', () => {
    expect(
      getSafeErrorDetails({
        name: 'Error with private detail',
        code: '<secret>',
        status: 999,
        message: 'Sensitive message',
        stack: 'Sensitive stack',
      }),
    ).toEqual({ name: 'UnknownError' })
  })

  it('handles non-object thrown values without echoing them', () => {
    expect(getSafeErrorDetails('private thrown value')).toEqual({
      name: 'UnknownError',
    })
  })
})
