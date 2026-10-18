import type { CompoundSnapshot } from '../../domain/compoundStructure'

/** Source-shaped fixture: six canonical rows share an original completion exercise. */
export function withAtomicCompletion(snapshot: CompoundSnapshot): CompoundSnapshot {
  const candidate = structuredClone(snapshot)
  const branch = candidate.branches[5]
  const original = branch.items[0].question
  if (original.type !== 'completion') throw new Error('The candidate fixture must contain completion.')
  branch.items = original.content.text.split(/\r?\n/).map((text, index) => ({ label: String(index + 1),
    question: { ...structuredClone(original), id: `cccccccc-cccc-4ccc-8ccc-${String(index + 1).padStart(12, '0')}`,
      externalId: `ATOMIC-${index + 1}`, prompt: text, marks: null,
      content: { ...structuredClone(original.content), text, blankIds: ['1'], requireAllWordsUsed: false },
      answer: { ...structuredClone(original.answer), answers: { '1': original.answer.answers[original.content.blankIds[index]] } } } }))
  branch.completionGroup = { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', ownerId: original.ownerId,
    bankId: original.bankId, revision: 1, schemaVersion: 1, title: 'Complete source exercise',
    instruction: branch.instruction, attemptCount: 5, expectedMarks: null,
    content: { type: 'branch', schemaVersion: 1, bankId: original.bankId, sourceGroupType: 'completion_set',
      source: { group_completeness: 'complete', display_count: 6 } },
    childIds: branch.items.map((item) => item.question.id) }
  return candidate
}
