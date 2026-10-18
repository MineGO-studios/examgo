import { syntheticMatchingEntries } from './fixtures/syntheticPresetExercises'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import { describe, expect, it, vi } from 'vitest'
import { parsePresetExercise, presetExerciseRenderSnapshot } from './presetExerciseProjection'
import { createCompoundDocumentBlobs, projectCompoundPaper } from './compoundWorkflow'
import { projectMatching } from './matchingProjection'
import { inspectDocx } from './testSupport/docxPackage'

const id = (n: number) => `123e4567-e89b-42d3-a456-${String(n).padStart(12, '0')}`
const source = syntheticMatchingEntries
const context = ['wording:' + 'a'.repeat(32), 'family:' + 'b'.repeat(32)]
function exercise(index = 0) {
  const entry = source[index]
  return { schemaVersion: 1, id: entry.sourceGroup.id, revision: 1, kind: 'matching', instruction: entry.prompt,
    title: null, arabicInstruction: null, passage: null, displayedPointCount: 6, attemptCount: 5, members: [{
      revisionId: entry.revisionId, curationId: id(10), revision: entry.revision, reviewVersion: 3,
      reviewer: 'Fixture reviewer', approvedAt: '2026-10-04T09:00:00Z', publisher: 'Fixture publisher', publishedAt: '2026-10-04T09:01:00Z',
      provenance: { schemaVersion: 2, sourceReference: 'Source-shaped local fixture only', corpusScope: '', ministerialOccurrences: null, missingEvidence: [] },
      question: { id: entry.questionId, schemaVersion: 1, type: 'matching', unit: entry.unit, lesson: entry.lesson,
        difficulty: 'medium', prompt: entry.prompt, content: entry.content, answer: entry.answer },
      selectionKeys: [...entry.pointMapping.points.flatMap((p: { ideaKeys: string[] }) => p.ideaKeys.map(key => `idea:${key}`)), ...context],
      pointIdeas: entry.pointMapping,
    }] }
}

describe('whole-source preset exercise projection contract', () => {
  it('counts six answerable pairs, not one canonical member, and preserves five attempts', () => {
    for (let index = 0; index < 2; index++) {
      const parsed = parsePresetExercise(exercise(index), id(1))
      expect(parsed.displayedPointCount).toBe(6)
      expect(parsed.attemptCount).toBe(5)
      expect(parsed.members).toHaveLength(1)
      expect(parsed.members[0].question.content).toEqual(source[index].content)
      expect(parsed.members[0].question.answer).toEqual(source[index].answer)
      expect(parsed.members[0].question.ownerId).toBe(id(1))
      expect(parsed.members[0].question.marks).toBeNull()
    }
  })
  it('rejects incomplete point meanings, wrong selection identities and count-based trimming', () => {
    const value = exercise()
    for (const mutation of [
      { ...value, displayedPointCount: 1 }, { ...value, attemptCount: 7 }, { ...value, members: [] },
      { ...value, members: [{ ...value.members[0], pointIdeas: null }] },
      { ...value, members: [{ ...value.members[0], selectionKeys: context }] },
      { ...value, members: [{ ...value.members[0], selectionKeys: [...value.members[0].selectionKeys, 'answer:hospital'] }] },
    ]) expect(() => parsePresetExercise(mutation, id(1))).toThrow()
    const trimmed = structuredClone(value)
    trimmed.members[0].pointIdeas.points.pop()
    expect(() => parsePresetExercise(trimmed, id(1))).toThrow('every source point')
  })
  it('rejects private source, publisher identity and unknown nested content fields', () => {
    const value = exercise(), member = value.members[0]
    for (const mutation of [
      { ...value, privateNotes: 'Hidden' },
      { ...value, members: [{ ...member, authorEmail: 'private@example.invalid' }] },
      { ...value, members: [{ ...member, question: { ...member.question, ownerId: id(4) } }] },
      { ...value, members: [{ ...member, question: { ...member.question, content: { ...member.question.content, source: { raw: 'Hidden' } } } }] },
    ]) expect(() => parsePresetExercise(mutation, id(1))).toThrow('public preset')
    const nested = structuredClone(value)
    nested.members[0].question.content.left[0].privateNotes = 'Hidden'
    expect(() => parsePresetExercise(nested, id(1))).toThrow('public preset')
  })
  it('requires dated named approval and public source evidence without claiming live eligibility', () => {
    const value = exercise(), member = value.members[0]
    for (const mutation of [
      { ...value, members: [{ ...member, reviewer: '' }] },
      { ...value, members: [{ ...member, approvedAt: 'not-a-date' }] },
      { ...value, members: [{ ...member, provenance: { ...member.provenance, missingEvidence: ['Unresolved answer'] } }] },
      { ...value, members: [{ ...member, question: { ...member.question, unit: 5 } }] },
      { ...value, kind: 'questions' }, { ...value, passage: 'Not a passage exercise' },
    ]) expect(() => parsePresetExercise(mutation, id(1))).toThrow()
  })
  it('clones all source and review data and preserves source branch instruction', () => {
    const value = exercise(), parsed = parsePresetExercise(value, id(1))
    parsed.members[0].selectionKeys.push('idea:changed')
    if (parsed.members[0].question.type === 'matching') parsed.members[0].question.content.left[0].text = 'Changed'
    expect(value.members[0].question.content.left[0].text).toBe('Synthetic left 0-0')
    expect(value.members[0].selectionKeys).not.toContain('idea:changed')
    expect(parsed.instruction).toBe(source[0].prompt)
  })
  it('projects the complete six-pair/five-attempt source through the actual paired-paper path', () => {
    for (const seed of [1, 2, 8162026]) {
      const value = exercise(), snapshot = presetExerciseRenderSnapshot(value, id(1), seed, 10)
      const paper = projectCompoundPaper(snapshot, { schoolName: 'Fixture', examTitle: 'Monthly fixture',
        teacherName: '', grade: 6, unit: 1, marksPerQuestion: 1, questionCount: 1, selectionSeed: seed }, 'Answer as instructed.')
      expect(paper.answerKey.Answers).toHaveLength(6)
      expect(paper.answerKey.Answers.every(row => row.Rule === 'Answer 5 of 6' && row.Mark === 2 && row.Total === 10)).toBe(true)
      expect(Object.values(snapshot.branches[0].pointMarks!)).toEqual([2, 2, 2, 2, 2, 2])
      const question = snapshot.branches[0].items[0].question
      if (question.type !== 'matching') throw new Error('Matching source was converted.')
      const matching = projectMatching(question, seed)
      expect(paper.answerKey.Answers.map(row => row.Answer)).toEqual(matching.answerKey.map(pair => pair.displayLetter))
      matching.left.forEach(item => expect(paper.exam.Branches[0].Body).toContain(item.text))
      expect(question.answer).toEqual(source[0].answer)
      expect(() => presetExerciseRenderSnapshot(value, id(1), seed, 7)).toThrow('Equal marks')
    }
  })
  it('retains all seven single-point question types and initial Units 2-4 without imposing 60 marks', () => {
    const types = [
      { type: 'multiple-choice', content: { options: [{ label: 'a', text: 'One' }, { label: 'b', text: 'Two' }] }, answer: { correctOptionLabel: 'a' } },
      { type: 'binary', content: { labelMode: 'true-false' }, answer: { isTrue: true } },
      { type: 'short-answer', content: { answerLines: 1 }, answer: { canonicalAnswer: 'One', approvedVariants: [], caseSensitive: false } },
      { type: 'odd-word', content: { words: ['One', 'Two', 'Three'] }, answer: { oddWord: 'Three' } },
      { type: 'word-relationship', content: { words: ['One', 'First'] }, answer: { acceptedAnswers: ['Two'] } },
      { type: 'rewrite', content: { instruction: 'Rewrite as instructed.' }, answer: { acceptedAnswers: ['Rewritten.'] } },
      { type: 'extended-writing', content: { minimumWords: 10 }, answer: { modelAnswer: 'Local model answer.', rubricCriteria: ['Clarity'] } },
    ]
    for (const unit of [2, 3, 4]) for (const type of types) {
      const value = exercise(), first = value.members[0]
      const candidate = { ...value, kind: 'questions', displayedPointCount: 1, attemptCount: 1,
        members: [{ ...first, pointIdeas: null, selectionKeys: ['idea:single-fact', ...context],
          question: { ...first.question, unit, type: type.type, content: { schemaVersion: 1, type: type.type, ...type.content },
            answer: { schemaVersion: 1, type: type.type, ...type.answer } } }] }
      const snapshot = presetExerciseRenderSnapshot(candidate, id(1), 1, 3)
      expect(snapshot.totalMarks).toBe(3)
      expect(snapshot.branches[0].items[0].question.type).toBe(type.type)
      expect(snapshot.branches[0].items[0].question.unit).toBe(unit)
    }
  })
  it('keeps every multi-blank point and rejects inconsistent shared completion banks', () => {
    const value = exercise(), first = value.members[0]
    const content = { type: 'completion', schemaVersion: 1, text: 'Works at a ___.\nWorks in a ___.',
      blankIds: ['farm', 'hospital'], wordBank: ['farm', 'hospital'], wordBankOrder: 'ordered',
      allowWordReuse: false, requireAllWordsUsed: true }
    const candidate = { ...value, kind: 'completion', displayedPointCount: 2, attemptCount: 1,
      members: [{ ...first, question: { ...first.question, type: 'completion', content,
        answer: { type: 'completion', schemaVersion: 1, answers: { farm: 'farm', hospital: 'hospital' } } },
      pointIdeas: { schemaVersion: 1, revisionId: first.revisionId, points: content.blankIds.map((blank, index) => ({
        pointId: `${first.question.id}:blank:${blank}`, ideaKeys: [['farmer-workplace', 'nurse-workplace'][index]],
      })) }, selectionKeys: ['idea:farmer-workplace', 'idea:nurse-workplace', ...context] }] }
    const snapshot = presetExerciseRenderSnapshot(candidate, id(1), 2, 4)
    expect(snapshot.branches[0].attemptCount).toBe(1)
    expect(Object.values(snapshot.branches[0].pointMarks!)).toEqual([4, 4])
    expect(snapshot.branches[0].items[0].question.content).toEqual(content)
    const single = (n: number) => ({ ...first, revisionId: id(n + 30), curationId: id(n + 40), pointIdeas: null,
      selectionKeys: [`idea:fact-${n}`, `wording:${String(n).repeat(32)}`],
      question: { ...first.question, id: id(n + 50), type: 'completion',
        content: { ...content, text: 'Works at a ___.', blankIds: ['farm'], requireAllWordsUsed: false },
        answer: { type: 'completion', schemaVersion: 1, answers: { farm: 'farm' } } } })
    const grouped = { ...value, kind: 'completion', title: 'Exact source title', displayedPointCount: 2,
      attemptCount: 1, members: [single(1), single(2)] }
    const groupedSnapshot = presetExerciseRenderSnapshot(grouped, id(1), 2, 4)
    expect(groupedSnapshot.branches[0].completionGroup?.childIds).toEqual(grouped.members.map(m => m.question.id))
    expect(groupedSnapshot.branches[0].completionGroup?.title).toBe('Exact source title')
    grouped.members[1].question.content.wordBank = ['farm', 'restaurant']
    expect(() => presetExerciseRenderSnapshot(grouped, id(1), 2, 4)).toThrow('shared word bank')
  })
  it('preserves a complete passage and alternatives, rejecting repeated facts within a source group', () => {
    const value = exercise(), first = value.members[0]
    const member = (n: number) => ({ ...first, revisionId: id(n + 30), curationId: id(n + 40), pointIdeas: null,
      selectionKeys: [`idea:fact-${n}`, `wording:${String(n).repeat(32)}`], question: { ...first.question,
        id: id(n + 50), type: 'short-answer', unit: 3, prompt: `Source question ${n}?`,
        content: { schemaVersion: 1, type: 'short-answer', answerLines: 1 },
        answer: { schemaVersion: 1, type: 'short-answer', canonicalAnswer: `Source answer ${n}` } } })
    const passage = { ...value, kind: 'passage', title: 'Source title', passage: 'Exact source passage.',
      displayedPointCount: 2, attemptCount: 1, members: [member(1), member(2)] }
    const snapshot = presetExerciseRenderSnapshot(passage, id(1), 1, 7)
    expect(snapshot.branches[0].passageGroup).toMatchObject({ passage: passage.passage, title: passage.title, attemptCount: 1 })
    expect(snapshot.branches[0].passageGroup?.children.map(c => c.question.id)).toEqual(passage.members.map(m => m.question.id))
    const alternative = { ...passage, passage: null, kind: 'alternatives' }
    expect(presetExerciseRenderSnapshot(alternative, id(1), 1, 7).branches[0].items.map(item => item.label)).toEqual(['A', 'B'])
    passage.members[1].selectionKeys[0] = passage.members[0].selectionKeys[0]
    expect(() => presetExerciseRenderSnapshot(passage, id(1), 1, 7)).toThrow('repeated canonical or reviewed')
    expect(() => parsePresetExercise({ ...value, members: [first, first] }, id(1))).toThrow('repeated canonical')
  })
  it('keeps both source-shaped DOCX pairs complete through production validation without rendering them', async () => {
    vi.stubGlobal('DOMParser', DOMParser); vi.stubGlobal('XMLSerializer', XMLSerializer)
    try {
      const templates = ['exam', 'answer-key'].map(kind =>
        Uint8Array.from(readFileSync(`public/templates/iraqi-mainstream-phase-nine-${kind}-v1.docx`)).buffer)
      for (const index of [0, 1]) {
        const snapshot = presetExerciseRenderSnapshot(exercise(index), id(1), 8162026, 10)
        const settings = { schoolName: 'Fixture', examTitle: 'Monthly fixture', teacherName: '', grade: 6,
          unit: 1, marksPerQuestion: 1, questionCount: 1, selectionSeed: 8162026 }
        const pair = await createCompoundDocumentBlobs(snapshot, settings, 'Answer as instructed.', templates[0], templates[1])
        const student = await inspectDocx(pair.exam), key = await inspectDocx(pair.answerKey)
        const matching = student.tables.filter(rows => rows[0].map(cell => cell.text).join('|') === 'List (A)|List (B)')
        expect(matching).toHaveLength(1)
        expect(matching[0]).toHaveLength(7)
        source[index].content.left.forEach((item: { text: string }) => expect(student.text).toContain(item.text))
        const projected = projectCompoundPaper(snapshot, settings, 'Answer as instructed.')
        expect(projected.answerKey.Answers).toHaveLength(6)
        expect(key.text).toContain('Answer 5 of 6')
        for (const document of [student, key]) {
          expect(document.text).not.toContain('Fixture publisher')
          expect(document.text).not.toContain(source[index].revisionId)
          expect(document.text).not.toContain('idea:')
          expect(document.text).not.toContain('{#')
        }
      }
    } finally { vi.unstubAllGlobals() }
  })
})
import { readFileSync } from 'node:fs'
