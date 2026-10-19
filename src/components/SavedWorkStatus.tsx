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
  return <p className={failed ? 'saved-work-failure' : undefined} role={failed && !managed ? 'alert' : 'status'}>
    {text}
    {reference && <small className="error-reference">Support reference: {reference}</small>}
  </p>
}
