import { beforeEach, expect, it, vi } from 'vitest'
import { EXAM_BLUEPRINT_PROFILE_ID, type ExamBlueprintIntent } from './examBlueprintWorkflow'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('./supabase', () => ({ supabase: { rpc } }))
import { BlueprintStorageError, getExamBlueprints, saveExamBlueprint } from './examBlueprintRepository'

const owner = '11111111-1111-4111-8111-111111111111'
const id = '22222222-2222-4222-8222-222222222222'
const request = '33333333-3333-4333-8333-333333333333'
function intent(): ExamBlueprintIntent {
  return { schemaVersion: 1, profileId: EXAM_BLUEPRINT_PROFILE_ID, rendererVersion: 1,
    settings: { schoolName: 'School', examTitle: 'Paper', teacherName: '', grade: 6 }, generalInstruction: 'Answer the questions.',
    blueprint: { schemaVersion: 1, version: 1, ownerId: owner, bankIds: [owner], selectionSeed: 1, totalMarks: 1,
      branches: [{ id: 'branch', mainQuestionNumber: 1, branchLabel: 'B', kind: 'questions', instruction: 'Answer the question.',
        arabicInstruction: null, questionTypes: ['short-answer'], quantity: 1, displayedPointCount: 1, answerRule: { kind: 'points', pointsToAnswer: 1 },
        marks: 1, distribution: { mode: 'equal' }, units: [], lessons: [], difficulties: [], includedQuestionIds: [], excludedQuestionIds: [], lockedQuestionIds: [] }] } }
}
function response(workflow = intent()) { return { id, version: workflow.blueprint.version, savedAt: '2026-10-16T00:00:00Z', finalized: false, workflow } }
beforeEach(() => rpc.mockReset())

it('sends one copied editable intent and verifies exact save readback', async () => {
  const payload = intent(), expected = structuredClone(payload)
  rpc.mockImplementation(async () => { payload.settings.examTitle = 'Caller edit'; return { data: response(expected), error: null } })
  expect((await saveExamBlueprint(payload, id, 0, request)).intent).toEqual(expected)
  expect(rpc).toHaveBeenCalledExactlyOnceWith('save_exam_blueprint', { p_id: id, p_expected_version: 0, p_request_id: request, p_workflow: expected })
})

it('preserves request identity after an uncertain save', async () => {
  rpc.mockResolvedValueOnce({ data: null, error: { code: 'FETCH_ERROR' } }).mockResolvedValueOnce({ data: response(), error: null })
  await expect(saveExamBlueprint(intent(), id, 0, request)).rejects.toThrow('could not be confirmed')
  await expect(saveExamBlueprint(intent(), id, 0, request)).resolves.toMatchObject({ id, version: 1 })
  expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1])
})

it.each([['PGRST202', 'unavailable'], ['42501', 'session'], ['40001', 'another session'], ['23505', 'different contents'], ['23514', 'invalid']])('reports %s without blindly retrying', async (code, message) => {
  rpc.mockResolvedValue({ data: null, error: { code } })
  await expect(saveExamBlueprint(intent(), id, 0, request)).rejects.toThrow(message)
  expect(rpc).toHaveBeenCalledTimes(1)
  rpc.mockResolvedValue({ data: null, error: { code } })
  await expect(saveExamBlueprint(intent(), id, 0, request)).rejects.toMatchObject({ confirmedRejected: true })
  expect(new BlueprintStorageError('Unconfirmed', false).confirmedRejected).toBe(false)
})

it('rejects invalid request identity and versions before an RPC', async () => {
  await expect(saveExamBlueprint(intent(), 'invalid', 0, request)).rejects.toThrow('identity')
  await expect(saveExamBlueprint(intent(), id, 1, request)).rejects.toThrow('version')
  expect(rpc).not.toHaveBeenCalled()
})

it('rejects divergent or malformed saved state', async () => {
  const altered = intent(); altered.generalInstruction = 'Unexpected'
  for (const data of [response(altered), { ...response(), version: 2 }, { ...response(), finalized: true }, { ...response(), savedAt: '' }]) {
    rpc.mockResolvedValue({ data, error: null })
    await expect(saveExamBlueprint(intent(), id, 0, request)).rejects.toThrow()
  }
})

it('reads a bounded owned configuration page with a keyset cursor', async () => {
  rpc.mockResolvedValue({ data: [response()], error: null })
  expect(await getExamBlueprints(owner, { id, savedAt: response().savedAt })).toEqual([{ id, version: 1, savedAt: response().savedAt, intent: intent() }])
  expect(rpc).toHaveBeenCalledExactlyOnceWith('get_exam_blueprints', { p_before: response().savedAt, p_before_id: id, p_limit: 25 })
})

it('rejects foreign, duplicate or oversized configuration lists', async () => {
  const foreign = intent(); foreign.blueprint.ownerId = id
  for (const data of [[response(foreign)], [response(), response()], Array.from({ length: 26 }, () => response())]) {
    rpc.mockResolvedValue({ data, error: null })
    await expect(getExamBlueprints(owner)).rejects.toThrow()
  }
})

it('reports an unavailable list as a load failure, not an unconfirmed save', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  rpc.mockResolvedValue({ data: null, error: { code: 'PGRST002' } })
  await expect(getExamBlueprints(owner)).rejects.toThrow(/^Saved blueprints could not be loaded\. Retry, or reopen My papers\. Reference: EG-/)
})
