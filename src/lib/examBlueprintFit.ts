import { compoundBranchPointIds, type CompoundSnapshot } from '../domain/compoundStructure'
import type { ExamSettings } from '../types/exam'
import { projectCompoundPaper } from './compoundWorkflow'
import { blueprintPaperSettings, parseBlueprintPaperIntent, type BlueprintPaperIntent } from './examBlueprintPaper'
import { projectMatching } from './matchingProjection'

// Section-aware content budget v2 for the Phase 9 A4 template and the compact production student renderer.
// Geometry comes from the template and renderer: A4 16834-twip page with 288-twip margins, a 11276-twip
// section table split into 7085 (heading) / 3197 (Arabic) / 994 (marks) columns, 10-point single-spaced body,
// half-line gaps between question headings, and 2700- or 5400-twip matching columns.
// Character width is a font assumption, not measured layout. A pure geometric page (16258 / ~244 twips per
// 10-point line = 66 lines) wrongly flags the owner-verified one-page papers, so the one-page budget is
// calibrated to the largest content volume the owner has verified as one page in Word and LibreOffice:
// the 60-mark, nine-section Phase 10 paper (docs/fixtures/phase-10-candidate/app-finalized-corrected; the
// phase10d-mixed-unit pair has the same structure and text volume). examBlueprintFit.calibration.test.ts pins it.
// No verified multi-page paper exists for this renderer, so exceeding the budget means "beyond verified
// one-page volume", a review signal rather than a page count. Every result stays NEEDS_REVIEW.
const TWIPS_PER_CHARACTER = 100
const CELL_PADDING_TWIPS = 110
export const VERIFIED_ONE_PAGE_LINES = 85
const PAGE_LINE_BUDGET = VERIFIED_ONE_PAGE_LINES
const HEADER_LINES = 8
const SECTION_GAP_LINES = 0.5
const HEADING_ROW_PADDING_LINES = 0.5
const columns = (twips: number) => Math.floor((twips - CELL_PADDING_TWIPS) / TWIPS_PER_CHARACTER)
const BODY_CHARACTERS = columns(11276), HEADING_CHARACTERS = columns(7085), ARABIC_CHARACTERS = columns(3197)

const wrappedLines = (text: string, width: number) =>
  text ? text.split(/\r?\n/).reduce((sum, line) => sum + Math.max(1, Math.ceil([...line].length / width)), 0) : 0

export function assessBlueprintFit(value: BlueprintPaperIntent) {
  const paper = parseBlueprintPaperIntent(value)
  return assessSnapshotFit(paper.snapshot, blueprintPaperSettings(paper), paper.intent.generalInstruction)
}

/** Same estimate for any compound snapshot rendered through the shared Phase 9 template family. */
export function assessSnapshotFit(snapshot: CompoundSnapshot, settings: ExamSettings, generalInstruction: string) {
  const units = [...new Set(snapshot.branches.flatMap(b => b.items.map(i => i.question.unit)))].sort((a, b) => a - b)
  const projection = projectCompoundPaper(snapshot, settings, generalInstruction, units)
  const sections = snapshot.branches.map((branch, index) => {
    const printed = projection.exam.Branches[index]
    let bodyLines = wrappedLines(printed.Body, BODY_CHARACTERS)
    const question = branch.items[0].question
    if (branch.kind === 'matching' && question.type === 'matching') {
      const matching = projectMatching(question, snapshot.selectionSeed)
      const width = columns(branch.mainQuestionNumber === 3 && branch.branchLabel === 'A' ? 2700 : 5400)
      bodyLines = 1 + matching.left.reduce((sum, left, row) =>
        sum + Math.max(wrappedLines(`${row + 1}. ${left.text}`, width), wrappedLines(`a. ${matching.right[row].text}`, width)), 0)
    }
    const headingRow = Math.max(wrappedLines(printed.Heading, HEADING_CHARACTERS), wrappedLines(printed.ArabicInstruction, ARABIC_CHARACTERS), 1)
    const estimatedLines = (index ? SECTION_GAP_LINES : 0) + headingRow + HEADING_ROW_PADDING_LINES +
      wrappedLines(printed.WordBank, BODY_CHARACTERS) + bodyLines + wrappedLines(printed.AlternativeA, BODY_CHARACTERS) +
      wrappedLines(printed.AlternativeB, BODY_CHARACTERS) + wrappedLines(printed.AnswerSpace, BODY_CHARACTERS)
    return { branchId: branch.id, slot: `Q${branch.mainQuestionNumber}${branch.branchLabel ? '/' + branch.branchLabel : ''}`,
      kind: branch.kind, displayedPoints: compoundBranchPointIds(branch).length, pointsToAnswer: branch.attemptCount,
      marks: branch.marks, estimatedLines: Math.ceil(estimatedLines), exceedsPageBudget: estimatedLines > PAGE_LINE_BUDGET - HEADER_LINES }
  })
  const estimatedLines = HEADER_LINES + wrappedLines(projection.exam.GeneralInstruction, BODY_CHARACTERS) +
    sections.reduce((sum, section) => sum + section.estimatedLines, 0)
  const estimatedPages = Math.max(1, Math.ceil(estimatedLines / PAGE_LINE_BUDGET))
  return { schemaVersion: 1 as const, status: 'NEEDS_REVIEW' as const, method: 'section-content-budget-v2' as const, targetPages: 1 as const,
    pageLineBudget: PAGE_LINE_BUDGET, estimatedLines, estimatedPages, sections, reasons: [
      'This content estimate does not measure Word or LibreOffice page breaks. Inspect both generated documents before printing.',
      ...(estimatedPages > 1 ? [`The current section content is larger than any paper verified to fit one page (about ${estimatedPages} pages by this estimate). Edit explicitly or retain unchanged content with a recorded two-page decision.`] : []),
      ...sections.filter(section => section.exceedsPageBudget).map(section => `${section.slot}: this complete section exceeds one page of the content budget. Its questions and source text have not been shortened.`),
      ...(estimatedPages > 2 ? ['A two-page decision cannot establish that this larger paper fits two pages. Edit the paper and inspect the generated layout.'] : []),
    ] }
}
