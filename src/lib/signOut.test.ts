import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { signOutWithRetry } from './signOut'

function client(results: Array<{ error: unknown }>, token: string | null = 'access-token') {
  const order: string[] = []
  const adminSignOut = vi.fn(async (jwt: string, scope: string) => { order.push(`server:${scope}`); expect(jwt).toBe(token); return results.shift() ?? { error: null } })
  const localSignOut = vi.fn(async (options: { scope: string }) => { order.push(`device:${options.scope}`); return { error: null } })
  const auth = {
    getSession: vi.fn(async () => ({ data: { session: token ? { access_token: token } : null }, error: null })),
    admin: { signOut: adminSignOut },
    signOut: localSignOut,
  }
  return { client: { auth } as never, adminSignOut, localSignOut, order }
}
const noWait = vi.fn(async () => undefined)
const network = () => new AuthRetryableFetchError('Failed to fetch', 0)

describe('signOutWithRetry', () => {
  it('ends the server session before clearing this device', async () => {
    const c = client([{ error: null }])
    expect(await signOutWithRetry(c.client, 'global', noWait)).toEqual({ serverConfirmed: true })
    expect(c.order).toEqual(['server:global', 'device:local'])
  })

  it('retries a network failure and succeeds on a later attempt', async () => {
    const c = client([{ error: network() }, { error: network() }, { error: null }])
    const wait = vi.fn(async () => undefined)
    expect(await signOutWithRetry(c.client, 'local', wait)).toEqual({ serverConfirmed: true })
    expect(c.adminSignOut).toHaveBeenCalledTimes(3)
    expect(wait.mock.calls).toEqual([[800], [2000]])
  })

  it('treats an already-invalid server session as ended', async () => {
    const c = client([{ error: new AuthApiError('Session not found', 404, 'session_not_found') }])
    expect((await signOutWithRetry(c.client, 'local', noWait)).serverConfirmed).toBe(true)
    expect(c.adminSignOut).toHaveBeenCalledTimes(1)
  })

  it('still clears this device and reports failure after three failed attempts', async () => {
    const c = client([{ error: network() }, { error: network() }, { error: network() }])
    const result = await signOutWithRetry(c.client, 'global', noWait)
    expect(result.serverConfirmed).toBe(false)
    expect(result.error).toBeInstanceOf(AuthRetryableFetchError)
    expect(c.order).toEqual(['server:global', 'server:global', 'server:global', 'device:local'])
  })

  it('does not retry a server rejection forever', async () => {
    const c = client([{ error: new AuthApiError('boom', 500, 'unexpected_failure') }, { error: new AuthApiError('boom', 500, 'unexpected_failure') }, { error: new AuthApiError('boom', 500, 'unexpected_failure') }])
    expect((await signOutWithRetry(c.client, 'local', noWait)).serverConfirmed).toBe(false)
    expect(c.adminSignOut).toHaveBeenCalledTimes(3)
  })

  it('only clears the device when there is no session', async () => {
    const c = client([], null)
    expect(await signOutWithRetry(c.client, 'local', noWait)).toEqual({ serverConfirmed: true })
    expect(c.adminSignOut).not.toHaveBeenCalled()
    expect(c.localSignOut).toHaveBeenCalledOnce()
  })
})
