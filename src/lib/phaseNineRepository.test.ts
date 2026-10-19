import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SOURCE_STRUCTURE, SETTINGS } from './fixtures/phaseNineSource'
import { parsePhaseNineTeacherIntent, PHASE_NINE_GENERAL_INSTRUCTION, PHASE_NINE_PROFILE_ID, selectPhaseNinePaper } from './phaseNineTeacherWorkflow'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('./supabase', () => ({ supabase: { rpc } }))
import { finalizePhaseNineExam, getPhaseNineWorkflows, savePhaseNineDraft } from './phaseNineRepository'

function payload() {
  const questions = SOURCE_STRUCTURE.branches.flatMap((b) => b.items.map((i) => i.question))
  return parsePhaseNineTeacherIntent({ schemaVersion: 2, profileId: PHASE_NINE_PROFILE_ID, rendererVersion: 1,
    ownerId: questions[0].ownerId, bankId: questions[0].bankId, settings: { ...SETTINGS, teacherName: 'Teacher', questionCount: 16 },
    filters: { lesson: '', difficulty: '' }, pageTarget: 2, generalInstruction: PHASE_NINE_GENERAL_INSTRUCTION,
    review: selectPhaseNinePaper(questions, SETTINGS.selectionSeed) })
}
function response(intent = payload(), finalized = false) {
  return { id: 'c23e4567-e89b-42d3-a456-426614174000', version: 1, finalized, savedAt: '2026-09-18T00:00:00Z', workflow: intent }
}
beforeEach(() => rpc.mockReset())

describe('Phase 9 persistence adapter (mocked RPC, not database proof)', () => {
  it('saves the complete copied payload in one RPC and verifies readback', async () => {
    const intent = payload(); const expected = structuredClone(intent)
    rpc.mockImplementation(async () => { intent.settings.teacherName = 'Caller edit'; return { data: response(expected), error: null } })
    const saved = await savePhaseNineDraft(intent, response().id, 0, 'request-1')
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('save_phase_nine_draft', { p_id: response().id, p_expected_version: 0, p_request_id: 'request-1', p_workflow: expected })
    expect(saved.intent.settings.teacherName).toBe('Teacher')
  })
  it('surfaces uncertain writes and reuses the caller request identity on retry', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'FETCH_ERROR' } }).mockResolvedValueOnce({ data: response(), error: null })
    const args = [payload(), response().id, 0, 'same-request'] as const
    await expect(savePhaseNineDraft(...args)).rejects.toThrow('could not be confirmed')
    await expect(savePhaseNineDraft(...args)).resolves.toMatchObject({ version: 1 })
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1])
  })
  it.each([['PT409', 'changed'], ['40001', 'changed'], ['42501', 'session'], ['23505', 'different contents'], ['PGRST202', 'not available']])('does not blindly retry database error %s', async (code, message) => {
    rpc.mockResolvedValue({ data: null, error: { code } })
    await expect(savePhaseNineDraft(payload(), response().id, 0, 'request')).rejects.toThrow(message)
    expect(rpc).toHaveBeenCalledTimes(1)
  })
  it('rejects divergent readback instead of rendering it', async () => {
    const changed = payload(); changed.settings.teacherName = 'Unexpected'
    rpc.mockResolvedValue({ data: response(changed), error: null })
    await expect(savePhaseNineDraft(payload(), response().id, 0, 'request')).rejects.toThrow('differs')
  })
  it('finalizes the saved expected version and trusts only matching final readback', async () => {
    rpc.mockResolvedValue({ data: response(payload(), true), error: null })
    const draft = { ...response(), savedAt: response().savedAt, intent: payload() }
    const saved = await finalizePhaseNineExam(draft, 'final-request')
    expect(rpc).toHaveBeenCalledWith('finalize_phase_nine_exam', expect.objectContaining({ p_draft_id: draft.id, p_expected_version: 1, p_request_id: 'final-request' }))
    expect(saved.finalized).toBe(true)
    rpc.mockClear()
    expect(await finalizePhaseNineExam(saved, 'ignored-new-request')).toEqual(saved)
    expect(rpc).not.toHaveBeenCalled()
  })
  it('reopens captured content without any current-bank request', async () => {
    rpc.mockResolvedValue({ data: [response(payload(), true)], error: null })
    expect((await getPhaseNineWorkflows())[0].intent).toEqual(payload())
    expect(rpc.mock.calls).toEqual([['get_phase_nine_workflows', {}]])
  })
  it('reports an untranslated list failure as a load problem with a reference, without provider text', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    rpc.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'relation "private.internal" does not exist', details: 'internal' } })
    const failure = await getPhaseNineWorkflows().then(() => null, (error: Error) => error)
    expect(failure?.message).toMatch(/^Saved structured exams could not be loaded\. Retry, or reopen My papers\. Reference: EG-[0-9a-f-]{36}$/)
    expect(JSON.stringify(log.mock.calls)).not.toContain('private.internal')
    log.mockRestore()
  })
  it('keeps translated access messages for list failures', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501' } })
    await expect(getPhaseNineWorkflows()).rejects.toThrow('Your session cannot access this exam. Sign in again and reopen your saved work.')
  })
})
