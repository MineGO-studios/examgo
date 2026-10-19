import { useEffect, useState } from 'react'
import { questionRowToDomain, type DomainQuestion } from '../domain/questionDomain'
import { validatePassageGroup, type PassageGroup } from '../domain/passageGroup'
import { getPassageGroups, savePassageGroup } from '../lib/passageGroupRepository'
import { getQuestionsForBanks, removeDerivedGroupMembership } from '../lib/questionMembershipRepository'
import { getQuestions } from '../lib/questionRepository'
import { teacherErrorMessage } from '../lib/safeErrorDetails'

type Draft = Pick<PassageGroup, 'id' | 'revision' | 'title' | 'instruction' | 'arabicInstruction' | 'passage' | 'attemptCount'> & { childIds: string[] }

function emptyDraft(): Draft {
  return { id: crypto.randomUUID(), revision: 1, title: null, instruction: '', arabicInstruction: null, passage: '', attemptCount: 1, childIds: [] }
}

function groupDraft(group: PassageGroup): Draft {
  return { id: group.id, revision: group.revision, title: group.title, instruction: group.instruction,
    arabicInstruction: group.arabicInstruction, passage: group.passage, attemptCount: group.attemptCount,
    childIds: group.children.map((child) => child.question.id) }
}

function marksFor(children: DomainQuestion[], attemptCount: number): number | null {
  if (!children.length || attemptCount < 1 || attemptCount > children.length) return null
  if (children.some((child) => child.marks === null)) return null
  if (attemptCount === children.length) return children.reduce((sum, child) => sum + child.marks!, 0)
  return children.every((child) => child.marks === children[0].marks) ? attemptCount * children[0].marks! : null
}

function referenceAnswer(question: DomainQuestion): string {
  switch (question.type) {
    case 'multiple-choice': {
      const correct = question.content.options.find((option) => option.label === question.answer.correctOptionLabel)
      return correct ? `${correct.label}. ${correct.text}` : 'Correct option is missing.'
    }
    case 'binary': return question.answer.isTrue
      ? question.content.labelMode === 'yes-no' ? 'Yes' : 'True'
      : question.content.labelMode === 'yes-no' ? 'No' : 'False'
    case 'short-answer': return question.answer.approvedVariants?.length
      ? `${question.answer.canonicalAnswer} · Also accept: ${question.answer.approvedVariants.join(' / ')}`
      : question.answer.canonicalAnswer
    case 'completion': return question.content.blankIds.map((id, index) => `${index + 1}. ${question.answer.answers[id]}`).join(' · ')
    case 'odd-word': return question.answer.oddWord
    case 'word-relationship':
    case 'rewrite': return question.answer.acceptedAnswers.join(' / ')
    case 'extended-writing': return question.answer.modelAnswer || question.answer.manualMarkingNote || 'Manual marking'
    case 'matching': return 'Review the saved List A and List B pairs.'
  }
}

export default function PassageGroupEditor({ ownerId, bankId, onOpenSourceBank }: {
  ownerId: string; bankId: string; onOpenSourceBank?: (id: string) => void
}) {
  const [questions, setQuestions] = useState<DomainQuestion[]>([])
  const [groups, setGroups] = useState<PassageGroup[]>([])
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('Loading passage groups…')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    void Promise.all([getQuestionsForBanks([bankId]), getPassageGroups(bankId)]).then(([rows, passages]) => {
      if (active) { setQuestions(rows.map(questionRowToDomain)); setGroups(passages); setMessage(`${passages.length} saved passage group${passages.length === 1 ? '' : 's'}.`) }
    }).catch((error: unknown) => {
      if (active) { setFailed(true); setMessage(teacherErrorMessage(error, 'Unable to load passage groups.')) }
    })
    return () => { active = false }
  }, [bankId])

  const byId = new Map(questions.map((question) => [question.id, question]))
  const selectedGroup = groups.find((group) => group.id === draft.id)
  const viewingDerived = Boolean(selectedGroup && selectedGroup.bankId !== bankId)
  const children = draft.childIds.map((id) => byId.get(id)).filter((question): question is DomainQuestion => Boolean(question))
  const eligible = questions.filter((question) => question.bankId === bankId &&
    question.isActive && question.type !== 'matching')
  const move = (index: number, direction: -1 | 1) => {
    const next = [...draft.childIds]
    const target = index + direction
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setDraft({ ...draft, childIds: next })
  }
  const save = async () => {
    if (busy) return
    setBusy(true); setFailed(false)
    try {
      if (viewingDerived) throw new Error('Open the source bank to edit this passage group.')
      const latest = (await getQuestions(bankId)).map(questionRowToDomain)
      const latestById = new Map(latest.map((question) => [question.id, question]))
      const ordered = draft.childIds.map((id) => latestById.get(id))
      if (ordered.some((question) => !question)) throw new Error('A selected question changed or disappeared. Reopen the passage and review its children.')
      const currentChildren = ordered as DomainQuestion[]
      if (currentChildren.some((question, index) => question.revision !== children[index]?.revision)) {
        throw new Error('A selected question changed. Review its current answer before saving.')
      }
      const expectedMarks = selectedGroup?.expectedMarks == null
        ? null : marksFor(currentChildren, draft.attemptCount)
      if (selectedGroup?.expectedMarks != null && expectedMarks === null) {
        throw new Error('The historical passage marks no longer fit these children. Create a new markless passage group.')
      }
      const group: PassageGroup = { id: draft.id, revision: draft.revision, ownerId, bankId, schemaVersion: 1,
        title: draft.title, instruction: draft.instruction, arabicInstruction: draft.arabicInstruction,
        passage: draft.passage, attemptCount: draft.attemptCount, expectedMarks,
        children: currentChildren.map((question, index) => ({ position: index + 1, question })) }
      const validation = validatePassageGroup(group)
      if (!validation.success) throw new Error(`${validation.issues[0].path}: ${validation.issues[0].message}`)
      const saved = await savePassageGroup(group, groups.some((row) => row.id === draft.id) ? draft.revision : 0)
      const reopened = await getPassageGroups(bankId)
      setQuestions(latest); setGroups(reopened); setDraft(groupDraft(saved))
      setMessage('Passage and ordered questions saved. Review the reopened group before using it in a paper.')
    } catch (error) {
      setFailed(true); setMessage(teacherErrorMessage(error, 'Passage save could not be confirmed.'))
    } finally { setBusy(false) }
  }

  const removeFromCollection = async () => {
    if (busy || !selectedGroup || !viewingDerived) return
    setBusy(true); setFailed(false)
    try {
      await removeDerivedGroupMembership(bankId, selectedGroup.id,
        selectedGroup.children.map((child) => child.question.id))
      const [rows, passages] = await Promise.all([
        getQuestionsForBanks([bankId]), getPassageGroups(bankId),
      ])
      setQuestions(rows.map(questionRowToDomain)); setGroups(passages); setDraft(emptyDraft())
      setMessage('Complete passage group removed from this collection. Its source questions remain saved.')
    } catch (error) {
      setFailed(true); setMessage(teacherErrorMessage(error, 'Unable to remove the complete group.'))
    } finally { setBusy(false) }
  }

  return <section className="card" aria-labelledby="passage-groups-title">
    <h2 id="passage-groups-title">Passage groups</h2>
    <p>Keep the passage and its answerable questions together. Select their order and how many must be answered. The teacher assigns marks when composing an exam.</p>
    <p role={failed ? 'alert' : 'status'} aria-live="polite">{message}</p>
    {viewingDerived && selectedGroup && <p>This group is shared from another bank.
      {onOpenSourceBank && <button type="button" className="button-secondary"
        onClick={() => onOpenSourceBank(selectedGroup.bankId)}>Open source bank to edit</button>}
      <button type="button" className="button-secondary" disabled={busy}
        onClick={() => void removeFromCollection()}>Remove group from this collection</button>
    </p>}
    <label>Saved passages<select value={groups.some((group) => group.id === draft.id) ? draft.id : ''} disabled={busy}
      onChange={(event) => {
        const selected = groups.find((group) => group.id === event.target.value)
        setDraft(selected ? groupDraft(selected) : emptyDraft())
      }}>
      <option value="">New passage</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.title || group.passage.slice(0, 60)}</option>)}
    </select></label>
    <button type="button" className="button-secondary" disabled={busy} onClick={() => setDraft(emptyDraft())}>New passage</button>
    <fieldset disabled={busy || viewingDerived} className="structured-fields">
      <legend>Passage and instruction</legend>
      <label>Title (optional)<input maxLength={200} value={draft.title ?? ''} onChange={(e) => setDraft({ ...draft, title: e.target.value || null })} /></label>
      <label>Printed instruction<textarea maxLength={1000} rows={2} value={draft.instruction} onChange={(e) => setDraft({ ...draft, instruction: e.target.value })} /></label>
      <label>Arabic instruction (optional)<textarea maxLength={1000} rows={2} dir="rtl" value={draft.arabicInstruction ?? ''} onChange={(e) => setDraft({ ...draft, arabicInstruction: e.target.value || null })} /></label>
      <label>Passage<textarea maxLength={5000} rows={8} value={draft.passage} onChange={(e) => setDraft({ ...draft, passage: e.target.value })} /></label>
      <label>Questions to answer<input type="number" min={1} max={draft.childIds.length || 1} value={draft.attemptCount} onChange={(e) => setDraft({ ...draft, attemptCount: Number(e.target.value) })} /></label>
    </fieldset>
    <h3>Ordered questions</h3>
    <p>{draft.childIds.length} displayed · marks assigned when composing an exam</p>
    <ol>{draft.childIds.map((id, index) => {
      const question = byId.get(id)
      return <li key={id}><strong>{question?.prompt ?? 'Missing question'}</strong>
        <div className="recovery-actions"><button disabled={busy || viewingDerived || index === 0} onClick={() => move(index, -1)}>Move up</button>
          <button disabled={busy || viewingDerived || index === draft.childIds.length - 1} onClick={() => move(index, 1)}>Move down</button>
          <button disabled={busy || viewingDerived} onClick={() => setDraft({ ...draft, childIds: draft.childIds.filter((childId) => childId !== id) })}>Remove</button></div>
        {question && <details><summary>Review reference answer</summary><p>{referenceAnswer(question)}</p></details>}
      </li>
    })}</ol>
    <label>Add question<select value="" disabled={busy || viewingDerived} onChange={(event) => setDraft({ ...draft, childIds: [...draft.childIds, event.target.value] })}>
      <option value="">Choose a saved question…</option>{eligible.filter((question) => !draft.childIds.includes(question.id)).map((question) => <option key={question.id} value={question.id}>{question.prompt.slice(0, 90)}</option>)}
    </select></label>
    <button type="button" disabled={busy || viewingDerived || !draft.childIds.length} onClick={() => void save()}>{busy ? 'Saving passage…' : 'Save passage group'}</button>
  </section>
}
