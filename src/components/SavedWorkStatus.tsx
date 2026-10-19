/**
 * A saved-work list's load status. When the parent section is `managed`, it announces
 * failures once and owns the retry, so the list reports quietly.
 */
export function SavedWorkStatus({ message, failed, managed }: {
  message: string
  failed: boolean
  managed: boolean
}) {
  const [text, reference] = message.split(' Reference: ')
  // A managed section already announces the failure; the list only notes it quietly.
  const shown = failed && managed ? 'Not loaded.' : text
  const shortReference = reference?.slice(0, 11)
  return <p className={failed ? 'saved-work-failure' : undefined} role={failed && !managed ? 'alert' : 'status'}>
    {shown}
    {reference && <small className="error-reference" title={reference}>Ref {shortReference}</small>}
  </p>
}
