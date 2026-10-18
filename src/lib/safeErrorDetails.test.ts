import { afterEach, describe, expect, it, vi } from 'vitest'
import { getSafeErrorDetails, reportSafeError, teacherErrorMessage } from './safeErrorDetails'

afterEach(() => vi.restoreAllMocks())

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

  it('correlates each teacher-safe failure with one sanitized local diagnostic', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const error = Object.assign(new Error('private account, token and question text'), {
      code: '42501', status: 403, details: 'private SQL', hint: 'private path',
    })
    const first = reportSafeError(error, 'Save could not be confirmed. Retry the same save.')
    const second = reportSafeError(error, 'Save could not be confirmed. Retry the same save.')
    expect(first).toMatch(/^Save could not be confirmed\. Retry the same save\. Reference: EG-[0-9a-f-]{36}$/)
    expect(first).not.toBe(second)
    expect(log.mock.calls[0]).toEqual(['[ExamGO] operation failed', {
      reference: first.split('Reference: ')[1], name: 'Error', status: 403,
    }])
    expect(JSON.stringify(log.mock.calls)).not.toContain('private')
    expect(first).not.toContain('private')
  })
})

describe('teacherErrorMessage', () => {
  it('shows application-owned messages unchanged without logging', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    class QuestionBankDataError extends Error { name = 'QuestionBankDataError' }

    expect(teacherErrorMessage(new Error('Reopen the draft and review current questions.'), 'Fallback.'))
      .toBe('Reopen the draft and review current questions.')
    expect(teacherErrorMessage(new QuestionBankDataError('Bank name already used.'), 'Fallback.'))
      .toBe('Bank name already used.')
    expect(log).not.toHaveBeenCalled()
  })

  it.each([
    ['network failure', new TypeError('Failed to fetch')],
    ['runtime fault', new TypeError("Cannot read properties of undefined (reading 'items')")],
    ['bad JSON', new SyntaxError('Unexpected token < in JSON at position 0')],
    ['aborted request', new DOMException('The user aborted a request.', 'AbortError')],
    ['raw provider error', Object.assign(new Error('duplicate key value violates unique constraint "questions_pkey"'), { name: 'PostgrestError', code: '23505', details: 'Key (id)=(…) already exists.' })],
    ['database detail on a plain error', Object.assign(new Error('relation "private.preset_reviewers" does not exist'), { details: null, hint: 'Check the schema.' })],
    ['auth provider error', Object.assign(new Error('Invalid login credentials'), { name: 'AuthApiError' })],
    ['empty message', new Error('  ')],
    ['thrown string', 'private thrown value'],
  ])('replaces a %s with the fallback and a reference', (_label, error) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const message = teacherErrorMessage(error, 'Questions could not be loaded. Retry loading banks.')

    expect(message).toMatch(/^Questions could not be loaded\. Retry loading banks\. Reference: EG-[0-9a-f-]{36}$/)
    expect(log).toHaveBeenCalledOnce()
    const logged = JSON.stringify(log.mock.calls[0])
    expect(logged).toContain(message.split('Reference: ')[1])
    expect(logged).not.toMatch(/fetch|undefined|JSON at|aborted|duplicate key|preset_reviewers|login credentials|private thrown/)
  })
})
