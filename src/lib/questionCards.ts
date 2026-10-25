import type { Question } from './questions'

/*
 * What the question bank's index cards show: a short type mark on the front and the answer on the back.
 * Reads the stored content and answer defensively; an unexpected shape falls back to a neutral line.
 */

type Loose = Record<string, unknown>
const record = (value: unknown): Loose => value && typeof value === 'object' && !Array.isArray(value) ? value as Loose : {}

const TYPE_MARKS: Record<string, string> = {
  'multiple-choice': 'A B C',
  binary: 'T / F',
  'short-answer': 'Aa',
  completion: '___',
  'odd-word': '≠',
  matching: '⇄',
  ordering: '1 2 3',
  writing: '✎',
}

export function questionTypeMark(type: string): string {
  return TYPE_MARKS[type] ?? '?'
}

/** The answer side of a card, short enough for a small card. */
export function questionAnswerPreview(question: Pick<Question, 'question_type' | 'answer' | 'content' | 'correct_option_label' | 'options'>): string {
  const answer = record(question.answer), content = record(question.content)
  switch (question.question_type) {
    case 'multiple-choice': {
      const label = typeof answer.correctOptionLabel === 'string' ? answer.correctOptionLabel : question.correct_option_label
      const options = Array.isArray(content.options) ? content.options : Array.isArray(question.options) ? question.options : []
      const text = options.map(record).find(option => option.label === label)?.text
      return label ? `${label}${typeof text === 'string' && text ? ` · ${text}` : ''}` : 'Answer key ready'
    }
    case 'binary': {
      if (typeof answer.isTrue !== 'boolean') return 'Answer key ready'
      return content.labelMode === 'yes-no' ? (answer.isTrue ? 'Yes' : 'No') : (answer.isTrue ? 'True' : 'False')
    }
    case 'short-answer':
      return typeof answer.canonicalAnswer === 'string' && answer.canonicalAnswer ? answer.canonicalAnswer : 'Answer key ready'
    case 'odd-word':
      return typeof answer.oddWord === 'string' && answer.oddWord ? answer.oddWord : 'Answer key ready'
    case 'completion': {
      const count = Object.keys(record(answer.answers)).length
      return count ? `${count} ${count === 1 ? 'blank' : 'blanks'} answered` : 'Answer key ready'
    }
    case 'matching': {
      const pairs = Array.isArray(answer.pairs) ? answer.pairs.length : Array.isArray(content.left) ? content.left.length : 0
      return pairs ? `${pairs} pairs matched` : 'Answer key ready'
    }
    case 'writing':
      return 'Marked by the teacher'
    default:
      return 'Answer key ready'
  }
}

export interface UnitCount {
  unit: number
  total: number
  usable: number
}

/** Questions per unit, in unit order, for the coverage strip. */
export function unitCounts(questions: readonly Pick<Question, 'unit' | 'is_active'>[]): UnitCount[] {
  const byUnit = new Map<number, UnitCount>()
  for (const question of questions) {
    const entry = byUnit.get(question.unit) ?? { unit: question.unit, total: 0, usable: 0 }
    entry.total += 1
    if (question.is_active) entry.usable += 1
    byUnit.set(question.unit, entry)
  }
  return [...byUnit.values()].sort((a, b) => a.unit - b.unit)
}
