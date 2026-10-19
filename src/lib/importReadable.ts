import type { StagedInterchangeQuestion } from './questionInterchange'

/** What a teacher needs to recognise an imported question; raw source values stay in diagnostics. */
export interface ReadableImportedQuestion {
  context: Array<{ label: string; instruction: string; passage: string }>
  prompt: string
  details: string[]
  answer: string | null
}

type Item = { id?: unknown; text?: unknown; label?: unknown }
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown) => typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : ''
const list = (value: unknown): Item[] => Array.isArray(value) ? value.filter(record) as Item[] : []
const words = (value: unknown) => Array.isArray(value) ? value.map(text).filter(Boolean) : []

function groupContext(question: StagedInterchangeQuestion): ReadableImportedQuestion['context'] {
  const raw = question.sourceFields.group_context_json
  if (!raw) return []
  try {
    const groups = JSON.parse(raw)
    return list(groups).map((group) => {
      const g = group as Record<string, unknown>
      const main = text(g.main_question_label), branch = text(g.branch_label)
      return { label: main ? `${main}${branch ? '/' + branch : ''}` : 'Linked group', instruction: text(g.instructions), passage: text(g.passage_text) }
    }).filter((group) => group.instruction || group.passage)
  } catch { return [] }
}

function contentLines(content: unknown): string[] {
  if (!record(content)) return []
  const lines: string[] = []
  const options = list(content.options)
  if (options.length) lines.push(...options.map((option) => `${text(option.label)}. ${text(option.text)}`))
  const left = list(content.left), right = list(content.right)
  if (left.length || right.length) {
    lines.push('List A: ' + left.map((item, index) => `${index + 1}. ${text(item.text)}`).join('  '))
    lines.push('List B: ' + right.map((item, index) => `${String.fromCharCode(97 + index)}. ${text(item.text)}`).join('  '))
  }
  if (text(content.text)) lines.push(text(content.text))
  if (words(content.wordBank).length) lines.push(`Word box: ${words(content.wordBank).join(', ')}`)
  if (content.type === 'odd-word' && words(content.words).length) lines.push(words(content.words).join(' / '))
  if (content.type === 'word-relationship' && words(content.words).length) lines.push(words(content.words).join(' → '))
  if (text(content.instruction)) lines.push(text(content.instruction))
  if (content.labelMode === 'yes-no') lines.push('Answer Yes or No')
  if (content.labelMode === 'true-false') lines.push('Answer True or False')
  return lines
}

function answerText(answer: unknown, content: unknown): string | null {
  if (typeof answer === 'string') return answer.trim() || null
  if (!record(answer)) return null
  if (text(answer.correctOptionLabel)) {
    const option = record(content) ? list(content.options).find((item) => text(item.label) === text(answer.correctOptionLabel)) : undefined
    return option ? `${text(option.label)}. ${text(option.text)}` : text(answer.correctOptionLabel)
  }
  if (typeof answer.isTrue === 'boolean') return record(content) && content.labelMode === 'yes-no' ? (answer.isTrue ? 'Yes' : 'No') : (answer.isTrue ? 'True' : 'False')
  if (text(answer.canonicalAnswer)) return text(answer.canonicalAnswer)
  if (words(answer.acceptedAnswers).length) return words(answer.acceptedAnswers).join(' or ')
  if (text(answer.oddWord)) return text(answer.oddWord)
  if (Array.isArray(answer.pairs) && record(content)) {
    const left = list(content.left), right = list(content.right)
    return list(answer.pairs).map((pair) => {
      const p = pair as Record<string, unknown>
      const l = left.findIndex((item) => item.id === p.leftId), r = right.findIndex((item) => item.id === p.rightId)
      return l < 0 || r < 0 ? '?' : `${l + 1} → ${String.fromCharCode(97 + r)}`
    }).join(', ') || null
  }
  if (record(answer.answers)) return Object.values(answer.answers).map(text).filter(Boolean).join(', ') || null
  if (text(answer.modelAnswer)) return `Model answer: ${text(answer.modelAnswer)}`
  if (text(answer.manualMarkingNote)) return text(answer.manualMarkingNote)
  if (text(answer.text)) return text(answer.text)
  return null
}

export function describeImportedQuestion(question: StagedInterchangeQuestion, interpreted: { question: string; content: unknown; answer: unknown }): ReadableImportedQuestion {
  return { context: groupContext(question), prompt: interpreted.question || question.prompt,
    details: contentLines(interpreted.content), answer: answerText(interpreted.answer, interpreted.content) }
}

/** Ordinary history names the source without internal storage paths. */
export function readableImportSource(namespace: string): string {
  if (namespace === 'Papers/Ready_Question_Bank/master_export') return 'Papers master catalogue'
  const last = namespace.split('/').filter(Boolean).at(-1) ?? namespace
  return last.replace(/[-_]+/g, ' ').trim() || 'Imported file'
}

const ISSUE_TEXT: Record<string, { problem: string; remedy: string }> = {
  'prompt-missing': { problem: 'The question text is missing.', remedy: 'Add the question text in the source file, then import it again.' },
  'lesson-unmapped': { problem: 'No lesson was supplied.', remedy: 'Add the lesson in the source file or choose the lesson column, then preview again.' },
  'answer-unmapped': { problem: 'No answer was supplied.', remedy: 'Add the correct answer in the source file or choose the answer column, then preview again.' },
  'group-incomplete': { problem: 'Some linked questions in this passage or exercise are missing from the file.',
    remedy: 'Include every question of the passage or exercise in the file so they can be kept together.' },
}

/** Readable problem and remedy for an adapter issue code; unknown codes stay visible rather than hidden. */
export function readableImportIssue(code: string): { problem: string; remedy: string } {
  return ISSUE_TEXT[code] ?? { problem: `This row needs review (${code.replace(/-/g, ' ')}).`, remedy: 'Check the original row against the supported question types, then preview again.' }
}
