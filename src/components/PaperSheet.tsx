import type { CSSProperties } from 'react'
import type { PaperItem } from '../lib/myPapers'

/*
 * The desk sheet and list thumbnail for a saved paper. Title, grade and marks are the paper's own;
 * the question lines are representative and numbered to the paper's question count (at most five).
 */
const INSTRUCTIONS = [
  'Choose the correct answer.',
  'Fill in the blanks.',
  'Read the passage and answer.',
  'Match each word with its meaning.',
  'Write about the picture.',
]
const SIGNATURE = 'M2 15C6 4 10 3 9 12C8 18 14 17 17 9C19 4 22 6 21 12C20 17 26 15 29 9C31 6 33 8 33 12C34 15 38 14 41 10C44 6 47 7 47 11C47 15 52 15 62 6'

function paperSheetSubtitle(item: PaperItem): string {
  return [item.grade ? `Grade ${item.grade}` : null, 'English', item.marks !== undefined ? `${item.marks} marks` : null].filter(Boolean).join(' · ')
}

export function PaperSheet({ item }: { item: PaperItem }) {
  const draft = item.state === 'draft'
  const count = Math.max(2, Math.min(item.questions ?? INSTRUCTIONS.length, INSTRUCTIONS.length))
  const lines = INSTRUCTIONS.slice(0, count)
  const next = lines[count - 1]
  return <div className="paper-sheet" aria-hidden="true" dir="ltr">
    <div className="paper-page">
      <div className="paper-head"><b>{item.title}</b><span>{paperSheetSubtitle(item)}</span></div>
      <div className="paper-name"><span>Name</span><i /><span>Class</span><i className="short" /></div>
      {lines.slice(0, draft ? -1 : undefined).map((text, index) =>
        <div className="paper-q" key={text}><p>Q{index + 1}. {text}</p><i /><i /></div>)}
      {draft
        ? <div className="paper-q"><p>Q{count}. <span className="paper-type" style={{ '--chars': next.length } as CSSProperties}>{next}</span><span className="paper-caret" /></p><i /><i /></div>
        : <div className="paper-sign"><span>Teacher</span><svg viewBox="0 0 64 20"><path pathLength={1} d={SIGNATURE} /></svg></div>}
      {!draft && <span className="paper-stamp">FINAL</span>}
    </div>
  </div>
}

export function PaperThumb({ final }: { final: boolean }) {
  return <span className={`paper-thumb${final ? ' is-final' : ''}`} aria-hidden="true">
    <span className="h" />
    {[0, 1, 2, 3].map(line => <span className="l" key={line}><i /><b /></span>)}
    {final && <span className="seal" />}
  </span>
}
