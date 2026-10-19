import { useEffect, useId, useState } from 'react'
import type { PresetCoverageReport } from '../lib/presetCoverageRepository'
import { getReviewedCoverageOverview, type ReviewedCoverageOverview } from '../lib/reviewedCoverage'

const typeNames: Record<string, string> = { 'multiple-choice': 'Multiple choice', binary: 'True/False or Yes/No',
  'short-answer': 'Short answer', completion: 'Completion', 'odd-word': 'Odd word', matching: 'List A/List B matching',
  'word-relationship': 'Word relationship', rewrite: 'Sentence rewrite', 'extended-writing': 'Writing' }

export function PresetCoverageTable({ report }: { report: PresetCoverageReport }) {
  const numbers = new Intl.NumberFormat('en')
  return <div className="preset-coverage-scroll" role="region" aria-label="Preset coverage by unit" tabIndex={0}>
    <table className="preset-coverage-table">
      <caption>Current Unit 1 builder formats</caption>
      <thead><tr><th scope="col">Unit</th><th scope="col">Published questions</th>
        <th scope="col">Builder exercises</th><th scope="col">Individual questions</th><th scope="col">Builder status</th></tr></thead>
      <tbody>{report.units.map(unit => <tr key={unit.unit}>
        <th scope="row">{unit.unit}</th><td>{numbers.format(unit.publishedQuestionCount)}</td>
        <td>{numbers.format(unit.capturableGroupCount)}</td><td>{numbers.format(unit.capturableStandaloneCount)}</td>
        <td>{unit.capturableGroupCount || unit.capturableStandaloneCount ? 'Limited format' : 'Not available in this format'}</td>
      </tr>)}</tbody>
    </table>
  </div>
}

export function ReviewedSourceCoverage({ overview }: { overview: ReviewedCoverageOverview }) {
  const numbers = new Intl.NumberFormat('en')
  return <>
    <div className="preset-coverage-scroll" role="region" aria-label="Reviewed source supply by exam period" tabIndex={0}>
      <table className="preset-coverage-table">
        <caption>Complete reviewed source inventory</caption>
        <thead><tr><th scope="col">Period</th><th scope="col">Units</th><th scope="col">Exercises</th><th scope="col">Displayed items</th>
          <th scope="col"><abbr title="Same ordered question types, units and response counts. This is a source-only comparison, not a full-paper replacement check.">Formats without distinct alternatives</abbr></th></tr></thead>
        <tbody>{overview.profiles.map(profile => <tr key={profile.name}>
          <th scope="row">{profile.name}</th><td>{profile.units.join(', ')}</td><td>{numbers.format(profile.exercises)}</td>
          <td>{numbers.format(profile.displayedPoints)}</td><td>{profile.formatsWithoutAlternative === null ? 'Not assessed' :
            `${numbers.format(profile.formatsWithoutAlternative)} of ${numbers.format(profile.formats)}`}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <p className="preset-coverage-note">Source inventory only. Full-paper approval and replacement checks remain pending.</p>
    <details className="preset-coverage-details"><summary>Lesson and question-type gaps</summary>
      <p className="preset-coverage-note">Lesson alignment: unconfirmed. Difficulty: not calibrated. Edition: unconfirmed.</p>
      <div className="preset-coverage-scroll" role="region" aria-label="Observed lessons without reviewed exercises" tabIndex={0}>
        <table className="preset-coverage-table"><caption>Published lesson labels without a complete reviewed exercise</caption>
          <thead><tr><th scope="col">Unit</th><th scope="col">Lesson labels</th></tr></thead>
          <tbody>{overview.units.map(unit => <tr key={unit.unit}><th scope="row">{unit.unit}</th>
            <td>{unit.missingObservedLessons.join(', ') || 'None among published labels'}</td></tr>)}</tbody>
        </table>
      </div>
      <div className="preset-coverage-scroll" role="region" aria-label="Question type inventory by unit" tabIndex={0}>
        <table className="preset-coverage-table"><caption>Question type inventory</caption>
          <thead><tr><th scope="col">Unit</th><th scope="col">Question type</th><th scope="col">Published questions</th><th scope="col">Questions in complete reviewed sources</th></tr></thead>
          <tbody>{overview.units.flatMap(unit => unit.types.map(type => <tr key={`${unit.unit}-${type.type}`}>
            <th scope="row">{unit.unit}</th><td>{typeNames[type.type]}</td><td>{numbers.format(type.publishedRecords)}</td>
            <td>{numbers.format(type.completeSourceRecords)}</td></tr>))}</tbody>
        </table>
      </div>
    </details>
  </>
}

export default function PresetCoverageSummary({ ownerId }: { ownerId: string }) {
  const id = useId()
  const [result, setResult] = useState<{ ownerId: string; retry: number; overview: ReviewedCoverageOverview | null; error: string } | null>(null)
  const [retry, setRetry] = useState(0)
  const current = result?.ownerId === ownerId && result.retry === retry ? result : null
  const loading = current === null, overview = current?.overview ?? null, error = current?.error ?? ''
  useEffect(() => {
    let active = true
    void getReviewedCoverageOverview(ownerId).then(value => { if (active) setResult({ ownerId, retry, overview: value, error: '' }) })
      .catch(() => { if (active) setResult({ ownerId, retry, overview: null, error: 'Coverage overview unavailable. Reload and try again.' }) })
    return () => { active = false }
  }, [ownerId, retry])
  return <section className="preset-coverage" aria-labelledby={id} aria-busy={loading}>
    <div className="preset-coverage-heading"><h3 id={id}>Preset coverage</h3>
      <button className="button-secondary preset-coverage-reload" type="button" aria-label="Reload coverage" title="Reload coverage" disabled={loading} onClick={() => {
        setRetry(value => value + 1)
      }}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M14.5 9a5.5 5.5 0 1 1-1.6-3.9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="M13.4 2.6v3h-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
    </div>
    {loading && <p role="status">Loading preset coverage...</p>}
    {error && <p role="alert">{error}</p>}
    {overview && <><ReviewedSourceCoverage overview={overview}/><details className="preset-coverage-details">
      <summary>Current builder availability</summary><PresetCoverageTable report={overview.legacy}/></details></>}
  </section>
}
