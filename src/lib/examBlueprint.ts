import { compoundBranchPointIds, parseCompoundSnapshot, type CompletionGroup, type CompoundBranch, type CompoundSnapshot } from '../domain/compoundStructure'
import { assignAttemptMarks, type MarkDistribution } from '../domain/markAllocation'
import type { PassageGroup } from '../domain/passageGroup'
import { isUuid, type DomainQuestion, type QuestionDifficulty, type QuestionType } from '../domain/questionDomain'
import { canonicalJson, canonicalQuestionCandidates } from './canonicalQuestionCandidates'
import { EXAM_LIMITS } from '../types/exam'

export interface BlueprintBranch {
  id: string
  mainQuestionNumber: number
  branchLabel: 'A' | 'B' | null
  kind: CompoundBranch['kind']
  instruction: string
  arabicInstruction: string | null
  questionTypes: QuestionType[]
  quantity: number
  displayedPointCount: number
  answerRule: NonNullable<CompoundBranch['answerRule']>
  marks: number
  distribution: MarkDistribution
  units: number[]
  lessons: string[]
  difficulties: QuestionDifficulty[]
  includedQuestionIds: string[]
  excludedQuestionIds: string[]
  lockedQuestionIds: string[]
  /** Explicit current selection and order after teacher review; complete groups retain source order. */
  orderedQuestionIds?: string[]
  /** Last explicitly reviewed versions, without storing source content in editable intent. */
  reviewedQuestionRevisions?: Record<string, number>
  reviewedGroup?: { id: string; revision: number }
}

/** Editable selection intent, never a second authority for captured question content. */
export interface ExamBlueprint {
  schemaVersion: 1
  version: number
  ownerId: string
  bankIds: string[]
  selectionSeed: number
  totalMarks: number
  branches: BlueprintBranch[]
}

/** Supply must come from the authenticated membership repository for these exact banks. */
export interface BlueprintPool {
  bankIds: string[]
  questions: DomainQuestion[]
  standaloneQuestionIds: string[]
  passages: PassageGroup[]
  completionGroups: CompletionGroup[]
}

const types: QuestionType[] = ['multiple-choice', 'binary', 'short-answer', 'completion', 'odd-word', 'matching', 'word-relationship', 'rewrite', 'extended-writing']
function valid(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}
function integer(value: unknown, min: number, max: number): value is number {
  return Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max
}
function text(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && !!value.trim() && value.length <= maximum
}
function distinct<T>(value: unknown, maximum: number, accepts: (item: T) => boolean): value is T[] {
  return Array.isArray(value) && value.length <= maximum && new Set(value).size === value.length && value.every((item) => accepts(item as T))
}

function explicitArabicAnswerCounts(instruction: string): number[] {
  const words: Record<string, number> = { واحد: 1, واحدة: 1, اثنان: 2, اثنين: 2, اثنتان: 2, اثنتين: 2, ثلاثة: 3, ثلاث: 3,
    أربعة: 4, اربعة: 4, أربع: 4, اربع: 4, خمسة: 5, خمس: 5, ستة: 6, ست: 6, سبعة: 7, سبع: 7, ثمانية: 8, ثمان: 8, تسعة: 9, تسع: 9, عشرة: 10, عشر: 10 }
  const normalized = instruction.normalize('NFC').replace(/[\u064B-\u065F\u0670]/g, '').replace(/[٠-٩۰-۹]/g, digit =>
    String(digit.charCodeAt(0) - (digit.charCodeAt(0) >= 0x6f0 ? 0x6f0 : 0x660)))
  const token = `(?:[0-9]+|${Object.keys(words).join('|')})`
  const only = new RegExp(`(?:^|[\\s(])(${token})\\s*فقط(?=$|[\\s).،])`, 'g')
  const answer = new RegExp(`(?:أجب|اجب)\\s+(?:عن\\s+)?\\(?(${token})(?=$|[\\s).،])`, 'g')
  return [...normalized.matchAll(only), ...normalized.matchAll(answer)].map(match => words[match[1]] ?? Number(match[1]))
}

export function parseExamBlueprint(value: unknown): ExamBlueprint {
  valid(value && typeof value === 'object' && !Array.isArray(value), 'An exam blueprint is required.')
  const b = value as ExamBlueprint
  valid(Object.keys(b).every((key) => ['schemaVersion', 'version', 'ownerId', 'bankIds', 'selectionSeed', 'totalMarks', 'branches'].includes(key)),
    'Blueprint contains unsupported captured content or settings.')
  valid(b.schemaVersion === 1 && integer(b.version, 1, 2147483647), 'Blueprint version is unsupported.')
  valid(isUuid(b.ownerId) && distinct(b.bankIds, 20, isUuid) && b.bankIds.length > 0, 'Select one to 20 distinct owned banks.')
  valid(integer(b.selectionSeed, 0, 0xffffffff) && integer(b.totalMarks, 1, 1000), 'Paper seed or total marks are invalid.')
  valid(Array.isArray(b.branches) && b.branches.length > 0 && b.branches.length <= 20, 'Define one to 20 branches.')
  const ids = new Set<string>(); const labels = new Set<string>()
  let previousNumber = 0; let previousLabel: string | null = null
  for (const branch of b.branches) {
    valid(branch && typeof branch === 'object' && text(branch.id, 80) && !ids.has(branch.id), 'Branch identities must be distinct.')
    valid(Object.keys(branch).every((key) => ['id', 'mainQuestionNumber', 'branchLabel', 'kind', 'instruction', 'arabicInstruction', 'questionTypes',
      'quantity', 'displayedPointCount', 'answerRule', 'marks', 'distribution', 'units', 'lessons', 'difficulties',
      'includedQuestionIds', 'excludedQuestionIds', 'lockedQuestionIds', 'orderedQuestionIds', 'reviewedQuestionRevisions', 'reviewedGroup'].includes(key)), 'Branch contains unsupported captured content or settings.')
    ids.add(branch.id)
    const slot = `Q${branch.mainQuestionNumber}${branch.branchLabel ? `/${branch.branchLabel}` : ''}`
    valid(integer(branch.mainQuestionNumber, 1, 5) && [null, 'A', 'B'].includes(branch.branchLabel) && !labels.has(slot) &&
      (branch.mainQuestionNumber > previousNumber || branch.mainQuestionNumber === previousNumber && previousLabel === 'A' && branch.branchLabel === 'B'),
    `${slot}: use ordered, distinct Q1–Q5 branches.`)
    labels.add(slot); previousNumber = branch.mainQuestionNumber; previousLabel = branch.branchLabel
    valid(['questions', 'passage', 'matching', 'completion', 'alternatives'].includes(branch.kind) && text(branch.instruction, 850) &&
      (branch.arabicInstruction === null || text(branch.arabicInstruction, 1000)), `${slot}: enter a supported structure and printed instruction.`)
    valid(distinct<QuestionType>(branch.questionTypes, 9, (type) => types.includes(type)) && branch.questionTypes.length > 0 &&
      integer(branch.quantity, 1, 100) && integer(branch.displayedPointCount, 1, 200) && integer(branch.marks, 1, 1000), `${slot}: quantities, types or marks are invalid.`)
    valid(distinct<number>(branch.units, 8, (unit) => integer(unit, 1, 8)) && distinct<string>(branch.lessons, 100, (lesson) => text(lesson, 200)) &&
      distinct<string>(branch.difficulties, 3, (difficulty) => ['easy', 'medium', 'hard'].includes(difficulty)), `${slot}: filters are invalid.`)
    for (const key of ['includedQuestionIds', 'excludedQuestionIds', 'lockedQuestionIds'] as const) {
      const label = { includedQuestionIds: 'Included questions', excludedQuestionIds: 'Excluded questions', lockedQuestionIds: 'Locked questions' }[key]
      valid(distinct(branch[key], 100, isUuid), `${slot}: ${label} contain invalid or repeated questions.`)
    }
    valid(branch.orderedQuestionIds === undefined || distinct(branch.orderedQuestionIds, 100, isUuid) &&
      (branch.orderedQuestionIds.length === 0 || branch.orderedQuestionIds.length === branch.quantity), `${slot}: chosen order must contain every selected question once.`)
    if (branch.reviewedQuestionRevisions !== undefined) {
      const revisions = branch.reviewedQuestionRevisions
      valid(revisions && typeof revisions === 'object' && !Array.isArray(revisions) &&
        branch.orderedQuestionIds?.length === branch.quantity && Object.keys(revisions).length === branch.quantity &&
        Object.entries(revisions).every(([id, revision]) => branch.orderedQuestionIds!.includes(id) && integer(revision, 1, 2147483647)),
      `${slot}: reviewed versions must match the complete chosen question order.`)
    }
    if (branch.reviewedGroup !== undefined) {
      const group = branch.reviewedGroup
      valid(group && typeof group === 'object' && !Array.isArray(group) && Object.keys(group).length === 2 &&
        isUuid(group.id) && integer(group.revision, 1, 2147483647) && branch.reviewedQuestionRevisions &&
        (branch.kind === 'passage' || branch.kind === 'completion' && branch.quantity > 1), `${slot}: reviewed group versions require a complete passage or completion exercise.`)
    }
    valid(![...branch.includedQuestionIds, ...branch.lockedQuestionIds, ...branch.orderedQuestionIds ?? []].some((id) => branch.excludedQuestionIds.includes(id)), `${slot}: an included, locked or ordered question is excluded. Remove the conflicting choice.`)
    valid(branch.answerRule && typeof branch.answerRule === 'object', `${slot}: choose Points to answer or a writing rule.`)
    const rule = branch.answerRule
    valid(Object.keys(rule).every((key) => key === 'kind' || rule.kind === 'points' && key === 'pointsToAnswer'), `${slot}: answer rule contains unsupported settings.`)
    valid(rule.kind === 'points' && integer(rule.pointsToAnswer, 1, branch.displayedPointCount) ||
      rule.kind === 'task' && branch.kind === 'questions' && branch.quantity === 1 && branch.displayedPointCount === 1 ||
      rule.kind === 'choose-one' && branch.kind === 'alternatives' && branch.quantity === 2 && branch.displayedPointCount === 2,
    `${slot}: Points to answer must be a whole number from 1 through the displayed count. Writing alternatives must choose one topic.`)
    if (rule.kind === 'points') {
      const counts: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, all: branch.displayedPointCount }
      const printed = [...branch.instruction.matchAll(/\banswer\s+(?:any\s+)?(\d+|one|two|three|four|five|six|seven|eight|nine|ten|all)\b|\b(\d+)\s+only\b/gi)]
      valid(printed.every((match) => (counts[(match[1] ?? match[2]).toLowerCase()] ?? Number(match[1] ?? match[2])) === rule.pointsToAnswer),
        `${slot}: the printed instruction conflicts with Points to answer. Edit the instruction or change the count explicitly.`)
      valid(explicitArabicAnswerCounts(branch.arabicInstruction ?? '').every(count => count === rule.pointsToAnswer),
        `${slot}: the Arabic instruction conflicts with Points to answer. Edit the Arabic instruction or change the count explicitly.`)
    }
    valid(branch.distribution && typeof branch.distribution === 'object' && !Array.isArray(branch.distribution) &&
      (branch.distribution.mode === 'equal' && Object.keys(branch.distribution).length === 1 || branch.distribution.mode === 'custom' &&
        Object.keys(branch.distribution).every(key => ['mode', 'marksByPoint'].includes(key))), `${slot}: choose an equal or explicit whole-point mark split.`)
    const attempted = rule.kind === 'points' ? rule.pointsToAnswer : 1
    if (branch.distribution.mode === 'custom') {
      const values = branch.distribution.marksByPoint
      valid(values && typeof values === 'object' && !Array.isArray(values) && Object.keys(values).length === branch.displayedPointCount &&
        Object.entries(values).every(([key, value]) => text(key, 300) && integer(value, 1, 1000)) &&
        branch.orderedQuestionIds?.length === branch.quantity, `${slot}: assign every current point once after reviewing the complete chosen order.`)
      valid(attempted === branch.displayedPointCount ? Object.values(values).reduce((sum, marks) => sum + marks, 0) === branch.marks
        : branch.marks % attempted === 0 && Object.values(values).every(marks => marks === branch.marks / attempted),
      `${slot}: required point marks must total the branch; optional points need equal whole marks.`)
    } else valid(branch.marks >= attempted && branch.marks % attempted === 0,
      `${slot}: optional points need equal whole marks. Change marks or Points to answer.`)
  }
  valid(b.branches.reduce((sum, branch) => sum + branch.marks, 0) === b.totalMarks, 'Branch marks must add up to the paper total.')
  valid(b.branches.reduce((sum, branch) => sum + branch.quantity, 0) <= EXAM_LIMITS.maximumQuestionCount,
    `The complete paper supports at most ${EXAM_LIMITS.maximumQuestionCount} questions. Reduce the quantities before selecting content.`)
  return structuredClone(b)
}

function slotLabel(branch: BlueprintBranch): string {
  return `Q${branch.mainQuestionNumber}${branch.branchLabel ? `/${branch.branchLabel}` : ''}`
}

/** Validates the entire plan and solves overlapping slots before returning any selection. */
export function selectBlueprintPaper(value: unknown, pool: BlueprintPool): CompoundSnapshot {
  const blueprint = parseExamBlueprint(value)
  valid(canonicalJson(pool.bankIds) === canonicalJson(blueprint.bankIds), 'Reload the supply for the selected banks before generating.')
  const current = canonicalQuestionCandidates(pool.questions).filter((q) => q.ownerId === blueprint.ownerId)
  const byId = new Map(current.map((q) => [q.id, q]))
  const grouped = new Set([...pool.passages.flatMap((g) => g.children.map((c) => c.question.id)), ...pool.completionGroups.flatMap((g) => g.childIds)])
  const standalone = new Set(pool.standaloneQuestionIds)
  const choices = blueprint.branches.map((branch) => {
    if (branch.reviewedQuestionRevisions) valid(Object.entries(branch.reviewedQuestionRevisions).every(([id, revision]) => byId.get(id)?.revision === revision),
      `${slotLabel(branch)}: a reviewed question changed or is unavailable. Resolve its version before reviewing this paper.`)
    if (branch.reviewedGroup) valid([...pool.passages, ...pool.completionGroups].some(group => group.ownerId === blueprint.ownerId &&
      group.id === branch.reviewedGroup!.id && group.revision === branch.reviewedGroup!.revision),
    `${slotLabel(branch)}: the reviewed complete group changed or is unavailable. Resolve its version before reviewing this paper.`)
    const fits = (q: DomainQuestion) => branch.questionTypes.includes(q.type) &&
      (!branch.units.length || branch.units.includes(q.unit)) && (!branch.lessons.length || branch.lessons.includes(q.lesson)) &&
      (!branch.difficulties.length || branch.difficulties.includes(q.difficulty)) && !branch.excludedQuestionIds.includes(q.id)
    const base = { id: branch.id, mainQuestionNumber: branch.mainQuestionNumber, branchLabel: branch.branchLabel,
      kind: branch.kind, instruction: branch.instruction, arabicInstruction: branch.arabicInstruction, marks: branch.marks,
      attemptCount: branch.answerRule.kind === 'points' ? branch.answerRule.pointsToAnswer : 1, answerRule: branch.answerRule }
    const make = (questions: DomainQuestion[], extra: Partial<CompoundBranch> = {}): CompoundBranch => {
      if (branch.orderedQuestionIds?.length && !['passage', 'completion'].includes(branch.kind)) {
        questions = [...questions].sort((a, b) => branch.orderedQuestionIds!.indexOf(a.id) - branch.orderedQuestionIds!.indexOf(b.id))
      }
      const ruleText = branch.answerRule.kind === 'points' ? `Answer ${base.attemptCount} of ${branch.displayedPointCount}.`
        : branch.answerRule.kind === 'choose-one' ? 'Choose one topic: A or B.' : ''
      const result: CompoundBranch = { ...base, instruction: [branch.instruction, ruleText].filter(Boolean).join('\n'),
        items: questions.map((q, index) => ({ question: q, label: branch.kind === 'alternatives' ? (index ? 'B' : 'A') : String(index + 1) })), ...extra }
      const points = compoundBranchPointIds(result)
      valid(points.length === branch.displayedPointCount && questions.length === branch.quantity, `${slotLabel(branch)}: displayed quantities differ from the complete content.`)
      result.pointMarks = Object.fromEntries(assignAttemptMarks(points, branch.marks, result.attemptCount, branch.distribution).pointMarks.map((p) => [p.pointId, p.marks]))
      parseCompoundSnapshot({ schemaVersion: 2, ownerId: blueprint.ownerId, bankId: blueprint.bankIds[0], bankIds: blueprint.bankIds,
        selectionSeed: blueprint.selectionSeed, totalMarks: branch.marks, branches: [result] })
      return result
    }
    let sets: CompoundBranch[] = []
    if (branch.kind === 'passage') {
      for (const group of pool.passages) {
        if (group.ownerId !== blueprint.ownerId || branch.reviewedGroup && group.id !== branch.reviewedGroup.id || group.children.length !== branch.quantity || !group.children.every((c) =>
          byId.has(c.question.id) && canonicalJson(byId.get(c.question.id)) === canonicalJson(c.question) && fits(c.question))) continue
        sets.push(make(group.children.map((c) => c.question), { passageGroup: group }))
      }
    } else if (branch.kind === 'completion' && branch.quantity > 1) {
      for (const group of pool.completionGroups) {
        const questions = group.childIds.map((id) => byId.get(id))
        if (group.ownerId !== blueprint.ownerId || branch.reviewedGroup && group.id !== branch.reviewedGroup.id || questions.length !== branch.quantity || !questions.every((q) => q && fits(q))) continue
        sets.push(make(questions as DomainQuestion[], { completionGroup: group }))
      }
    } else {
      const candidates = current.filter((q) => standalone.has(q.id) && !grouped.has(q.id) && fits(q) &&
        (branch.kind === 'matching' ? q.type === 'matching' && q.content.left.length === branch.displayedPointCount
          : branch.kind === 'completion' ? q.type === 'completion' && q.content.blankIds.length === branch.displayedPointCount
            : q.type !== 'matching' && q.type !== 'completion') &&
        (branch.answerRule.kind === 'task' ? q.type === 'extended-writing' || q.type === 'rewrite' && /punctuation/i.test(q.content.instruction)
          : branch.answerRule.kind === 'choose-one' ? q.type === 'extended-writing'
            : q.type !== 'extended-writing' && !(q.type === 'rewrite' && /punctuation/i.test(q.content.instruction))))
      // Combinations are generated lazily by the shared search below for ordinary question slots.
      return { branch, candidates, make, sets: null }
    }
    sets = sets.filter((set) => [...branch.includedQuestionIds, ...branch.lockedQuestionIds, ...branch.orderedQuestionIds ?? []].every((id) => set.items.some((i) => i.question.id === id)) &&
      (!branch.orderedQuestionIds?.length || set.items.every((item, index) => item.question.id === branch.orderedQuestionIds![index])))
    return { branch, candidates: [], make, sets }
  })
  const selected: CompoundBranch[] = []; const used = new Set<string>(); let visits = 0, furthestBranch = 0
  const rank = (id: string) => {
    let hash = blueprint.selectionSeed
    for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0
    return hash
  }
  function search(index: number): boolean {
    if (++visits > 100_000) throw new Error('Selection needs review: the safe search limit was reached. Narrow the filters or simplify overlapping branches; no rule was relaxed.')
    if (index === choices.length) return true
    furthestBranch = Math.max(furthestBranch, index)
    const { branch, candidates, sets, make } = choices[index]
    const accept = (set: CompoundBranch): boolean => {
      if (set.items.some((i) => used.has(i.question.id))) return false
      set.items.forEach((i) => used.add(i.question.id)); selected.push(set)
      if (search(index + 1)) return true
      selected.pop(); set.items.forEach((i) => used.delete(i.question.id)); return false
    }
    if (sets) return [...sets].sort((a, b) => rank(a.items[0].question.id) - rank(b.items[0].question.id) || a.items[0].question.id.localeCompare(b.items[0].question.id)).some(accept)
    const required = new Set([...branch.includedQuestionIds, ...branch.lockedQuestionIds, ...branch.orderedQuestionIds ?? []])
    const available = candidates.filter((q) => !used.has(q.id)).sort((a, b) => Number(required.has(b.id)) - Number(required.has(a.id)) || rank(a.id) - rank(b.id) || a.id.localeCompare(b.id))
    if (required.size > branch.quantity || [...required].some((id) => !available.some((q) => q.id === id))) return false
    const picked: DomainQuestion[] = []
    function combine(start: number): boolean {
      if (++visits > 100_000) throw new Error(`${slotLabel(branch)}: selection needs review after reaching the safe search limit. Narrow the filters.`)
      if (picked.length === branch.quantity) return [...required].every((id) => picked.some((q) => q.id === id)) && accept(make(picked))
      for (let i = start; i <= available.length - (branch.quantity - picked.length); i++) {
        if (branch.kind === 'alternatives' && picked.some(q =>
          q.prompt.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase() ===
          available[i].prompt.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase())) continue
        picked.push(available[i]); if (combine(i + 1)) return true; picked.pop()
      }
      return false
    }
    return combine(0)
  }
  for (const { branch, candidates, sets } of choices) {
    const context = `${slotLabel(branch)} (${branch.units.length ? 'Unit ' + branch.units.join(', ') : 'all selected units'}; ${branch.questionTypes.join(', ')}; ${branch.quantity} questions)`
    valid(sets ? sets.length : candidates.length >= branch.quantity,
      `${context}: not enough complete eligible content for these types, filters, quantities and locked choices. Add content or explicitly change this branch.`)
    if (!sets) {
      const required = [...new Set([...branch.includedQuestionIds, ...branch.lockedQuestionIds, ...branch.orderedQuestionIds ?? []])]
      valid(required.length <= branch.quantity && required.every(id => candidates.some(q => q.id === id)),
        `${context}: an included, locked or chosen question no longer fits. Review those choices and filters, reload the banks, or explicitly return to bank selection; no rule was relaxed.`)
    }
  }
  valid(search(0), `${slotLabel(choices[furthestBranch].branch)}: the complete paper cannot satisfy this branch without repeating questions. Review included/locked choices or overlapping filters; no rule was relaxed.`)
  return parseCompoundSnapshot({ schemaVersion: 2, ownerId: blueprint.ownerId, bankId: blueprint.bankIds[0], bankIds: blueprint.bankIds,
    selectionSeed: blueprint.selectionSeed, totalMarks: blueprint.totalMarks, branches: selected })
}
