import { useId, type ReactNode } from 'react'

/** One choice from a short list, as pills. Native radios underneath keep keyboard and screen-reader behaviour. */
export function ChoiceChips<T extends string | number>({ legend, options, value, onChange, disabled, hint }: {
  legend: string
  options: readonly { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  disabled?: boolean
  hint?: ReactNode
}) {
  const name = useId()
  return <fieldset className="chip-group" disabled={disabled}>
    <legend>{legend}</legend>
    <div className="chips">
      {options.map((option) => <label key={String(option.value)} className="chip">
        <input type="radio" name={name} checked={option.value === value} onChange={() => onChange(option.value)} />
        <span>{option.label}</span>
      </label>)}
    </div>
    {hint && <p className="field-help">{hint}</p>}
  </fieldset>
}

/** A pill that toggles one item on or off (a native checkbox underneath). */
export function ToggleChip({ label, checked, disabled, onChange }: {
  label: string
  checked: boolean
  disabled?: boolean
  onChange: () => void
}) {
  return <label className="chip chip-toggle">
    <input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} />
    <span>{label}</span>
  </label>
}

/** A number with − and + beside it; the number stays typeable for teachers who prefer it. */
export function Stepper({ label, hint, value, min = 0, max, disabled, onChange }: {
  label: string
  hint?: string
  value: number
  min?: number
  max: number
  disabled?: boolean
  onChange: (value: number) => void
}) {
  const clamp = (next: number): number => Math.min(Math.max(next, min), max)
  return <div className="stepper">
    <label className="stepper-label">
      <span>{label}</span>{' '}
      {hint && <small>{hint}</small>}
      <input type="number" inputMode="numeric" min={min} max={max} step="1" value={value} disabled={disabled}
        onChange={(event) => onChange(event.target.valueAsNumber || 0)} />
    </label>
    <div className="stepper-buttons">
      <button type="button" className="button-secondary" aria-label={`Fewer: ${label}`} disabled={disabled || value <= min}
        onClick={() => onChange(clamp(value - 1))}><svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16"><path d="M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></button>
      <button type="button" className="button-secondary" aria-label={`More: ${label}`} disabled={disabled || value >= max}
        onClick={() => onChange(clamp(value + 1))}><svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16"><path d="M3 8h10M8 3v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></button>
    </div>
  </div>
}

/** A titled group inside a form, quieter than a card. */
export function FormGroup({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return <div className="form-group">
    <div className="form-group-header"><h3>{title}</h3>{aside && <span className="form-group-aside">{aside}</span>}</div>
    {children}
  </div>
}
