import { assertDomainQuestion, type DomainQuestion } from '../domain/questionDomain'
import { canonicalQuestionCandidates } from './canonicalQuestionCandidates'

export type GradeSixExamPeriod = 'first-term-month-one' | 'first-term-month-two' | 'mid-year'
export type UnitRepresentation = 'random' | 'each-selected-unit'

export type GradeSixCoverageSettings = {
  period: GradeSixExamPeriod
  includeRevisionUnit?: boolean
  representation?: UnitRepresentation
}

export type GradeSixCoverage = {
  period: GradeSixExamPeriod
  units: readonly number[]
  representation: UnitRepresentation
  requiredUnits: readonly number[]
}

// Curriculum coverage is independent of marks, topology, attempt counts and pages.
export function resolveGradeSixCoverage(value: unknown): GradeSixCoverage {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Select a supported Grade 6 exam period.')
  }
  const input = value as Record<string, unknown>
  if (Object.keys(input).some(key => !['period', 'includeRevisionUnit', 'representation'].includes(key))) {
    throw new Error('Coverage settings contain an unsupported field. Paper structure is configured separately.')
  }
  if (typeof input.period !== 'string' || !['first-term-month-one', 'first-term-month-two', 'mid-year'].includes(input.period)) {
    throw new Error('Only first-term monthly and mid-year coverage is currently supported.')
  }
  if (input.includeRevisionUnit !== undefined && typeof input.includeRevisionUnit !== 'boolean') {
    throw new Error('Revision-unit selection must be boolean.')
  }
  if (input.includeRevisionUnit === true && input.period !== 'mid-year') {
    throw new Error('Optional Unit 4 revision is only available for mid-year.')
  }
  const representation = input.representation === undefined ? 'random' : input.representation
  if (representation !== 'random' && representation !== 'each-selected-unit') {
    throw new Error('Select random coverage or at least one question from each selected unit.')
  }
  const units = input.period === 'first-term-month-one' ? [1]
    : input.period === 'first-term-month-two' ? [2]
      : input.includeRevisionUnit === true ? [1, 2, 3, 4] : [1, 2, 3]
  return {
    period: input.period as GradeSixExamPeriod,
    units,
    representation,
    requiredUnits: representation === 'each-selected-unit' ? [...units] : [],
  }
}

/** Domain inventory only: callers must obtain authorized, governed candidates first.
 * Counts do not prove complete-group eligibility, compatibility or paper feasibility.
 */
export function gradeSixCoverageCandidates<Q extends DomainQuestion>(
  questions: readonly Q[], settings: GradeSixCoverageSettings,
): Q[] {
  const coverage = resolveGradeSixCoverage(settings)
  // Resolve withdrawal/latest revision before unit filtering; never revive an old row.
  return canonicalQuestionCandidates(questions).filter(question => coverage.units.includes(question.unit))
}

/** Validate selected examinable questions, including members of complete groups.
 * Group completeness, authority, scoring and layout retain their own validators.
 */
export function assertGradeSixPaperCoverage(
  questions: readonly DomainQuestion[], settings: GradeSixCoverageSettings,
): void {
  const coverage = resolveGradeSixCoverage(settings)
  if (questions.length === 0) throw new Error('The paper must contain at least one question.')
  const ids = new Set<string>()
  const units = new Set<number>()
  for (const question of questions) {
    assertDomainQuestion(question)
    if (!question.isActive) throw new Error('A selected question is inactive.')
    if (ids.has(question.id)) throw new Error('A canonical question cannot appear more than once in the paper.')
    if (!coverage.units.includes(question.unit)) throw new Error(`Unit ${question.unit} is outside the selected coverage.`)
    ids.add(question.id)
    units.add(question.unit)
  }
  const missing = coverage.requiredUnits.filter(unit => !units.has(unit))
  if (missing.length) throw new Error(`The paper needs at least one question from each selected unit. Missing: ${missing.join(', ')}.`)
}
