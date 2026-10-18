import { randomUUID } from 'node:crypto'
import { expect, type Page } from '@playwright/test'

const owner = '10000000-0000-4000-8000-000000000001'
const bankId = '20000000-0000-4000-8000-000000000001'
const now = '2026-10-18T00:00:00Z'
const user = { id: owner, email: 'synthetic@example.invalid', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: now }
type Row = Record<string, unknown>

/** Network fixtures exercise the real browser UI; they do not prove database/RLS behavior. */
export async function syntheticBackend(page: Page) {
  const tables: Record<string, Row[]> = {
    question_banks: [{ id: bankId, owner_id: owner, name: 'Browser synthetic bank', grade: 6, subject: 'English', curriculum: 'Iraqi mainstream', is_archived: false, created_at: now, updated_at: now }],
    questions: [1, 2].map(n => ({ id: `30000000-0000-4000-8000-00000000000${n}`, owner_id: owner, bank_id: bankId,
      external_id: `E2E-${n}`, unit: 1, lesson: '1', question_type: 'short-answer', difficulty: 'easy', prompt: `Synthetic question ${n}?`,
      marks: 1, schema_version: 1, current_revision: 1, is_active: true, options: [], correct_option_label: null,
      content: { type: 'short-answer', schemaVersion: 1, answerLines: 2 },
      answer: { type: 'short-answer', schemaVersion: 1, canonicalAnswer: `KEY_ONLY_${n}`, approvedVariants: [], caseSensitive: false }, created_at: now, updated_at: now })),
    exam_drafts: [], exam_draft_questions: [], question_group_questions: [], question_groups: [], catalogue_imports: [], catalogue_import_rows: [],
  }
  const state = { tables, failDraftSave: false, failBlueprintSave: false, failSignOut: false, expireRefresh: false, currentUser: user, stagedRequests: [] as Row[], blueprintRequests: [] as Row[], unhandled: [] as string[] }
  await page.route(/^https:\/\/[^/]+\/(?:auth|rest)\/v1\//, async route => {
    const request = route.request(), url = new URL(request.url())
    const respond = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (url.pathname === '/auth/v1/user') return respond(state.currentUser)
    if (url.pathname === '/auth/v1/token') {
      if (state.expireRefresh && url.searchParams.get('grant_type') === 'refresh_token') {
        return respond({ code: 'refresh_token_not_found', message: 'Synthetic session expired' }, 400)
      }
      const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
      const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: state.currentUser.id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 7200 })}.synthetic-signature`
      return respond({ access_token: token, refresh_token: 'synthetic-refresh-not-a-real-session', token_type: 'bearer', expires_in: 7200, user: state.currentUser })
    }
    if (url.pathname === '/auth/v1/logout') return state.failSignOut ? route.abort('failed') : respond({})
    if (url.pathname === '/rest/v1/rpc/save_exam_blueprint') {
      const payload = request.postDataJSON()
      state.blueprintRequests.push(payload)
      if (state.failBlueprintSave) return respond({ code: 'XX000', message: 'synthetic-private-blueprint-detail' }, 500)
      return respond({ id: payload.p_id, version: payload.p_workflow.blueprint.version, savedAt: now, finalized: false, workflow: payload.p_workflow })
    }
    if (url.pathname === '/rest/v1/rpc/stage_catalogue_import_batch') {
      state.stagedRequests.push(request.postDataJSON())
      return respond({ code: 'XX000', message: 'synthetic-private-import-detail' }, 500)
    }
    if (url.pathname === '/rest/v1/rpc/get_preset_curation') return respond({ code: '42501', message: 'synthetic-private-reviewer-detail' }, 403)
    const table = url.pathname.split('/rest/v1/')[1]
    if (!table || !(table in tables) && table !== 'question_bank_memberships') {
      state.unhandled.push(url.pathname)
      return respond({ code: 'MOCK_UNHANDLED', message: 'Unexpected synthetic endpoint' }, 500)
    }
    if (table === 'exam_drafts' && request.method() === 'POST' && state.failDraftSave) {
      return respond({ code: 'XX000', message: 'internal_relation_secret', details: 'private database detail' }, 500)
    }
    if (request.method() === 'POST') {
      const payload: Row | Row[] = request.postDataJSON()
      if (table === 'catalogue_imports' && !Array.isArray(payload) && tables.catalogue_imports.some(row => row.source_namespace === payload.source_namespace && row.source_sha256 === payload.source_sha256)) {
        return respond({ code: '23505', message: 'Synthetic duplicate import' }, 409)
      }
      const rows = (Array.isArray(payload) ? payload : [payload]).map(row => ({ ...row, id: randomUUID(), owner_id: owner, created_at: now, updated_at: now }))
      tables[table].push(...rows)
      return respond(request.headers().accept?.includes('vnd.pgrst.object') ? rows[0] : rows, 201)
    }
    let rows = table === 'question_bank_memberships'
      ? tables.questions.map(q => ({ bank_id: q.bank_id, question_id: q.id })) : tables[table]
    for (const [field, filter] of url.searchParams) {
      if (filter.startsWith('eq.')) rows = rows.filter(row => String(row[field]) === filter.slice(3))
      if (filter.startsWith('in.(')) {
        const values = filter.slice(4, -1).split(',').map(v => v.replaceAll('"', ''))
        rows = rows.filter(row => values.includes(String(row[field])))
      }
    }
    return respond(request.headers().accept?.includes('vnd.pgrst.object') ? rows[0] ?? null : rows)
  })
  return state
}

export async function syntheticSignIn(page: Page, navigate = true, email = user.email) {
  if (navigate) await page.goto('/')
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email)
  await page.getByLabel('Password', { exact: false }).fill('Synthetic-password-123')
  await page.getByRole('button', { name: 'Sign in', exact: true }).last().click()
  await expect(page.getByRole('heading', { name: 'Build exam', exact: true })).toBeVisible()
  await expect(page.getByRole('spinbutton', { name: /Short open answer 2 available/ })).toBeEnabled()
}
