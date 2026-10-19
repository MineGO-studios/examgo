import { beforeEach, describe, expect, it, vi } from 'vitest'

const OWNER = '11111111-1111-4111-8111-111111111111'
const BANK_A = '22222222-2222-4222-8222-222222222222'
const BANK_B = '33333333-3333-4333-8333-333333333333'
const questionId = (number: number) => `44444444-4444-4444-8444-${number.toString().padStart(12, '0')}`

const mocks = vi.hoisted(() => ({
  banks: [] as Array<{ id: string; owner_id: string }>,
  memberships: [] as Array<{ bank_id: string; question_id: string }>,
  questions: [] as Array<{ id: string; owner_id: string; is_active: boolean }>,
  questionCalls: 0,
  inFlight: 0,
  maxInFlight: 0,
  groupCalls: 0,
  groupInFlight: 0,
  maxGroupInFlight: 0,
  passageChildren: [] as string[],
  rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  rpcResult: { data: null, error: { code: 'PGRST202' } } as { data: unknown; error: { code: string } | null },
}))

vi.mock('./supabase', () => ({
  supabase: {
    rpc(name: string, args: Record<string, unknown>) {
      mocks.rpcCalls.push({ name, args })
      return { abortSignal: (signal: AbortSignal) => { expect(signal).toBeInstanceOf(AbortSignal); return Promise.resolve(mocks.rpcResult) } }
    },
    from(table: string) {
      let selectedIds: string[] = []
      let selectedBankIds: string[] = []
      let start = 0
      let end = 999
      const query = {
        select() { return query },
        in(column: string, ids: string[]) {
          if (column === 'id') selectedIds = ids
          if (column === 'question_id') selectedIds = ids
          if (column === 'bank_id') selectedBankIds = ids
          return query
        },
        eq() { return query },
        order() { return query },
        abortSignal(signal: AbortSignal) { expect(signal).toBeInstanceOf(AbortSignal); return query },
        range(first: number, last: number) { start = first; end = last; return query },
        then(resolve: (result: { data: unknown; error: null }) => void) {
          let data: unknown
          if (table === 'question_banks') data = mocks.banks.filter((bank) => selectedIds.includes(bank.id))
          else if (table === 'question_bank_memberships') data = mocks.memberships
            .filter((membership) => selectedBankIds.includes(membership.bank_id)).slice(start, end + 1)
          else if (table === 'question_group_questions') {
            mocks.groupCalls += 1
            mocks.groupInFlight += 1
            mocks.maxGroupInFlight = Math.max(mocks.maxGroupInFlight, mocks.groupInFlight)
            data = mocks.passageChildren
              .filter((id) => selectedIds.includes(id)).map((question_id) => ({ question_id })).slice(start,end+1)
            setTimeout(() => { mocks.groupInFlight -= 1; resolve({ data, error: null }) }, 1)
            return
          }
          else {
            mocks.questionCalls += 1
            mocks.inFlight += 1
            mocks.maxInFlight = Math.max(mocks.maxInFlight, mocks.inFlight)
            data = mocks.questions.filter((question) => selectedIds.includes(question.id))
            setTimeout(() => { mocks.inFlight -= 1; resolve({ data, error: null }) }, 1)
            return
          }
          resolve({ data, error: null })
        },
      }
      return query
    },
  },
}))

import { getActiveQuestionsForBanks, getQuestionsForBanks, getActiveStandaloneQuestionsForBanks, getStandaloneQuestionsForBanks } from './questionMembershipRepository'

beforeEach(() => {
  mocks.banks = [{ id: BANK_A, owner_id: OWNER }, { id: BANK_B, owner_id: OWNER }]
  mocks.memberships = []
  mocks.questions = []
  mocks.questionCalls = 0
  mocks.inFlight = 0
  mocks.maxInFlight = 0
  mocks.groupCalls = 0
  mocks.groupInFlight = 0
  mocks.maxGroupInFlight = 0
  mocks.passageChildren = []
  mocks.rpcCalls = []
  mocks.rpcResult = { data: null, error: { code: 'PGRST202' } }
})

describe('membership based question pool', () => {
  it('keeps passage children available to authoring but excludes them from standalone selection', async () => {
    mocks.memberships=[1,2].map((n)=>({bank_id:BANK_A,question_id:questionId(n)}))
    mocks.questions=[1,2].map((n)=>({id:questionId(n),owner_id:OWNER,is_active:true}))
    mocks.passageChildren=[questionId(1)]
    expect((await getQuestionsForBanks([BANK_A])).map((q)=>q.id)).toEqual([questionId(1),questionId(2)])
    expect((await getActiveStandaloneQuestionsForBanks([BANK_A])).map((q)=>q.id)).toEqual([questionId(2)])
  })
  it('deduplicates canonical IDs across banks and reads beyond the API page limit', async () => {
    const ids = Array.from({ length: 1001 }, (_, index) => questionId(index + 1))
    mocks.memberships = ids.map((id) => ({ bank_id: BANK_A, question_id: id }))
    mocks.memberships.push({ bank_id: BANK_B, question_id: ids[0] })
    mocks.questions = ids.map((id) => ({ id, owner_id: OWNER, is_active: true }))
    mocks.questions[0].is_active = false

    const all = await getQuestionsForBanks([BANK_A, BANK_B])
    const active = await getActiveQuestionsForBanks([BANK_A, BANK_B])
    expect(all).toHaveLength(1001)
    expect(new Set(all.map((question) => question.id)).size).toBe(1001)
    expect(active).toHaveLength(1000)
    expect(mocks.questionCalls).toBe(42)
    expect(all.map((question) => question.id)).toEqual([...ids].sort())
  })

  it('reads question batches a few at a time and keeps canonical order', async () => {
    const ids = Array.from({ length: 1605 }, (_, index) => questionId(1605 - index))
    mocks.memberships = ids.map((id) => ({ bank_id: BANK_A, question_id: id }))
    mocks.questions = ids.map((id) => ({ id, owner_id: OWNER, is_active: true }))

    const all = await getQuestionsForBanks([BANK_A])
    expect(all.map((question) => question.id)).toEqual([...ids].sort())
    expect(mocks.questionCalls).toBe(33)
    expect(mocks.maxInFlight).toBeGreaterThan(1)
    expect(mocks.maxInFlight).toBeLessThanOrEqual(6)
  })

  it('checks passage membership a few batches at a time and still excludes every passage child', async () => {
    const ids = Array.from({ length: 1605 }, (_, index) => questionId(index + 1))
    mocks.memberships = ids.map((id) => ({ bank_id: BANK_A, question_id: id }))
    mocks.questions = ids.map((id) => ({ id, owner_id: OWNER, is_active: true }))
    mocks.passageChildren = [ids[0], ids[799], ids[1604]]

    const standalone = await getActiveStandaloneQuestionsForBanks([BANK_A])
    expect(standalone).toHaveLength(1602)
    expect(standalone.map((question) => question.id)).not.toContain(ids[799])
    expect(mocks.groupCalls).toBe(33)
    expect(mocks.maxGroupInFlight).toBeGreaterThan(1)
    expect(mocks.maxGroupInFlight).toBeLessThanOrEqual(6)
  })

  it('rejects missing banks and incomplete canonical readback', async () => {
    mocks.banks.pop()
    await expect(getQuestionsForBanks([BANK_A, BANK_B])).rejects.toThrow('missing, archived or inaccessible')
    mocks.banks.push({ id: BANK_B, owner_id: OWNER })
    mocks.memberships = [{ bank_id: BANK_A, question_id: questionId(1) }]
    await expect(getQuestionsForBanks([BANK_A])).rejects.toThrow('readback is incomplete')
  })

  it('loads the whole pool in one database call when the function is installed', async () => {
    const ids = [3, 1, 2].map(questionId)
    mocks.rpcResult = { data: ids.map((id) => ({ id, owner_id: OWNER, is_active: true })), error: null }

    const pool = await getActiveStandaloneQuestionsForBanks([BANK_B.toUpperCase(), BANK_A, BANK_A])
    expect(pool.map((question) => question.id)).toEqual([questionId(1), questionId(2), questionId(3)])
    expect(mocks.rpcCalls).toEqual([{ name: 'get_bank_question_pool',
      args: { p_bank_ids: [BANK_B, BANK_A], p_active_only: true, p_standalone_only: true } }])
    expect(mocks.questionCalls).toBe(0)
    expect(mocks.groupCalls).toBe(0)
  })

  it('passes the right filters for each loader', async () => {
    mocks.rpcResult = { data: [], error: null }
    await getQuestionsForBanks([BANK_A])
    await getActiveQuestionsForBanks([BANK_A])
    await getStandaloneQuestionsForBanks([BANK_A])
    expect(mocks.rpcCalls.map(({ args }) => [args.p_active_only, args.p_standalone_only])).toEqual([[false, false], [true, false], [false, true]])
  })

  it('rejects an inconsistent pool and maps database refusals to teacher messages', async () => {
    mocks.rpcResult = { data: [{ id: questionId(1), owner_id: OWNER, is_active: true }, { id: questionId(2), owner_id: BANK_B, is_active: true }], error: null }
    await expect(getQuestionsForBanks([BANK_A])).rejects.toThrow('readback is inconsistent')
    mocks.rpcResult = { data: null, error: { code: '42501' } }
    await expect(getQuestionsForBanks([BANK_A])).rejects.toThrow('missing, archived or inaccessible')
    mocks.rpcResult = { data: null, error: { code: 'XX000' } }
    await expect(getQuestionsForBanks([BANK_A])).rejects.toThrow('Unable to load the selected question banks')
    expect(mocks.questionCalls).toBe(0)
  })
})
