import { expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
vi.mock('../lib/supabase', () => ({ supabase: { rpc: vi.fn() } }))
import { syntheticReviewedExercises } from '../lib/fixtures/syntheticPresetExercises'
import PresetCoverageSummary, { PresetCoverageTable, ReviewedSourceCoverage } from './PresetCoverageSummary'
import type { PresetCoverageReport } from '../lib/presetCoverageRepository'
import { summarizeReviewedCoverage } from '../lib/reviewedCoverage'

const report: PresetCoverageReport = { schemaVersion: 1, captureScope: 'unit-one-simple', difficultyCalibrated: false,
  units: [1, 2, 3, 4].map(unit => ({ unit, publishedQuestionCount: 100, knownIdeaQuestionCount: unit === 1 ? 63 : 10,
    capturableGroupCount: unit === 1 ? 6 : 0, capturableGroupPointCount: unit === 1 ? 35 : 0,
    capturableStandaloneCount: 0, breakdown: [{ lesson: '1', type: 'short-answer', difficulty: 'medium',
      publishedCount: 100, knownIdeaCount: unit === 1 ? 63 : 10 }] })) }

it('renders reviewed inventory separately from actual available exercises without internal review metadata', () => {
  const html = renderToStaticMarkup(<PresetCoverageTable report={report}/>)
  expect(html).toContain('<caption>Current Unit 1 builder formats</caption>')
  expect(html).toContain('Published questions')
  expect(html).toContain('Builder exercises')
  expect(html).toContain('Limited format')
  expect(html.match(/Not available in this format/g)).toHaveLength(3)
  expect(html).toContain('scope="row"')
  expect(html).toContain('tabindex="0"')
  for (const internal of ['knownIdea', 'revisionId', 'curation', 'captureScope', 'schemaVersion']) expect(html).not.toContain(internal)
})

it('does not show fabricated zero supply while the report is still loading', () => {
  const html = renderToStaticMarkup(<PresetCoverageSummary ownerId="123e4567-e89b-42d3-a456-426614174000"/>)
  expect(html).toContain('role="status"')
  expect(html).toContain('Loading preset coverage')
  expect(html).not.toContain('<table')
  expect(html).toContain('disabled=""')
  expect(html).toContain('aria-label="Reload coverage"')
})

it('presents actual whole-source profiles and explicit gaps without leaking source questions or review identities', () => {
  const exercise = structuredClone(syntheticReviewedExercises[0])
  const aggregate = { ...report, units: report.units.map(u => ({ ...u, publishedQuestionCount: 6,
    knownIdeaQuestionCount: u.unit === 1 ? 6 : 0, capturableGroupCount: 0, capturableGroupPointCount: 0,
    breakdown: [{ lesson: '1', type: 'multiple-choice' as const, difficulty: 'medium' as const, publishedCount: 6, knownIdeaCount: u.unit === 1 ? 6 : 0 }] })) }
  exercise.members.forEach((m: { question: { lesson: string } }) => { m.question.lesson = '1' })
  const overview = summarizeReviewedCoverage(aggregate, [exercise], '123e4567-e89b-42d3-a456-426614174000')
  const html = renderToStaticMarkup(<ReviewedSourceCoverage overview={overview}/>)
  expect(html).toContain('Complete reviewed source inventory')
  expect(html).toContain('Mid-year with Unit 4 revision')
  expect(html).toContain('Formats without distinct alternatives')
  expect(html).toContain('Question type inventory')
  expect(html).toContain('Difficulty: not calibrated')
  expect(html).toContain('Edition: unconfirmed')
  for (const hidden of ['idea:', 'revisionId', exercise.id, exercise.members[0].question.prompt, 'attemptCount']) expect(html).not.toContain(hidden)
  expect(html).not.toContain('<input')
  expect(html).not.toContain('Final exam')
})
