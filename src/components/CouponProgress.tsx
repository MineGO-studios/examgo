/**
 * The coupon book: while documents are prepared, each finished step tears off in turn.
 * Purely visual; the builder's status message carries the announcement.
 */
export default function CouponProgress({ steps, working, pendingLabel = 'Preparing documents…' }: { steps: readonly string[]; working: boolean; pendingLabel?: string }) {
  if (!working) return null
  return <div className="coupon-strip" aria-hidden="true">
    {steps.map((step, index) => <span key={step} className="coupon" style={{ animationDelay: `${index * 220}ms` }}>
      <span className="coupon-number">{index + 1}</span>{step}
    </span>)}
    <span className="coupon coupon-pending"><span className="coupon-number">{steps.length + 1}</span>{pendingLabel}</span>
  </div>
}

/** The stamp lands once, only after the outcome is confirmed. */
export function PaperStamp({ label }: { label: string }) {
  return <p className="paper-stamp" aria-hidden="true">{label}</p>
}
