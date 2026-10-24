import type { StagedInterchangeQuestion } from './questionInterchange'
import type { Language } from './i18n'
import { IMPORT_READABLE_STRINGS } from './importReadable.strings'

type Strings = (typeof IMPORT_READABLE_STRINGS)['en']

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

function groupContext(question: StagedInterchangeQuestion, s: Strings): ReadableImportedQuestion['context'] {
  const raw = question.sourceFields.group_context_json
  if (!raw) return []
  try {
    const groups = JSON.parse(raw)
    return list(groups).map((group) => {
      const g = group as Record<string, unknown>
      const main = text(g.main_question_label), branch = text(g.branch_label)
      return { label: main ? `${main}${branch ? '/' + branch : ''}` : s.linkedGroup, instruction: text(g.instructions), passage: text(g.passage_text) }
    }).filter((group) => group.instruction || group.passage)
  } catch { return [] }
}

function contentLines(content: unknown, s: Strings): string[] {
  if (!record(content)) return []
  const lines: string[] = []
  const options = list(content.options)
  if (options.length) lines.push(...options.map((option) => `${text(option.label)}. ${text(option.text)}`))
  const left = list(content.left), right = list(content.right)
  if (left.length || right.length) {
    lines.push(`${s.listA} ` + left.map((item, index) => `${index + 1}. ${text(item.text)}`).join('  '))
    lines.push(`${s.listB} ` + right.map((item, index) => `${String.fromCharCode(97 + index)}. ${text(item.text)}`).join('  '))
  }
  if (text(content.text)) lines.push(text(content.text))
  if (words(content.wordBank).length) lines.push(`${s.wordBox} ${words(content.wordBank).join(', ')}`)
  if (content.type === 'odd-word' && words(content.words).length) lines.push(words(content.words).join(' / '))
  if (content.type === 'word-relationship' && words(content.words).length) lines.push(words(content.words).join(' → '))
  if (text(content.instruction)) lines.push(text(content.instruction))
  if (content.labelMode === 'yes-no') lines.push(s.answerYesNo)
  if (content.labelMode === 'true-false') lines.push(s.answerTrueFalse)
  return lines
}

function answerText(answer: unknown, content: unknown, s: Strings): string | null {
  if (typeof answer === 'string') return answer.trim() || null
  if (!record(answer)) return null
  if (text(answer.correctOptionLabel)) {
    const option = record(content) ? list(content.options).find((item) => text(item.label) === text(answer.correctOptionLabel)) : undefined
    return option ? `${text(option.label)}. ${text(option.text)}` : text(answer.correctOptionLabel)
  }
  if (typeof answer.isTrue === 'boolean') return record(content) && content.labelMode === 'yes-no' ? (answer.isTrue ? s.yes : s.no) : (answer.isTrue ? s.true : s.false)
  if (text(answer.canonicalAnswer)) return text(answer.canonicalAnswer)
  if (words(answer.acceptedAnswers).length) return words(answer.acceptedAnswers).join(` ${s.or} `)
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
  if (text(answer.modelAnswer)) return `${s.modelAnswer} ${text(answer.modelAnswer)}`
  if (text(answer.manualMarkingNote)) return text(answer.manualMarkingNote)
  if (text(answer.text)) return text(answer.text)
  return null
}

export function describeImportedQuestion(question: StagedInterchangeQuestion, interpreted: { question: string; content: unknown; answer: unknown }, language: Language = 'en'): ReadableImportedQuestion {
  const s = IMPORT_READABLE_STRINGS[language]
  return { context: groupContext(question, s), prompt: interpreted.question || question.prompt,
    details: contentLines(interpreted.content, s), answer: answerText(interpreted.answer, interpreted.content, s) }
}

/** Ordinary history names the source without internal storage paths. */
export function readableImportSource(namespace: string, language: Language = 'en'): string {
  const s = IMPORT_READABLE_STRINGS[language]
  if (namespace === 'Papers/Ready_Question_Bank/master_export') return s.papersSource
  const last = namespace.split('/').filter(Boolean).at(-1) ?? namespace
  return last.replace(/[-_]+/g, ' ').trim() || s.importedFile
}

const ISSUE_TEXT: Record<string, (s: Strings) => { problem: string; remedy: string }> = {
  'prompt-missing': (s) => ({ problem: s.promptMissing, remedy: s.promptMissingFix }),
  'lesson-unmapped': (s) => ({ problem: s.lessonMissing, remedy: s.lessonMissingFix }),
  'answer-unmapped': (s) => ({ problem: s.answerMissing, remedy: s.answerMissingFix }),
  'group-incomplete': (s) => ({ problem: s.groupIncomplete, remedy: s.groupIncompleteFix }),
}

/** Readable problem and remedy for an adapter issue code; unknown codes stay visible rather than hidden. */
export function readableImportIssue(code: string, language: Language = 'en'): { problem: string; remedy: string } {
  const s = IMPORT_READABLE_STRINGS[language]
  return ISSUE_TEXT[code]?.(s) ?? { problem: s.unknownIssue(code.replace(/-/g, ' ')), remedy: s.unknownIssueFix }
}
