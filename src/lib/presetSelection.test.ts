import { describe, expect, it } from 'vitest'
import { selectMixedQuestions, selectQuestions } from './selectQuestions'
import { createQuestionReview, replaceQuestionInReview } from './reviewQuestions'
import { DEFAULT_EXAM_QUESTION_FILTERS, DEFAULT_EXAM_SETTINGS } from '../types/exam'
import type { ExamQuestion } from '../types/question'

const question = (id: string, prompt: string, idea: string, unit = 1): ExamQuestion => ({
  id, prompt, unit, selectionKeys: [`idea:${idea}`], type: 'short-answer', lesson: '1', difficulty: 'medium',
  marks: 2, answerLines: 1, canonicalAnswer: '10', approvedVariants: [], caseSensitive: false,
})
const brother = question('brother', 'How old is your brother?', 'age')
const father = question('father', 'How old is your father?', 'age')
const jobs = question('jobs', 'How many jobs has she got?', 'job-count')
const request = { unit: 1, type: 'short-answer', count: 2, seed: 1 }

describe('preset variety', () => {
  it('allows the owner-confirmed doctor duty and workplace facts with the same answer', () => {
    const duty: ExamQuestion = { id: 'Q-1454', unit: 1, lesson: '3', difficulty: 'medium', marks: 2,
      type: 'multiple-choice', prompt: 'I look after patients and make them well again ______ (builder, doctor)',
      selectionKeys: ['idea:doctor-patient-treatment'], options: [{ label: 'A', text: 'builder' }, { label: 'B', text: 'doctor' }],
      correctAnswer: { label: 'B', text: 'doctor' } }
    const workplace: ExamQuestion = { ...duty, id: 'Q-1908',
      prompt: '______ This person works in a hospital. A doctor/ engineer)',
      selectionKeys: ['idea:doctor-workplace'], options: [{ label: 'A', text: 'A doctor' }, { label: 'B', text: 'engineer' }],
      correctAnswer: { label: 'A', text: 'A doctor' } }
    expect(selectQuestions([duty, workplace], { ...request, type: 'multiple-choice' })).toHaveLength(2)
  })
  it('selects at most one owner-confirmed wool variant across paper sections without merging unrelated answers', () => {
    const sweater = question('Q-0680', 'Sweater is made of ______ (wool / cotton)', 'clothing-material-wool', 2)
    const gloves = question('Q-0682', 'gloves are made of ______ (wood / wool)', 'clothing-material-wool', 2)
    const unrelated = { ...question('unrelated', 'Write the missing word in a different fact.', 'different-fact', 2), canonicalAnswer: 'wool' }
    const binary: ExamQuestion = { ...gloves, type: 'binary', labelMode: 'true-false', isTrue: true }
    expect(() => selectMixedQuestions([sweater, binary], [
      { ...request, unit: 2, count: 1 }, { ...request, unit: 2, type: 'binary', count: 1 },
    ])).toThrow('Only 0')
    for (let seed = 0; seed < 20; seed++) {
      const selected = selectQuestions([sweater, gloves, unrelated], { ...request, unit: 2, seed })
      expect(selected).toContainEqual(unrelated)
      expect(selected.filter(item => ['Q-0680', 'Q-0682'].includes(item.id))).toHaveLength(1)
    }
  })
  it('keeps variants stored but selects one per idea and unit', () => {
    for (let seed = 0; seed < 20; seed++) {
      const selected = selectQuestions([brother, father, jobs], { ...request, seed })
      expect(selected).toContainEqual(jobs)
      expect(selected.filter(q => q.selectionKeys?.includes('idea:age'))).toHaveLength(1)
    }
    expect(() => selectQuestions([brother, father], request)).toThrow('different question ideas')
  })
  it('requires replacement to differ from the removed idea as well as remaining questions', () => {
    const replaced = replaceQuestionInReview(createQuestionReview([brother]), brother.id, [brother, father, jobs],
      { ...DEFAULT_EXAM_SETTINGS, questionCount: 1 }, DEFAULT_EXAM_QUESTION_FILTERS)
    expect(replaced[0].question.id).toBe('jobs')
    expect(replaced[0].question.marks).toBe(2)
    expect(() => replaceQuestionInReview(createQuestionReview([brother]), brother.id, [brother, father],
      DEFAULT_EXAM_SETTINGS, DEFAULT_EXAM_QUESTION_FILTERS)).toThrow('Only 0')
  })
  it('allows common answers and distinct ideas, even across question types', () => {
    expect(selectQuestions([brother, jobs], request)).toHaveLength(2)
    const binary: ExamQuestion = { ...father, type: 'binary', labelMode: 'true-false', isTrue: true }
    expect(() => selectMixedQuestions([brother, binary], [ { ...request, count: 1 },
      { ...request, type: 'binary', count: 1 } ])).toThrow('Only 0')
  })
  it('scopes ideas by unit and rejects malformed identity keys', () => {
    expect(selectMixedQuestions([brother, { ...father, unit: 2 }], [ { ...request, count: 1 },
      { ...request, unit: 2, count: 1 } ])).toHaveLength(2)
    expect(() => selectQuestions([{ ...brother, selectionKeys: [''] }], { ...request, count: 1 })).toThrow('identity')
  })
  it('keeps wording conflicts within each unit under the approved policy', () => {
    const original = { ...brother, selectionKeys: ['idea:age', 'wording:same-question'] }
    const repeated = { ...jobs, unit: 2, selectionKeys: ['idea:job-count', 'wording:same-question'] }
    expect(selectMixedQuestions([original, repeated], [ { ...request, count: 1 },
      { ...request, unit: 2, count: 1 } ])).toHaveLength(2)
    expect(() => selectQuestions([original, { ...repeated, unit: 1 }], request)).toThrow('different question ideas')
  })
  it('tries alternatives when overlapping wording and idea keys defeat a greedy choice', () => {
    const bridge = { ...brother, selectionKeys: ['idea:age', 'wording:common'] }
    const other = { ...jobs, selectionKeys: ['wording:common'] }
    for (let seed = 0; seed < 20; seed++) {
      expect(selectQuestions([bridge, father, other], { ...request, seed }).map(q=>q.id).sort()).toEqual(['father','jobs'])
    }
  })
})
