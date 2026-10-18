import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createServer } from 'vite'

/** Complete authenticated RPCs, using only the caller's disposable database. */
export async function verifyFinalizationQuotas({ admin, teacher, owner, bank, setLimit, pass }) {
  const converter = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom' })
  try {
    const { questionRowToDomain } = await converter.ssrLoadModule('/src/domain/questionDomain.ts')
    const { selectBlueprintPaper } = await converter.ssrLoadModule('/src/lib/examBlueprint.ts')
    const { recordBlueprintSourceReview } = await converter.ssrLoadModule('/src/lib/examBlueprintRecovery.ts')
    const { createBlueprintPaperIntent } = await converter.ssrLoadModule('/src/lib/examBlueprintPaper.ts')
    const row = (await admin.query('select * from public.questions where owner_id=$1 and bank_id=$2 order by id limit 1', [owner, bank])).rows[0]
    const question = questionRowToDomain(row)
    const pool = { bankIds: [bank], questions: [question], passages: [], completionGroups: [], standaloneQuestionIds: [question.id] }
    const plan = { schemaVersion: 1, version: 1, ownerId: owner, bankIds: [bank], selectionSeed: 17, totalMarks: 1,
      branches: [{ id: 'q1', mainQuestionNumber: 1, branchLabel: null, kind: 'questions', instruction: 'Answer the question.',
        arabicInstruction: null, questionTypes: ['multiple-choice'], quantity: 1, displayedPointCount: 1,
        answerRule: { kind: 'points', pointsToAnswer: 1 }, marks: 1, distribution: { mode: 'equal' }, units: [1], lessons: [], difficulties: [],
        includedQuestionIds: [question.id], excludedQuestionIds: [], lockedQuestionIds: [] }] }
    const review = selectBlueprintPaper(plan, pool)
    const intent = { schemaVersion: 1, profileId: 'exam-blueprint-v1', rendererVersion: 1,
      blueprint: recordBlueprintSourceReview(plan, review, pool),
      settings: { schoolName: 'Synthetic school', examTitle: 'Quota RPC check', teacherName: '', grade: 6 }, generalInstruction: 'Answer all questions.' }
    const paper = createBlueprintPaperIntent(intent, review, 'unchanged-two-page')
    await setLimit(admin, 'exam_drafts', 200)
    const save = async () => {
      const id = randomUUID()
      await teacher.query('select public.save_exam_blueprint($1,0,$2,$3)', [id, randomUUID(), intent])
      return id
    }
    const finalize = async (id, request) => (await teacher.query('select public.finalize_blueprint_paper($1,$2,1,$3) result', [request, id, paper])).rows[0].result
    const firstDraft = await save(), firstRequest = randomUUID()
    await setLimit(admin, 'exam_snapshots', 1, 1, '1 hour')
    const first = await finalize(firstDraft, firstRequest)
    const aggregate = async () => (await admin.query(`select
      (select count(*)::int from public.exam_snapshots where owner_id=$1) snapshots,
      (select count(*)::int from public.exam_snapshot_questions where snapshot_id in (select id from public.exam_snapshots where owner_id=$1)) children`, [owner])).rows[0]
    const before = await aggregate()
    assert.deepEqual(await finalize(firstDraft, firstRequest), first)
    assert.deepEqual(await aggregate(), before)
    const secondDraft = await save(), secondRequest = randomUUID()
    await assert.rejects(() => finalize(secondDraft, secondRequest), { code: '53400', hint: 'account-limit:exam_snapshots:total' })
    assert.deepEqual(await aggregate(), before)
    pass('real finalization RPC: first sealed paper accepted, new paper refused at total limit atomically, exact retry not charged')
    await setLimit(admin, 'exam_snapshots', 500, 1, '1 hour')
    await assert.rejects(() => finalize(secondDraft, secondRequest), { code: '53400', hint: 'account-limit:exam_snapshots:rate' })
    assert.deepEqual(await aggregate(), before)
    assert.deepEqual(await finalize(firstDraft, firstRequest), first)
    await setLimit(admin, 'exam_snapshots', 500, 2, '1 hour')
    const second = await finalize(secondDraft, secondRequest)
    assert.notEqual(second.id, first.id)
    assert.deepEqual(await aggregate(), { snapshots: 2, children: 2 })
    assert.deepEqual(await finalize(secondDraft, secondRequest), second)
    assert.deepEqual(await aggregate(), { snapshots: 2, children: 2 })
    pass('real finalization RPC: hourly limit rejects with no partial aggregate; raising allowance permits the same request; retry remains exact')
  } finally { await converter.close() }
}
