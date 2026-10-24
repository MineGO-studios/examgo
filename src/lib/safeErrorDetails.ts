export type SafeErrorDetails = {
  name: string
  code?: string
  status?: number
}

const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z][A-Za-z0-9._-]{0,63}$/

function getSafeIdentifier(value: unknown): string | undefined {
  return typeof value === 'string' &&
    SAFE_IDENTIFIER_PATTERN.test(value)
    ? value
    : undefined
}

export function getSafeErrorDetails(
  error: unknown,
): SafeErrorDetails {
  if (!error || typeof error !== 'object') {
    return { name: 'UnknownError' }
  }

  const candidate = error as {
    name?: unknown
    code?: unknown
    status?: unknown
  }
  const name = getSafeIdentifier(candidate.name) ?? 'UnknownError'
  const code = getSafeIdentifier(candidate.code)
  const status =
    typeof candidate.status === 'number' &&
    Number.isInteger(candidate.status) &&
    candidate.status >= 100 &&
    candidate.status <= 599
      ? candidate.status
      : undefined

  return {
    name,
    ...(code ? { code } : {}),
    ...(status ? { status } : {}),
  }
}

/** Pass an application-owned message, never exception text or teacher content. */
export function reportSafeError(error: unknown, message: string): string {
  const reference = `EG-${crypto.randomUUID()}`
  console.error('[ExamGO] operation failed', { reference, ...getSafeErrorDetails(error) })
  return `${message} Reference: ${reference}`
}

/** Built-in and platform errors whose text comes from the runtime, not ExamGO. */
const RUNTIME_ERROR_NAMES = new Set([
  'TypeError', 'RangeError', 'SyntaxError', 'ReferenceError', 'EvalError', 'URIError',
  'AggregateError', 'InternalError', 'DOMException', 'AbortError', 'NetworkError',
  'TimeoutError', 'SecurityError', 'QuotaExceededError', 'NotAllowedError',
])
const PROVIDER_ERROR_PREFIXES = ['Auth', 'Postgrest', 'Functions', 'Storage', 'Realtime']

/**
 * Whether an error carries a message ExamGO wrote for teachers. Repositories
 * translate database codes into such messages; runtime, network and raw
 * provider errors do not qualify and may contain internals.
 */
export function isApplicationError(error: unknown): error is Error {
  if (!(error instanceof Error) || typeof DOMException !== 'undefined' && error instanceof DOMException) return false
  if (RUNTIME_ERROR_NAMES.has(error.name) || RUNTIME_ERROR_NAMES.has(error.constructor.name)) return false
  if (PROVIDER_ERROR_PREFIXES.some((prefix) => error.name.startsWith(prefix))) return false
  const candidate = error as { details?: unknown; hint?: unknown }
  return candidate.details === undefined && candidate.hint === undefined && error.message.trim() !== ''
}

/** Show an application-owned message as-is; otherwise the fallback with a diagnostic reference. */
export function teacherErrorMessage(error: unknown, fallback: string): string {
  return isApplicationError(error) ? error.message : reportSafeError(error, fallback)
}
