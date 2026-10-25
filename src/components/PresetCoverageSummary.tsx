import { useEffect, useId, useState } from 'react'
import type { PresetCoverageReport } from '../lib/presetCoverageRepository'
import { getReviewedCoverageOverview, type ReviewedCoverageOverview } from '../lib/reviewedCoverage'
import { questionTypeLabel } from '../lib/questionTypeLabels'
import { useI18n } from '../lib/i18n'
import { formatNumber } from '../lib/localize'
import { PRESET_STRINGS } from './PresetExams.strings'

export function PresetCoverageTable({ report }: { report: PresetCoverageReport }) {
  const { language } = useI18n(), s = PRESET_STRINGS[language]
  const numbers = { format: (n: number) => formatNumber(language, n) }
  return <div className="preset-coverage-scroll" role="region" aria-label={s.byUnit} tabIndex={0}>
    <table className="preset-coverage-table">
      <caption>{s.builderFormats}</caption>
      <thead><tr><th scope="col">{s.unit}</th><th scope="col">{s.published}</th>
        <th scope="col">{s.builderExercises}</th><th scope="col">{s.individual}</th><th scope="col">{s.builderStatus}</th></tr></thead>
      <tbody>{report.units.map(unit => <tr key={unit.unit}>
        <th scope="row">{unit.unit}</th><td>{numbers.format(unit.publishedQuestionCount)}</td>
        <td>{numbers.format(unit.capturableGroupCount)}</td><td>{numbers.format(unit.capturableStandaloneCount)}</td>
        <td>{unit.capturableGroupCount || unit.capturableStandaloneCount ? s.limited : s.notInFormat}</td>
      </tr>)}</tbody>
    </table>
  </div>
}

export function ReviewedSourceCoverage({ overview }: { overview: ReviewedCoverageOverview }) {
  const { language } = useI18n(), s = PRESET_STRINGS[language]
  const numbers = { format: (n: number) => formatNumber(language, n) }
  return <>
    <div className="preset-coverage-scroll" role="region" aria-label={s.supplyByPeriod} tabIndex={0}>
      <table className="preset-coverage-table">
        <caption>{s.inventory}</caption>
        <thead><tr><th scope="col">{s.period}</th><th scope="col">{s.units}</th><th scope="col">{s.exercises}</th><th scope="col">{s.displayed}</th>
          <th scope="col"><abbr title={s.noAlternativesHint}>{s.noAlternatives}</abbr></th></tr></thead>
        <tbody>{overview.profiles.map(profile => <tr key={profile.name}>
          <th scope="row"><bdi>{profile.name}</bdi></th><td>{profile.units.join(', ')}</td><td>{numbers.format(profile.exercises)}</td>
          <td>{numbers.format(profile.displayedPoints)}</td><td>{profile.formatsWithoutAlternative === null ? s.notAssessed :
            s.ofTotal(numbers.format(profile.formatsWithoutAlternative), numbers.format(profile.formats))}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <p className="preset-coverage-note">{s.inventoryNote}</p>
    <details className="preset-coverage-details"><summary>{s.gaps}</summary>
      <p className="preset-coverage-note">{s.gapsNote}</p>
      <div className="preset-coverage-scroll" role="region" aria-label={s.lessonsWithout} tabIndex={0}>
        <table className="preset-coverage-table"><caption>{s.lessonsCaption}</caption>
          <thead><tr><th scope="col">{s.unit}</th><th scope="col">{s.lessonLabels}</th></tr></thead>
          <tbody>{overview.units.map(unit => <tr key={unit.unit}><th scope="row">{unit.unit}</th>
            <td>{unit.missingObservedLessons.join(', ') || s.noneAmong}</td></tr>)}</tbody>
        </table>
      </div>
      <div className="preset-coverage-scroll" role="region" aria-label={s.typeInventoryLabel} tabIndex={0}>
        <table className="preset-coverage-table"><caption>{s.typeInventory}</caption>
          <thead><tr><th scope="col">{s.unit}</th><th scope="col">{s.questionType}</th><th scope="col">{s.published}</th><th scope="col">{s.inComplete}</th></tr></thead>
          <tbody>{overview.units.flatMap(unit => unit.types.map(type => <tr key={`${unit.unit}-${type.type}`}>
            <th scope="row">{unit.unit}</th><td>{questionTypeLabel(type.type, language)}</td><td>{numbers.format(type.publishedRecords)}</td>
            <td>{numbers.format(type.completeSourceRecords)}</td></tr>))}</tbody>
        </table>
      </div>
    </details>
  </>
}

export default function PresetCoverageSummary({ ownerId }: { ownerId: string }) {
  const { language } = useI18n(), s = PRESET_STRINGS[language]
  const id = useId()
  const [result, setResult] = useState<{ ownerId: string; retry: number; overview: ReviewedCoverageOverview | null; error: string } | null>(null)
  const [retry, setRetry] = useState(0)
  const current = result?.ownerId === ownerId && result.retry === retry ? result : null
  const loading = current === null, overview = current?.overview ?? null, error = current?.error ?? ''
  useEffect(() => {
    let active = true
    void getReviewedCoverageOverview(ownerId).then(value => { if (active) setResult({ ownerId, retry, overview: value, error: '' }) })
      .catch(() => { if (active) setResult({ ownerId, retry, overview: null, error: 'coverageFailed' }) })
    return () => { active = false }
  }, [ownerId, retry])
  return <section className="preset-coverage" aria-labelledby={id} aria-busy={loading}>
    <div className="preset-coverage-heading"><h3 id={id}>{s.coverageTitle}</h3>
      <button className="button-secondary preset-coverage-reload" type="button" aria-label={s.reloadCoverage} title={s.reloadCoverage} disabled={loading} onClick={() => {
        setRetry(value => value + 1)
      }}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M14.5 9a5.5 5.5 0 1 1-1.6-3.9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="M13.4 2.6v3h-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
    </div>
    {loading && <p role="status">{s.loadingCoverage}</p>}
    {error && <p role="alert">{s.coverageFailed}</p>}
    {overview && <><ReviewedSourceCoverage overview={overview}/><details className="preset-coverage-details">
      <summary>{s.builderAvailability}</summary><PresetCoverageTable report={overview.legacy}/></details></>}
  </section>
}
