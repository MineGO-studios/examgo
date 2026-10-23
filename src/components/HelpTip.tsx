import * as Tooltip from '@radix-ui/react-tooltip'
import { useRef, useState, type ReactNode } from 'react'
import { Icon } from './icons'
import { useI18n } from '../lib/i18n'

/**
 * A short secondary explanation behind a 44px "?" button. It opens on pointer hover and keyboard focus,
 * stays open while the pointer is over it, closes with Escape, and toggles on tap so touch screens can
 * read it too. Use it only for secondary detail: essential instructions, errors and reasons stay visible.
 */
export function HelpTip({ topic, children }: { topic: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const { language } = useI18n()
  // Radix tooltips ignore touch by design, so a tap toggles the tip here; mouse and keyboard keep Radix behaviour.
  // Only the tap itself is handled here; afterwards Escape and a tap elsewhere close the tip as usual.
  const tap = useRef({ active: false, wasOpen: false })
  // Its own provider keeps the tip usable where no app-wide provider is mounted (tests, isolated views).
  return <Tooltip.Provider delayDuration={300}><Tooltip.Root open={open} onOpenChange={(next) => { if (!tap.current.active) setOpen(next) }}>
    <Tooltip.Trigger asChild>
      <button type="button" className="help-tip" aria-label={language === 'ar' ? `المزيد عن ${topic}` : `More about ${topic}`}
        onPointerDown={(event) => { tap.current = { active: event.pointerType === 'touch', wasOpen: open } }}
        onPointerCancel={() => { tap.current.active = false }}
        onClick={(event) => {
          if (!tap.current.active) return
          event.preventDefault()
          setOpen(!tap.current.wasOpen)
          setTimeout(() => { tap.current.active = false }, 0)
        }}>
        <Icon name="help" />
      </button>
    </Tooltip.Trigger>
    <Tooltip.Portal>
      <Tooltip.Content className="help-tip-content" side="top" align="center" sideOffset={4} collisionPadding={12}>
        {children}
        <Tooltip.Arrow className="help-tip-arrow" width={10} height={5} />
      </Tooltip.Content>
    </Tooltip.Portal>
  </Tooltip.Root></Tooltip.Provider>
}

/** One provider for the app so tooltips share their open delay. */
export function HelpTipProvider({ children }: { children: ReactNode }) {
  return <Tooltip.Provider delayDuration={300} skipDelayDuration={200}>{children}</Tooltip.Provider>
}
