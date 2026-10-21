import { useEffect, useRef } from 'react'

export interface ErrorSummaryItem {
  /** The id of the field (or fieldset) to focus. */
  target: string
  message: string
}

/**
 * The GOV.UK error-summary pattern: after a failed submit, focus moves here and each problem links to its field.
 * Field messages stay beside their fields; only this summary is announced, so several errors do not speak at once.
 */
export function ErrorSummary({ items, attempt, title = 'There is a problem' }: {
  items: readonly ErrorSummaryItem[]
  /** Increase on every failed submit so focus returns to the summary. */
  attempt: number
  title?: string
}) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (attempt > 0 && items.length > 0) box.current?.focus()
  }, [attempt, items.length])
  if (items.length === 0) return null
  return <div ref={box} className="error-summary" role="alert" aria-labelledby="error-summary-title" tabIndex={-1}>
    <h3 id="error-summary-title">{title}</h3>
    <ul>
      {items.map((item) => <li key={item.target}>
        <a href={`#${item.target}`} onClick={(event) => {
          event.preventDefault()
          const field = document.getElementById(item.target)
          if (!field) return
          // A field inside closed "More options" is revealed before it is focused.
          const details = field.closest('details')
          if (details && !details.open) details.open = true
          field.focus()
          field.scrollIntoView({ block: 'center' })
        }}>{item.message}</a>
      </li>)}
    </ul>
  </div>
}
