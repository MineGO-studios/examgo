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
