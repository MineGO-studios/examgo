import { useI18n, type MessageKey } from '../lib/i18n'

export type PaperStep = 'format' | 'setup' | 'review' | 'download'

const STEPS: readonly { id: PaperStep; label: MessageKey }[] = [
  { id: 'format', label: 'stepFormat' },
  { id: 'setup', label: 'stepSetup' },
  { id: 'review', label: 'stepReview' },
  { id: 'download', label: 'stepDownload' },
]

/** Where the paper is in its life: earlier steps read as done, the current one is marked for assistive tech. */
export default function PaperProgress({ current }: { current: PaperStep }) {
  const { t } = useI18n()
  const currentIndex = STEPS.findIndex((step) => step.id === current)
  return <ol className="paper-progress" aria-label={t('progress')}>
    {STEPS.map((step, index) => <li key={step.id}
      className={index < currentIndex ? 'is-done' : index === currentIndex ? 'is-current' : undefined}
      aria-current={index === currentIndex ? 'step' : undefined}>
      <span className="paper-progress-number">{index + 1}</span><span className="paper-progress-label">{t(step.label)}</span>
    </li>)}
  </ol>
}
