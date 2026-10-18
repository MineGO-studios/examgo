import type { CompletionGroup, CompoundSnapshot } from '../domain/compoundStructure'
import { isUuid, type DomainQuestion } from '../domain/questionDomain'
import { validatePassageGroup, type PassageGroup } from '../domain/passageGroup'
import { canonicalJson, canonicalQuestionCandidates } from './canonicalQuestionCandidates'
import { makeExam002Candidate } from './fixtures/phaseTenExam002Candidate'
import { assignCandidateExamMarks } from './phaseTenCandidateProfile'
import type { MidyearSelectionControls } from './phaseTenMidyearSelection'
import { selectQuestions } from './selectQuestions'

const reference = makeExam002Candidate('tissue')

/** Fixed development topology with membership-selected source revisions and exam-owned marks. */
export function selectExam002MarkedCandidate(questions: readonly DomainQuestion[], groups: readonly PassageGroup[],
  standaloneIds: readonly string[], ownerId: string, bankIds: readonly string[], seed: number,
  coverageUnits: readonly number[], controls: MidyearSelectionControls = {}, completionGroups: readonly CompletionGroup[] = []): CompoundSnapshot {
  if (!isUuid(ownerId) || bankIds.length < 1 || bankIds.length > 20 || bankIds.some((id) => !isUuid(id)) ||
    new Set(bankIds).size !== bankIds.length || !Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff ||
    !([1].join(',') === coverageUnits.join(',') || [1, 2, 3, 4].join(',') === coverageUnits.join(','))) {
    throw new Error('Select owned banks, a valid seed and supported Unit 1 or Unit 1–4 coverage.')
  }
  const current = canonicalQuestionCandidates(questions).filter((question) => question.ownerId === ownerId)
  const byId = new Map(current.map((question) => [question.id, question]))
  const excluded = new Set(controls.excludedQuestionIds ?? [])
  const excludedGroups = new Set(controls.excludedPassageGroupIds ?? [])
  const locks = controls.lockedQuestionIds ?? {}
  if (excluded.size !== (controls.excludedQuestionIds ?? []).length ||
    excludedGroups.size !== (controls.excludedPassageGroupIds ?? []).length ||
    [...excluded].some((id) => !byId.has(id)) ||
    [...excludedGroups].some((id) => !groups.some((group) => group.id === id && group.ownerId === ownerId))) {
    throw new Error('An exclusion is duplicated or missing from the current owned pool.')
  }
  const pool = current.filter((question) => coverageUnits.includes(question.unit) && !excluded.has(question.id))
  const eligibleById = new Map(pool.map((question) => [question.id, question]))
  const standalone = new Set(standaloneIds)
  const grouped = new Set(groups.flatMap((group) => group.children.map((child) => child.question.id)))
  const completionSets = completionGroups.filter((group) => group.ownerId === ownerId && group.attemptCount === 5 &&
    group.childIds.length === 6 && group.childIds.every((id) => {
      const question = eligibleById.get(id)
      return question?.type === 'completion' && question.content.blankIds.length === 1 && standalone.has(id) && !grouped.has(id)
    }))
  const atomicCompletion = !pool.some((question) => question.type === 'completion' && question.content.blankIds.length === 6 &&
    standalone.has(question.id) && !grouped.has(question.id))
  const completionByFirstId = new Map(completionSets.map(group => [group.childIds[0], group]))
  const selectedQuestions = (question: DomainQuestion): DomainQuestion[] => atomicCompletion && question.type === 'completion'
    ? completionByFirstId.get(question.id)!.childIds.map(id => byId.get(id)!) : [question]
  const selectionReference = structuredClone(reference)
  if (atomicCompletion) selectionReference.branches[5].items[0].label = '1'
  const eligibleGroups = groups.filter((group) => validatePassageGroup(group, { examOwnedMarks: true }).success &&
    group.ownerId === ownerId && !excludedGroups.has(group.id) && group.attemptCount === 5 && group.children.length === 6 &&
    (!controls.lockedPassageGroupId || controls.lockedPassageGroupId === group.id) &&
    group.children.every((child) => child.question.type === 'short-answer' && eligibleById.has(child.question.id) &&
      canonicalJson(eligibleById.get(child.question.id)) === canonicalJson(child.question)))
    .sort((left, right) => left.id.localeCompare(right.id))
  if (!eligibleGroups.length) throw new Error('No complete current six-point passage fits this candidate. Review the selected banks and exclusions.')

  const slots = selectionReference.branches.flatMap((branch, branchIndex) => branchIndex === 0 ? [] :
    branch.items.map((item, slotIndex) => ({ key: `${branch.id}:${item.label}`, branchIndex, slotIndex,
      choices: pool.filter((question) => standalone.has(question.id) && !grouped.has(question.id) && question.type === item.question.type &&
        (!locks[`${branch.id}:${item.label}`] || question.id === locks[`${branch.id}:${item.label}`]) &&
        (question.type !== 'matching' || question.content.left.length === 5 && question.content.right.length === 5) &&
        (question.type !== 'completion' || (atomicCompletion ? completionSets.some((group) => group.childIds[0] === question.id)
          : question.content.blankIds.length === 6 && question.content.text.split(/\r?\n/).length === 6)) &&
        (question.type !== 'matching' && question.type !== 'completion' || question.prompt.length <= 1000)) })))
  if (Object.keys(locks).some((key) => !slots.some((slot) => slot.key === key))) {
    throw new Error('Lock a supported question slot or the whole passage group.')
  }
  const missing = slots.find((slot) => slot.choices.length === 0)
  if (missing) throw new Error(`No eligible current question remains for ${missing.key}. Review the banks, exclusions and locks.`)
  slots.forEach((slot, index) => {
    const order = selectQuestions(slot.choices.map((question) => ({ ...question, unit: 0 })), {
      unit: 0, type: slot.choices[0].type, count: slot.choices.length, seed: (seed + index * 65_537) >>> 0,
    }).map((question) => question.id)
    const ranks = new Map(order.map((id, rank) => [id, rank]))
    slot.choices.sort((left, right) => ranks.get(left.id)! - ranks.get(right.id)!)
  })
  const ordered = [...slots].sort((left, right) => left.choices.length - right.choices.length || left.key.localeCompare(right.key))
  let visits = 0
  for (let offset = 0; offset < eligibleGroups.length; offset++) {
    const group = eligibleGroups[(seed + offset) % eligibleGroups.length]
    const picked = new Map<string, DomainQuestion>()
    const used = new Set(group.children.map((child) => child.question.id))
    const search = (index: number): boolean => {
      if (++visits > 100_000) throw new Error('Selection reached its safe search limit. Reduce exclusions or change the seed.')
      const selected = [...picked.values()].flatMap(selectedQuestions)
      const units = new Set([...group.children.map((child) => child.question.unit), ...selected.map((q) => q.unit)])
      const uncovered = coverageUnits.filter((unit) => !units.has(unit))
      if (index === ordered.length) return uncovered.length === 0
      if (uncovered.some((unit) => !ordered.slice(index).some((slot) =>
        slot.choices.some(question => !used.has(question.id) && selectedQuestions(question).some(child => child.unit === unit))))) return false
      const slot = ordered[index]
      const choices = slot.choices.filter((question) => !used.has(question.id))
      choices.sort((left, right) => Number(uncovered.includes(right.unit)) - Number(uncovered.includes(left.unit)))
      for (const question of choices) {
        picked.set(slot.key, question); used.add(question.id)
        if (search(index + 1)) return true
        picked.delete(slot.key); used.delete(question.id)
      }
      return false
    }
    if (!search(0)) continue
    const candidate = structuredClone(selectionReference)
    Object.assign(candidate, { ownerId, bankId: bankIds[0], selectionSeed: seed })
    candidate.branches.forEach((branch, index) => {
      if (index === 0) {
        branch.passageGroup = structuredClone(group)
        branch.instruction = group.instruction; branch.arabicInstruction = group.arabicInstruction
        branch.items = group.children.map((child, i) => ({ label: branch.items[i].label, question: structuredClone(child.question) }))
      } else {
        branch.items = branch.items.map((item) => ({ ...item, question: structuredClone(picked.get(`${branch.id}:${item.label}`)!) }))
        if (branch.kind === 'completion' && atomicCompletion) {
          const group = completionSets.find((group) => group.childIds[0] === branch.items[0].question.id)!
          branch.completionGroup = structuredClone(group)
          branch.items = group.childIds.map((id, index) => ({ label: String(index + 1), question: structuredClone(byId.get(id)!) }))
        }
        if (branch.kind === 'matching' || branch.kind === 'completion' || branch.id === 'q4a') {
          const question = branch.items[0].question
          branch.instruction = branch.completionGroup?.instruction ?? (question.type === 'rewrite' ? question.content.instruction : question.prompt)
          branch.arabicInstruction = null
        }
      }
    })
    // Initial reference totals are visible and editable; no canonical mark is consulted.
    return assignCandidateExamMarks(candidate, bankIds, Object.fromEntries(candidate.branches.map((branch) =>
      [branch.id, { totalMarks: branch.marks, distribution: { mode: 'equal' } }])))
  }
  throw new Error('The selected pool cannot satisfy every slot, lock and required unit without repeating questions.')
}
