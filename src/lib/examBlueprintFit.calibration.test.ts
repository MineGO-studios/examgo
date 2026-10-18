import { existsSync } from 'node:fs'
import { expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { parseCompoundSnapshot } from '../domain/compoundStructure'
import { makeExam002Candidate } from './fixtures/phaseTenExam002Candidate'
import { assessSnapshotFit, VERIFIED_ONE_PAGE_LINES } from './examBlueprintFit'
import { inspectDocx } from './testSupport/docxPackage'

const verifiedDir = 'docs/fixtures/phase-10-candidate'
const load = async (path: string) => Uint8Array.from(await readFile(path))
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

it.skipIf(!existsSync(`${verifiedDir}/app-finalized-corrected/ExamGO-Phase10-App-Exam.docx`))('places the owner-verified one-page Phase 10 papers exactly at the calibrated one-page budget', async () => {
  // Both papers were opened by the owner in Word and LibreOffice and accepted as one page (Phase 10C/10D evidence).
  const corrected = await load(`${verifiedDir}/app-finalized-corrected/ExamGO-Phase10-App-Exam.docx`)
  const mixed = await load(`${verifiedDir}/phase10d-mixed-unit/ExamGO-Phase10D-Exam.docx`)
  expect(sha(corrected)).toBe('9b6a590befb528a24e4209656a48804f36bfe25c17ca0a3fd079c2c5a0b81aa1')
  expect(sha(mixed)).toBe('023f805437ad5e00215b6c435697337cbcff729c8a8e5db5c161f8c37d397b2b')

  const snapshot = parseCompoundSnapshot(makeExam002Candidate('tissue'))
  const settings = { schoolName: 'Anonymous', examTitle: 'Mid-Year (2025-2024)', teacherName: 'Anonymous', grade: 6, unit: 1,
    marksPerQuestion: 1, questionCount: 30, selectionSeed: snapshot.selectionSeed }
  const fit = assessSnapshotFit(snapshot, settings, 'Note: Answer all the questions.')
  expect(fit.status).toBe('NEEDS_REVIEW')
  expect(fit.estimatedLines).toBe(VERIFIED_ONE_PAGE_LINES)
  expect(fit.estimatedPages).toBe(1)
  expect(fit.sections.some(section => section.exceedsPageBudget)).toBe(false)

  // The fixture source matches the verified papers' structure and text volume, so its estimate represents them.
  const [a, b] = await Promise.all([inspectDocx(corrected.buffer), inspectDocx(mixed.buffer)])
  for (const verified of [a, b]) {
    expect(verified.tables.filter(table => /^Q\d/.test(table[0]?.[0]?.text ?? '')).length).toBe(snapshot.branches.length)
    expect(Math.abs(verified.text.length - a.text.length)).toBeLessThan(a.text.length * 0.02)
  }
})

it('flags content beyond the verified one-page volume without changing it', () => {
  const snapshot = parseCompoundSnapshot(makeExam002Candidate('tissue')), before = structuredClone(snapshot)
  const settings = { schoolName: 'Anonymous', examTitle: 'Mid-Year (2025-2024)', teacherName: 'Anonymous', grade: 6, unit: 1,
    marksPerQuestion: 1, questionCount: 30, selectionSeed: snapshot.selectionSeed }
  const base = assessSnapshotFit(snapshot, settings, 'Note: Answer all the questions.')
  const longer = structuredClone(snapshot)
  longer.branches[0].passageGroup!.passage += ' This extra unchanged sentence adds verified-volume pressure for review.'.repeat(6)
  const pressured = assessSnapshotFit(longer, settings, 'Note: Answer all the questions.')
  expect(pressured.estimatedLines).toBeGreaterThan(base.estimatedLines)
  expect(pressured.estimatedPages).toBe(2)
  expect(pressured.status).toBe('NEEDS_REVIEW')
  expect(pressured.reasons.join(' ')).toContain('larger than any paper verified to fit one page')
  expect(snapshot).toEqual(before)
})
