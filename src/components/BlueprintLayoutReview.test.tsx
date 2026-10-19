import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { makeBlueprintPaperFixture } from '../lib/fixtures/blueprintPaper'
import { selectBlueprintPaper } from '../lib/examBlueprint'
import { recordBlueprintSourceReview } from '../lib/examBlueprintRecovery'
import BlueprintLayoutReview from './BlueprintLayoutReview'

const render = (intent: Parameters<typeof BlueprintLayoutReview>[0]['intent'], snapshot: Parameters<typeof BlueprintLayoutReview>[0]['snapshot']) =>
  renderToStaticMarkup(<BlueprintLayoutReview intent={intent} snapshot={snapshot} approved={false} disabled={false} onDecision={() => {}} onEdit={() => {}} />)

it('offers explicit edit or unchanged two-page choices only beyond the verified one-page volume', () => {
  const full = makeBlueprintPaperFixture()
  const larger = render(full.intent, full.review)
  expect(larger).toContain('NEEDS_REVIEW')
  expect(larger).toContain('Edit paper before generating')
  expect(larger).toContain('record my two-page exception')
  expect(larger).toContain('larger than any paper verified to fit one page')

  const plan = structuredClone(full.intent.blueprint); plan.branches = plan.branches.slice(0, 4)
  plan.totalMarks = plan.branches.reduce((sum, branch) => sum + branch.marks, 0)
  const review = selectBlueprintPaper(plan, full.pool)
  const within = render({ ...full.intent, blueprint: recordBlueprintSourceReview(plan, review, full.pool) }, review)
  expect(within).toContain('NEEDS_REVIEW')
  expect(within).toContain('No two-page exception is needed')
  expect(within).not.toContain('record my two-page exception')
  expect(within).toContain('Inspect both DOCX files before printing')
})
