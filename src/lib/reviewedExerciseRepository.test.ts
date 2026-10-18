import { syntheticMatchingEntries, syntheticReviewedExercises } from './fixtures/syntheticPresetExercises'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('./supabase', () => ({ supabase: { rpc: vi.fn() } }))
import { supabase } from './supabase'
import { createReviewedExerciseDocumentBlobs, finalizeReviewedExercise, getReviewedExerciseExam,
  getReviewedPresetExercises, parseSavedReviewedExercise } from './reviewedExerciseRepository'
import { parsePresetExercise, presetExerciseRenderSnapshot } from './presetExerciseProjection'
import { projectCompoundPaper } from './compoundWorkflow'
import { inspectDocx } from './testSupport/docxPackage'

const id = (n: number) => `123e4567-e89b-42d3-a456-${String(n).padStart(12, '0')}`
const source = syntheticMatchingEntries[0]
const settings = { schemaVersion: 1 as const, grade: 6 as const, schoolName: 'Local fixture school', examTitle: 'Reviewed exercise',
  teacherName: 'Teacher', selectionSeed: 17, totalMarks: 10 }
function exercise() {
  return { schemaVersion: 1, id: source.sourceGroup.id, revision: 1, kind: 'matching', instruction: source.prompt,
    title: null, arabicInstruction: null, passage: null, displayedPointCount: 6, attemptCount: 5, members: [{
      revisionId: source.revisionId, curationId: id(10), revision: 1, reviewVersion: 3,
      reviewer: 'Local fixture reviewer', approvedAt: '2026-10-04T09:00:00Z', publisher: 'Local fixture publisher', publishedAt: '2026-10-04T09:01:00Z',
      provenance: { schemaVersion: 2, sourceReference: 'Source-shaped local fixture only', corpusScope: '', ministerialOccurrences: null, missingEvidence: [] },
      question: { id: source.questionId, schemaVersion: 1, type: 'matching', unit: 1, lesson: source.lesson,
        difficulty: 'medium', prompt: source.prompt, content: source.content, answer: source.answer },
      selectionKeys: [...source.pointMapping.points.flatMap((p: { ideaKeys: string[] }) => p.ideaKeys.map(key => `idea:${key}`)), 'wording:' + 'a'.repeat(32)],
      pointIdeas: source.pointMapping,
    }] }
}
function saved() { return { id: id(20), ownerId: id(1), sealed: true, savedAt: '2026-10-04T10:00:00Z', settings, exercise: exercise(), totalMarks: 10 } }
const rpc = vi.mocked(supabase.rpc)
beforeEach(() => rpc.mockReset())

describe('reviewed whole-exercise persisted contract', () => {
  it('checks the seal, complete source, date, total and renderer rules without mutating the source', () => {
    const value = saved(), parsed = parseSavedReviewedExercise(value)
    expect(parsePresetExercise(parsed.exercise, parsed.ownerId)).toMatchObject({ displayedPointCount: 6, attemptCount: 5 })
    for (const bad of [{ ...value, sealed: false }, { ...value, savedAt: 'not-a-date' }, { ...value, totalMarks: 12 },
      { ...value, settings: { ...settings, totalMarks: 11 }, totalMarks: 11 }, { ...value, privateNote: 'Not public' }]) {
      expect(() => parseSavedReviewedExercise(bad)).toThrow()
    }
    const old = JSON.stringify(value)
    ;(parsed.settings as { examTitle: string }).examTitle = 'Changed local copy'
    expect(JSON.stringify(value)).toBe(old)
  })
  it('verifies complete teacher intent and exact source readback independent of JSON object-key order', async () => {
    const value = saved(), reordered = { ...value, settings: Object.fromEntries(Object.entries(settings).reverse()) }
    rpc.mockResolvedValueOnce({ data: reordered, error: null } as never)
    await expect(finalizeReviewedExercise(id(30), id(1), settings, exercise())).resolves.toMatchObject({ id: value.id, totalMarks: 10 })
    expect(rpc).toHaveBeenCalledWith('finalize_reviewed_preset_exercise', expect.objectContaining({ p_request_id: id(30), p_settings: settings }))
    for (const mutation of [{ ...value, ownerId: id(2) }, { ...value, settings: { ...settings, examTitle: 'Other title' } },
      { ...value, exercise: { ...exercise(), instruction: 'Changed source instruction.' } },
      { ...value, exercise: { ...exercise(), revision: 2 } }]) {
      rpc.mockResolvedValueOnce({ data: mutation, error: null } as never)
      await expect(finalizeReviewedExercise(id(31), id(1), settings, exercise())).rejects.toThrow('differs')
    }
  })
  it('rejects invalid source before saving and keeps caller request identity across retry errors', async () => {
    await expect(finalizeReviewedExercise(id(30), id(1), settings, { ...exercise(), displayedPointCount: 5 })).rejects.toThrow()
    expect(rpc).not.toHaveBeenCalled()
    for (const code of ['40001', '23505', '40P01', '42501', 'NETWORK']) {
      rpc.mockResolvedValueOnce({ data: null, error: { code, message: 'SECRET DATABASE DETAIL' } } as never)
      await expect(finalizeReviewedExercise(id(30), id(1), settings, exercise())).rejects.not.toThrow('SECRET')
    }
    expect(rpc.mock.calls.every(call => call[1] && 'p_request_id' in call[1] && call[1].p_request_id === id(30))).toBe(true)
  })
  it('reads only the exact owned finalized paper and rejects foreign or altered identities', async () => {
    rpc.mockResolvedValueOnce({ data: saved(), error: null } as never)
    await expect(getReviewedExerciseExam(id(20), id(1))).resolves.toMatchObject({ sealed: true })
    for (const mutation of [{ ...saved(), ownerId: id(2) }, { ...saved(), id: id(21) }]) {
      rpc.mockResolvedValueOnce({ data: mutation, error: null } as never)
      await expect(getReviewedExerciseExam(id(20), id(1))).rejects.toThrow('different')
    }
  })
  it('enforces exact public page shape, source order and cursor progression', async () => {
    const first = { ...exercise(), id: id(40) }, second = { ...exercise(), id: id(41) }
    rpc.mockResolvedValueOnce({ data: { schemaVersion: 1, exercises: [first], nextCursor: first.id }, error: null } as never)
    rpc.mockResolvedValueOnce({ data: { schemaVersion: 1, exercises: [second], nextCursor: null }, error: null } as never)
    expect(await getReviewedPresetExercises(id(1))).toHaveLength(2)
    expect(rpc).toHaveBeenLastCalledWith('get_reviewed_preset_exercises', { p_after: first.id, p_limit: 100 })
    for (const page of [{ schemaVersion: 1, exercises: [], nextCursor: id(40) },
      { schemaVersion: 1, exercises: [first], nextCursor: id(41) },
      { schemaVersion: 1, exercises: [second, first], nextCursor: null },
      { schemaVersion: 1, exercises: [first], nextCursor: null, privateNote: 'Hidden' }]) {
      rpc.mockResolvedValueOnce({ data: page, error: null } as never)
      await expect(getReviewedPresetExercises(id(1))).rejects.toThrow()
    }
  })
  it('produces a synchronized source-shaped student/key package only from a valid saved readback', async () => {
    vi.stubGlobal('DOMParser', DOMParser); vi.stubGlobal('XMLSerializer', XMLSerializer)
    try {
      const pair = await createReviewedExerciseDocumentBlobs(parseSavedReviewedExercise(saved()),
        Uint8Array.from(readFileSync('public/templates/iraqi-mainstream-phase-nine-exam-v1.docx')).buffer,
        Uint8Array.from(readFileSync('public/templates/iraqi-mainstream-phase-nine-answer-key-v1.docx')).buffer)
      const student = await inspectDocx(pair.exam), key = await inspectDocx(pair.answerKey)
      for (const item of source.content.left) expect(student.text).toContain(item.text)
      expect(key.text).toContain('Answer 5 of 6')
      for (const document of [student, key]) {
        expect(document.text).not.toContain('Local fixture reviewer')
        expect(document.text).not.toContain('{#')
      }
    } finally { vi.unstubAllGlobals() }
  })
  it('uses the domain-defined normalized MCQ label when producing the answer key', () => {
    const raw = structuredClone(syntheticReviewedExercises[0])
    raw.members[0].question.content.options[0].label = ' a '
    raw.members[0].question.answer.correctOptionLabel = 'A'
    const snapshot = presetExerciseRenderSnapshot(raw, id(1), 17, raw.attemptCount * 2)
    const paper = projectCompoundPaper(snapshot, { schoolName: 'Fixture', examTitle: 'Fixture', grade: 6, unit: 1,
      marksPerQuestion: 1, questionCount: raw.members.length, selectionSeed: 17 }, 'Answer as instructed.')
    expect(paper.answerKey.Answers[0].Answer).toContain(raw.members[0].question.content.options[0].text)
  })
  it('accepts explicit Units 1-4 renderer coverage without changing the legacy Unit 1 prototype', () => {
    for (const unit of [1, 2, 3, 4]) {
      const raw = exercise()
      raw.members[0].question.unit = unit
      expect(parseSavedReviewedExercise({ ...saved(), exercise: raw }).exercise).toEqual(raw)
      const snapshot = presetExerciseRenderSnapshot(raw, id(1), 17, 10)
      const legacy = { schoolName: 'Fixture', examTitle: 'Fixture', grade: 6, unit,
        marksPerQuestion: 1, questionCount: 1, selectionSeed: 17 }
      if (unit !== 1) expect(() => projectCompoundPaper(snapshot, legacy, 'Answer as instructed.')).toThrow('Unit 1 only')
      expect(() => projectCompoundPaper(snapshot, legacy, 'Answer as instructed.', [unit])).not.toThrow()
      for (const coverage of [[], [unit, unit], [unit, 5], [5]]) {
        expect(() => projectCompoundPaper(snapshot, legacy, 'Answer as instructed.', coverage)).toThrow('Explicit compound coverage')
      }
    }
  })
})
import { readFileSync } from 'node:fs'
