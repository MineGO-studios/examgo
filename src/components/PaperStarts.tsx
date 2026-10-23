export type PaperStart = 'simple' | 'presets' | 'phase-nine' | 'phase-ten-candidate' | 'blueprint'

interface StartOption {
  id: PaperStart
  title: string
  description: string
  preview: 'own' | 'approved' | 'exercise' | 'structured'
  /** Honest current coverage, shown as small tags. */
  coverage?: readonly string[]
}

const TEACHER_STARTS: readonly StartOption[] = [
  { id: 'simple', title: 'Pick questions by type', description: 'Choose how many of each question type and set the marks.', preview: 'own', coverage: ['Unit 1'] },
  { id: 'presets', title: 'Use a preset exam paper made by MineGO', description: 'A ready-made MineGO paper, kept in source order with its answer key.', preview: 'approved', coverage: ['Unit 1'] },
]

const DEVELOPMENT_STARTS: readonly StartOption[] = [
  { id: 'phase-ten-candidate', title: 'Complete paper candidate', description: 'Fixed-profile paper for development checks.', preview: 'exercise' },
  { id: 'blueprint', title: 'Structured paper', description: 'Configurable structure, in development.', preview: 'structured' },
]

/** A miniature of the sheet each start produces, so the choice shows its result. */
function MiniSheet({ kind }: { kind: StartOption['preview'] }) {
  return <span className={`mini-sheet mini-sheet-${kind}`} aria-hidden="true">
    <span className="mini-sheet-header"><i /><i /><i /></span>
    {kind === 'exercise' && <span className="mini-sheet-passage" />}
    <span className="mini-sheet-row"><i /><b /></span>
    <span className="mini-sheet-row"><i /><b /></span>
    {kind !== 'exercise' && <span className="mini-sheet-row"><i /><b /></span>}
    {kind === 'approved' && <span className="mini-sheet-seal" />}
  </span>
}

/** An unavailable shape stays visible and focusable, with its reason read out, but does not start. */
function StartCard({ option, current, onChoose, unavailable }: { option: StartOption; current: PaperStart; onChoose: (start: PaperStart) => void; unavailable?: string }) {
  const descriptionId = `paper-start-${option.id}`
  const reasonId = `${descriptionId}-reason`
  return <li>
    <button type="button" className={`start-card${unavailable ? ' is-unavailable' : ''}`} aria-pressed={current === option.id}
      aria-disabled={unavailable ? true : undefined}
      aria-label={option.title} aria-describedby={unavailable ? `${descriptionId} ${reasonId}` : descriptionId}
      onClick={() => { if (!unavailable) onChoose(option.id) }}>
      <MiniSheet kind={option.preview} />
      <span className="start-card-title">{option.title}</span>
      <span className="start-card-description" id={descriptionId}>{option.description}</span>
      {option.coverage && <span className="start-card-tags">{option.coverage.map((tag) => <span key={tag} className="start-card-tag">{tag}</span>)}</span>}
      {unavailable && <span className="start-card-reason" id={reasonId}>{unavailable}</span>}
    </button>
  </li>
}

/** How the paper starts: the teacher's own banks, or an approved paper. Each card previews its sheet. */
export default function PaperStarts({ current, onChoose, showDevelopment, unavailable = {} }: {
  current: PaperStart
  onChoose: (start: PaperStart) => void
  showDevelopment: { candidate: boolean; structured: boolean }
  /** Plain reasons for shapes the teacher cannot start yet; they stay visible but disabled. */
  unavailable?: Partial<Record<PaperStart, string>>
}) {
  const development = DEVELOPMENT_STARTS.filter((option) => option.id === 'blueprint' ? showDevelopment.structured : showDevelopment.candidate)
  return <section className="paper-starts" aria-labelledby="paper-starts-title">
    <h2 id="paper-starts-title">What kind of paper?</h2>
    <ul className="start-cards">
      {TEACHER_STARTS.map((option) => <StartCard key={option.id} option={option} current={current} onChoose={onChoose} unavailable={unavailable[option.id]} />)}
    </ul>
    {development.length > 0 && <div className="development-starts" role="group" aria-labelledby="development-starts-title">
      <p id="development-starts-title" className="format-chooser-group-label">Development builds only</p>
      <ul className="start-cards">
        {development.map((option) => <StartCard key={option.id} option={option} current={current} onChoose={onChoose} />)}
      </ul>
    </div>}
  </section>
}
