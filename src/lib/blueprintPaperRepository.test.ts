import { beforeEach, expect, it, vi } from 'vitest'
import { makeBlueprintPaperFixture } from './fixtures/blueprintPaper'
import { createBlueprintPaperIntent } from './examBlueprintPaper'
import { finalizeBlueprintPaper, getBlueprintPapers } from './blueprintPaperRepository'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('./supabase', () => ({ supabase: { rpc } }))
const id = '33333333-3333-4333-8333-333333333333', request = '44444444-4444-4444-8444-444444444444'
const timestamp = '2026-10-17T12:00:00.000Z'
function fixture() {
  const { intent, review } = makeBlueprintPaperFixture()
  return { blueprint: { id, version: 1, savedAt: timestamp, intent }, paper: createBlueprintPaperIntent(intent, review, 'unchanged-two-page') }
}
beforeEach(() => rpc.mockReset())

it('finalizes the exact saved version and retains identical request contents after an uncertain result', async () => {
  const { blueprint, paper } = fixture(), response = { id, version: 1, finalized: true, savedAt: timestamp, workflow: paper }
  rpc.mockResolvedValueOnce({ data: null, error: { code: 'FETCH_ERROR' } }).mockResolvedValueOnce({ data: response, error: null })
  await expect(finalizeBlueprintPaper(blueprint, paper, request)).rejects.toMatchObject({ confirmedRejected: false })
  await expect(finalizeBlueprintPaper(blueprint, paper, request)).resolves.toEqual({ id, savedAt: timestamp, intent: paper })
  expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1])
  expect(rpc.mock.calls[0]).toEqual(['finalize_blueprint_paper', { p_request_id: request, p_draft_id: id, p_expected_version: 1, p_workflow: paper }])
})

it('rejects unsaved intent before writing and divergent finalization readback without treating it as confirmed', async () => {
  const { blueprint, paper } = fixture()
  paper.intent.settings.examTitle += ' unsaved'
  await expect(finalizeBlueprintPaper(blueprint, paper, request)).rejects.toThrow('exact reviewed')
  expect(rpc).not.toHaveBeenCalled()
  paper.intent.settings.examTitle = blueprint.intent.settings.examTitle
  const changed = structuredClone(paper); changed.intent.generalInstruction += ' Changed'
  rpc.mockResolvedValue({ data: { id, version: 1, finalized: true, savedAt: timestamp, workflow: changed }, error: null })
  await expect(finalizeBlueprintPaper(blueprint, paper, request)).rejects.toMatchObject({ confirmedRejected: false })
})

it.each(['42501', '40001', '23505', '23514', 'PGRST202'])('reports %s as a confirmed rejection without automatic retry', async code => {
  const { blueprint, paper } = fixture()
  rpc.mockResolvedValue({ data: null, error: { code } })
  await expect(finalizeBlueprintPaper(blueprint, paper, request)).rejects.toMatchObject({ confirmedRejected: true })
  expect(rpc).toHaveBeenCalledTimes(1)
})

it('reads bounded immutable pages and refuses foreign, duplicate, oversized or editable responses', async () => {
  const { blueprint, paper } = fixture(), response = { id, version: 1, finalized: true, savedAt: timestamp, workflow: paper }
  rpc.mockResolvedValue({ data: [response], error: null })
  await expect(getBlueprintPapers(blueprint.intent.blueprint.ownerId, { id, savedAt: timestamp })).resolves.toEqual([{ id, savedAt: timestamp, intent: paper }])
  expect(rpc).toHaveBeenLastCalledWith('get_blueprint_papers', { p_before: timestamp, p_before_id: id, p_limit: 25 })
  for (const rows of [[response, response], Array(26).fill(response), [{ ...response, finalized: false }]]) {
    rpc.mockResolvedValue({ data: rows, error: null })
    await expect(getBlueprintPapers(blueprint.intent.blueprint.ownerId)).rejects.toThrow()
  }
  rpc.mockResolvedValue({ data: [response], error: null })
  await expect(getBlueprintPapers(id)).rejects.toThrow('inaccessible')
})
