import { useEffect } from 'react'

/**
 * A saved-work list's load status. When `onLoadFailure` is supplied the parent section
 * announces failures once and owns the retry, so the list reports quietly.
 */
export function SavedWorkStatus({ message, failed, onLoadFailure }: {
  message: string
  failed: boolean
  onLoadFailure?: (failed: boolean) => void
}) {
  useEffect(() => { onLoadFailure?.(failed) }, [failed, onLoadFailure])
  const [text, reference] = message.split(' Reference: ')
  return <p className={failed ? 'saved-work-failure' : undefined} role={failed && !onLoadFailure ? 'alert' : 'status'}>
    {text}
    {reference && <small className="error-reference">Support reference: {reference}</small>}
  </p>
}
