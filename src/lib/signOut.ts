import { isAuthApiError, type SupabaseClient } from '@supabase/supabase-js'

/** `local` ends this device's session; `global` ends every session for the account. */
export type SignOutScope = 'local' | 'global'

export interface SignOutResult {
  /** True when the server confirmed the session ended (or it was already invalid there). */
  serverConfirmed: boolean
  error?: unknown
}

const RETRY_DELAYS_MS = [0, 800, 2000]
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * supabase-js clears the local session as soon as its server sign-out fails, leaving the
 * server refresh token valid. End the server session first, with retries, while the token
 * is still available; then always clear this device.
 */
export async function signOutWithRetry(
  client: Pick<SupabaseClient, 'auth'>,
  scope: SignOutScope,
  wait: (ms: number) => Promise<void> = sleep,
): Promise<SignOutResult> {
  const { data } = await client.auth.getSession()
  const token = data.session?.access_token
  let serverConfirmed = !token
  let lastError: unknown
  if (token) {
    for (const delay of RETRY_DELAYS_MS) {
      if (delay) await wait(delay)
      const { error } = await client.auth.admin.signOut(token, scope)
      // 401/403/404: the session is already invalid on the server, which is the goal.
      if (!error || (isAuthApiError(error) && [401, 403, 404].includes(error.status))) {
        serverConfirmed = true
        break
      }
      lastError = error
    }
  }
  try {
    await client.auth.signOut({ scope: 'local' })
  } catch {
    // supabase-js removes the local session before reporting a failure; nothing else to do.
  }
  return serverConfirmed ? { serverConfirmed } : { serverConfirmed, error: lastError }
}
