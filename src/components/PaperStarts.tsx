export type PaperStart = 'simple' | 'presets' | 'phase-nine' | 'phase-ten-candidate' | 'blueprint'

interface StartOption {
  id: PaperStart
  title: string
  description: string
  preview: 'own' | 'approved' | 'exercise' | 'structured'
}

const TEACHER_STARTS: readonly StartOption[] = [
  { id: 'simple', title: 'My question banks', description: 'Choice, true/false and short answers you pick and mark.', preview: 'own' },
  { id: 'presets', title: 'Approved preset papers', description: 'Ready papers reviewed by MineGO.', preview: 'approved' },
  { id: 'phase-nine', title: 'Iraqi exercises and writing', description: 'Passages, exercises and a writing task.', preview: 'exercise' },
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

function StartCard({ option, current, onChoose }: { option: StartOption; current: PaperStart; onChoose: (start: PaperStart) => void }) {
  const descriptionId = `paper-start-${option.id}`
  return <li>
    <button type="button" className="start-card" aria-pressed={current === option.id}
      aria-label={option.title} aria-describedby={descriptionId} onClick={() => onChoose(option.id)}>
      <MiniSheet kind={option.preview} />
      <span className="start-card-title">{option.title}</span>
      <span className="start-card-description" id={descriptionId}>{option.description}</span>
    </button>
  </li>
}

/** How the paper starts: the teacher's own banks, or an approved paper. Each card previews its sheet. */
export default function PaperStarts({ current, onChoose, showDevelopment }: {
  current: PaperStart
  onChoose: (start: PaperStart) => void
  showDevelopment: { candidate: boolean; structured: boolean }
}) {
  const development = DEVELOPMENT_STARTS.filter((option) => option.id === 'blueprint' ? showDevelopment.structured : showDevelopment.candidate)
  return <section className="paper-starts" aria-labelledby="paper-starts-title">
    <h2 id="paper-starts-title">Start from</h2>
    <ul className="start-cards">
      {TEACHER_STARTS.map((option) => <StartCard key={option.id} option={option} current={current} onChoose={onChoose} />)}
    </ul>
    {development.length > 0 && <div className="development-starts" role="group" aria-labelledby="development-starts-title">
      <p id="development-starts-title" className="format-chooser-group-label">Development builds only</p>
      <ul className="start-cards">
        {development.map((option) => <StartCard key={option.id} option={option} current={current} onChoose={onChoose} />)}
      </ul>
    </div>}
  </section>
}
