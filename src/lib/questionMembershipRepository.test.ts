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
  passageChildren: [] as string[],
}))

vi.mock('./supabase', () => ({
  supabase: {
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
          else if (table === 'question_group_questions') data = mocks.passageChildren
            .filter((id) => selectedIds.includes(id)).map((question_id) => ({ question_id })).slice(start,end+1)
          else {
            mocks.questionCalls += 1
            data = mocks.questions.filter((question) => selectedIds.includes(question.id))
          }
          resolve({ data, error: null })
        },
      }
      return query
    },
  },
}))

import { getActiveQuestionsForBanks, getQuestionsForBanks, getActiveStandaloneQuestionsForBanks } from './questionMembershipRepository'

beforeEach(() => {
  mocks.banks = [{ id: BANK_A, owner_id: OWNER }, { id: BANK_B, owner_id: OWNER }]
  mocks.memberships = []
  mocks.questions = []
  mocks.questionCalls = 0
  mocks.passageChildren = []
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
  })

  it('rejects missing banks and incomplete canonical readback', async () => {
    mocks.banks.pop()
    await expect(getQuestionsForBanks([BANK_A, BANK_B])).rejects.toThrow('missing, archived or inaccessible')
    mocks.banks.push({ id: BANK_B, owner_id: OWNER })
    mocks.memberships = [{ bank_id: BANK_A, question_id: questionId(1) }]
    await expect(getQuestionsForBanks([BANK_A])).rejects.toThrow('readback is incomplete')
  })
})
