import { expect, it } from 'vitest'
import type { StagedInterchangeQuestion } from './questionInterchange'
import { describeImportedQuestion, readableImportIssue, readableImportSource } from './importReadable'

const staged = (patch: Partial<StagedInterchangeQuestion> = {}): StagedInterchangeQuestion => ({
  catalogueId: 'Q-1', type: 'multiple-choice', prompt: 'Raw prompt', unitTags: [1], displayUnit: 1, lesson: '1',
  difficulty: 'easy', difficultyProvisional: false, selectionMarks: null, content: null, answer: null,
  groupIds: [], groupCompleteness: null, sourceFields: {}, issues: [], ...patch,
})

it('shows printed context, options and the correct option as readable text', () => {
  const question = staged({ sourceFields: { group_context_json: JSON.stringify([{ main_question_label: 'Q1', branch_label: 'A',
    instructions: 'Read the passage.', passage_text: 'Sara lives in a village.' }]) } })
  const readable = describeImportedQuestion(question, { question: 'Where does Sara live?',
    content: { type: 'multiple-choice', options: [{ label: 'A', text: 'in a village' }, { label: 'B', text: 'in a city' }] },
    answer: { type: 'multiple-choice', correctOptionLabel: 'A' } })
  expect(readable).toEqual({ context: [{ label: 'Q1/A', instruction: 'Read the passage.', passage: 'Sara lives in a village.' }],
    prompt: 'Where does Sara live?', details: ['A. in a village', 'B. in a city'], answer: 'A. in a village' })
})

it('shows matching lists with lettered answers, binary, accepted answers and word boxes', () => {
  const matching = describeImportedQuestion(staged({ type: 'matching' }), { question: 'Match', content: { type: 'matching',
    left: [{ id: 'l1', text: 'father' }, { id: 'l2', text: 'aunt' }], right: [{ id: 'r1', text: 'uncle' }, { id: 'r2', text: 'mother' }] },
  answer: { type: 'matching', pairs: [{ leftId: 'l1', rightId: 'r2' }, { leftId: 'l2', rightId: 'r1' }] } })
  expect(matching.details).toEqual(['List A: 1. father  2. aunt', 'List B: a. uncle  b. mother'])
  expect(matching.answer).toBe('1 → b, 2 → a')
  expect(describeImportedQuestion(staged(), { question: 'Paper is from trees.', content: { type: 'binary', labelMode: 'yes-no' },
    answer: { type: 'binary', isTrue: false } })).toMatchObject({ details: ['Answer Yes or No'], answer: 'No' })
  expect(describeImportedQuestion(staged(), { question: 'Rewrite', content: { type: 'rewrite', instruction: 'Use capitals.' },
    answer: { type: 'rewrite', acceptedAnswers: ['What do Basim and Hiba do?', 'What do Basim and Hiba do on Monday?'] } }).answer)
    .toBe('What do Basim and Hiba do? or What do Basim and Hiba do on Monday?')
  expect(describeImportedQuestion(staged(), { question: 'Complete', content: { type: 'completion', text: 'I ___ tea.', wordBank: ['drink', 'eat'] },
    answer: { type: 'completion', answers: { b1: 'drink' } } })).toMatchObject({ details: ['I ___ tea.', 'Word box: drink, eat'], answer: 'drink' })
})

it('falls back to a review notice instead of raw JSON when an answer cannot be read', () => {
  expect(describeImportedQuestion(staged(), { question: 'Q', content: null, answer: { unexpected: { nested: true } } }).answer).toBeNull()
  expect(describeImportedQuestion(staged(), { question: 'Q', content: null, answer: { text: 'doctor', status: 'reviewer_checked' } }).answer).toBe('doctor')
  expect(describeImportedQuestion(staged({ sourceFields: { group_context_json: '{broken' } }), { question: 'Q', content: null, answer: null }).context).toEqual([])
})

it('names import sources without internal storage paths', () => {
  expect(readableImportSource('Papers/Ready_Question_Bank/master_export')).toBe('MineGO question catalogue')
  expect(readableImportSource('teacher-import')).toBe('teacher import')
  expect(readableImportSource('schools/unit_2-revision')).toBe('unit 2 revision')
})

it('explains adapter issue codes with a problem and a remedy', () => {
  expect(readableImportIssue('group-incomplete').problem).toContain('missing from the file')
  expect(readableImportIssue('lesson-unmapped').remedy).toContain('lesson')
  expect(readableImportIssue('new-code').problem).toBe('This row needs review (new code).')
})
