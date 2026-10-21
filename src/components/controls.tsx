import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Icon } from './icons'

/** More options than this become a dropdown instead of a row of pills, so screens stay calm. */
export const MAX_INLINE_OPTIONS = 5

/** One choice from a short list, as pills. Native radios underneath keep keyboard and screen-reader behaviour. */
export function ChoiceChips<T extends string | number>({ legend, options, value, onChange, disabled, hint, variant = 'chips', maxInlineOptions = MAX_INLINE_OPTIONS }: {
  legend: string
  options: readonly { value: T; label: string; detail?: string }[]
  value: T
  onChange: (value: T) => void
  disabled?: boolean
  hint?: ReactNode
  /** "list" stacks full-width choices for long labels such as exercises or bank names. */
  variant?: 'chips' | 'list'
  /** A specific selector may keep a few more short choices visible. */
  maxInlineOptions?: number
}) {
  const name = useId()
  if (options.length > maxInlineOptions) {
    const chosen = options.find((option) => option.value === value)
    return <label className="text-field eg-select">
      <span>{legend}</span>
      <select value={String(value)} disabled={disabled}
        onChange={(event) => { const next = options.find((option) => String(option.value) === event.target.value); if (next) onChange(next.value) }}>
        {options.map((option) => <option key={String(option.value)} value={String(option.value)}>
          {option.detail ? `${option.label} (${option.detail})` : option.label}
        </option>)}
      </select>
      {chosen?.detail && variant === 'list' && <small className="field-help">{chosen.detail}</small>}
      {hint && <small className="field-help">{hint}</small>}
    </label>
  }
  return <fieldset className="chip-group" disabled={disabled}>
    <legend>{legend}</legend>
    <div className={variant === 'list' ? 'chips chips-list' : 'chips'}>
      {options.map((option) => <label key={String(option.value)} className="chip">
        <input type="radio" name={name} checked={option.value === value} onChange={() => onChange(option.value)} />
        <span>{option.label}{option.detail && <small className="chip-detail">{option.detail}</small>}</span>
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
        onClick={() => onChange(clamp(value - 1))}><Icon name="remove" /></button>
      <button type="button" className="button-secondary" aria-label={`More: ${label}`} disabled={disabled || value >= max}
        onClick={() => onChange(clamp(value + 1))}><Icon name="add" /></button>
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

/**
 * Several on/off choices, such as the question banks used in a paper. Up to five show as pills;
 * more become one dropdown button that opens a checkbox list.
 */
export function ToggleChipGroup({ legend, items, disabled, hint }: {
  legend: string
  items: readonly { key: string; label: string; checked: boolean; disabled?: boolean; onToggle: () => void }[]
  disabled?: boolean
  hint?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const panelId = useId()
  useEffect(() => {
    if (!open) return
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === 'Escape') { setOpen(false); root.current?.querySelector<HTMLElement>('.eg-multi-button')?.focus() }
        return
      }
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', close) }
  }, [open])
  if (items.length <= MAX_INLINE_OPTIONS) {
    return <fieldset className="chip-group" disabled={disabled}>
      <legend>{legend}</legend>
      <div className="chips">
        {items.map((item) => <ToggleChip key={item.key} label={item.label} checked={item.checked} disabled={item.disabled} onChange={item.onToggle} />)}
      </div>
      {hint && <p className="field-help">{hint}</p>}
    </fieldset>
  }
  const chosen = items.filter((item) => item.checked)
  const summary = chosen.length === 0 ? 'None selected' : chosen.length <= 2 ? chosen.map((item) => item.label).join(', ') : `${chosen.length} selected`
  return <div className="eg-multi" ref={root}>
    <span className="eg-multi-legend" id={`${panelId}-legend`}>{legend}</span>
    <button type="button" className="eg-multi-button" disabled={disabled} aria-expanded={open} aria-controls={panelId}
      aria-labelledby={`${panelId}-legend ${panelId}-summary`} onClick={() => setOpen((current) => !current)}>
      <span id={`${panelId}-summary`}>{summary}</span>
      <Icon name="expand" />
    </button>
    {open && <fieldset className="eg-multi-panel" id={panelId} disabled={disabled}>
      <legend className="visually-hidden">{legend}</legend>
      {items.map((item) => <label key={item.key} className="checkbox-field">
        <input type="checkbox" checked={item.checked} disabled={item.disabled} onChange={item.onToggle} />
        {item.label}
      </label>)}
    </fieldset>}
    {hint && <p className="field-help">{hint}</p>}
  </div>
}
