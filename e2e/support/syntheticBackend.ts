import { randomUUID } from 'node:crypto'
import { expect, type Page } from '@playwright/test'

const owner = '10000000-0000-4000-8000-000000000001'
const bankId = '20000000-0000-4000-8000-000000000001'
const now = '2026-10-18T00:00:00Z'
const user = { id: owner, email: 'synthetic@example.invalid', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: now }
type Row = Record<string, unknown>

const provenance = { schemaVersion: 2, sourceReference: 'Synthetic public reference', corpusScope: '', ministerialOccurrences: null, missingEvidence: [] }
const presetMember = <Q extends Row>(n: number, question: Q & { prompt: string }) => ({ revisionId: `40000000-0000-4000-8000-00000000000${n}`, curationId: `50000000-0000-4000-8000-00000000000${n}`,
  reviewVersion: 1, revision: 1, reviewer: 'Synthetic reviewer', approvedAt: now, publisher: 'Synthetic publisher', publishedAt: now, provenance,
  question: { id: `60000000-0000-4000-8000-00000000000${n}`, unit: 1, lesson: '1', difficulty: 'easy', marks: 1, ...question } })
/** One published exercise in source order; only two of three displayed points are attempted. */
export const presetGroup = { id: '70000000-0000-4000-8000-000000000001', revision: 1, instruction: 'Answer two of the following questions.', attemptCount: 2,
  members: [
    presetMember(1, { type: 'multiple-choice', prompt: 'Synthetic group choice?', options: [{ label: 'A', text: 'Choice one' }, { label: 'B', text: 'Choice two' }],
      correctAnswer: { label: 'B', text: 'Choice two' } }),
    presetMember(2, { type: 'binary', prompt: 'Synthetic group statement.', labelMode: 'true-false', isTrue: false }),
    presetMember(3, { type: 'short-answer', prompt: 'Synthetic group short answer?', answerLines: 1, canonicalAnswer: 'KEY_ONLY_GROUP', approvedVariants: [], caseSensitive: false }),
  ] }

/** A large reviewed bank served one searched page at a time, like get_preset_curation_view. */
const curationId = (n: number) => `80000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const curationRevision = (n: number) => `90000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const curationTargets = Array.from({ length: 1605 }, (_, i) => ({ revisionId: curationRevision(i + 1), bankId, questionId: curationRevision(i + 1),
  externalId: `MY-${String(i + 1).padStart(4, '0')}`, revision: 1, unit: 1, lesson: '1', prompt: i % 50 === 0 ? `Synthetic apple question ${i + 1}?` : `Synthetic question ${i + 1}?`,
  content: { type: 'short-answer', schemaVersion: 1, answerLines: 1 }, answer: { type: 'short-answer', schemaVersion: 1, canonicalAnswer: 'KEY' }, ideaKey: null }))
const curationRecord = (n: number) => ({ id: curationId(n), bankId, revisionId: n ? curationRevision(n) : null, version: 1, state: 'draft', provenance,
  reviewer: null, approvedAt: null, privateNotes: '', unit: n ? 1 : null, lesson: n ? '1' : null, prompt: n ? curationTargets[n - 1].prompt : null,
  currentRevision: n ? 1 : null, sourceRevision: n ? 1 : null, published: false, publication: null, history: [] })
function curationView(payload: Row) {
  const needle = String(payload.p_search ?? '').toLowerCase(), selected = payload.p_revision_id as string | null
  const records = Array.from({ length: 1606 }, (_, n) => curationRecord(n))
    .filter(record => `${record.prompt ?? 'Bank'} ${record.provenance.sourceReference}`.toLowerCase().includes(needle))
  const targets = curationTargets.filter(target => `${target.externalId} ${target.prompt}`.toLowerCase().includes(needle))
  const index = curationTargets.findIndex(target => target.revisionId === selected)
  return { reviewer: 'Synthetic reviewer', recordCount: records.length, records: records.slice(0, Number(payload.p_record_limit)),
    bankRecord: curationRecord(0), selectedRecord: index < 0 ? null : curationRecord(index + 1),
    targetCount: targets.length, targets: targets.slice(0, Number(payload.p_target_limit)), selectedTarget: index < 0 ? null : curationTargets[index] }
}

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
  const state = { tables, curationReviewer: false, curationRequests: [] as Row[], failDraftSave: false, failBlueprintSave: false, failSignOut: false, signOutScopes: [] as string[], poolRequests: [] as Row[], poolMissing: false, expireRefresh: false, currentUser: user, stagedRequests: [] as Row[], blueprintRequests: [] as Row[], unhandled: [] as string[],
    // Lose the next finalization response after the synthetic server has committed it.
    dropGroupFinalizeResponse: false, groupFinalizeRequests: [] as Row[], groupPapers: new Map<string, Row>() }
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
    if (url.pathname === '/auth/v1/logout') {
      state.signOutScopes.push(url.searchParams.get('scope') ?? 'global')
      return state.failSignOut ? route.abort('failed') : respond({})
    }
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
    if (url.pathname === '/rest/v1/rpc/get_preset_curation_view' && state.curationReviewer) {
      const payload = request.postDataJSON()
      state.curationRequests.push(payload)
      return respond(curationView(payload))
    }
    if (['/rest/v1/rpc/get_preset_curation', '/rest/v1/rpc/get_preset_curation_view'].includes(url.pathname)) return respond({ code: '42501', message: 'synthetic-private-reviewer-detail' }, 403)
    if (['/rest/v1/rpc/get_grade_six_preset_coverage', '/rest/v1/rpc/get_reviewed_preset_exercises'].includes(url.pathname)) {
      return respond({ code: 'XX000', message: 'synthetic-private-coverage-detail' }, 503)
    }
    if (['/rest/v1/rpc/get_preset_banks', '/rest/v1/rpc/get_preset_bank_questions'].includes(url.pathname)) return respond([])
    if (['/rest/v1/rpc/get_eligible_simple_presets', '/rest/v1/rpc/get_simple_preset_exams'].includes(url.pathname)) return respond([])
    if (url.pathname === '/rest/v1/rpc/get_eligible_simple_preset_groups') return respond(request.postDataJSON().p_after ? [] : [presetGroup])
    if (url.pathname === '/rest/v1/rpc/get_simple_preset_group_exams') return respond([...state.groupPapers.values()])
    if (url.pathname === '/rest/v1/rpc/finalize_simple_preset_group') {
      const payload = request.postDataJSON()
      state.groupFinalizeRequests.push(payload)
      // Same request identity returns the already-sealed paper, as the database RPC does.
      if (!state.groupPapers.has(payload.p_request_id)) {
        const marks = payload.p_marks
        state.groupPapers.set(payload.p_request_id, { id: randomUUID(), ownerId: owner, sealed: true, savedAt: now, settings: payload.p_settings,
          group: { ...presetGroup, members: presetGroup.members.map(m => ({ ...m, question: { ...m.question, marks } })) }, totalMarks: marks * presetGroup.attemptCount })
      }
      if (state.dropGroupFinalizeResponse) { state.dropGroupFinalizeResponse = false; return route.abort('connectionreset') }
      return respond(state.groupPapers.get(payload.p_request_id))
    }
    // Saved-work lists for My papers; empty unless a test seeds them.
    if (['/rest/v1/rpc/get_phase_nine_workflows', '/rest/v1/rpc/get_phase_ten_candidate_workflows', '/rest/v1/rpc/get_exam_blueprints', '/rest/v1/rpc/get_blueprint_papers'].includes(url.pathname)) return respond([])
    if (url.pathname === '/rest/v1/rpc/get_bank_question_pool') {
      const payload = request.postDataJSON()
      state.poolRequests.push(payload)
      // Emulates the database before the function is installed: callers fall back to batched reads.
      if (state.poolMissing) return respond({ code: 'PGRST202', message: 'Could not find the function' }, 404)
      const passageChildren = new Set(tables.question_group_questions
        .filter(member => tables.question_groups.some(group => group.id === member.group_id && group.group_type === 'passage'))
        .map(member => member.question_id))
      const pool = tables.questions.filter(q => payload.p_bank_ids.includes(q.bank_id) &&
        (!payload.p_active_only || q.is_active) && (!payload.p_standalone_only || !passageChildren.has(q.id)))
      return respond([...pool].sort((a, b) => String(a.id).localeCompare(String(b.id))))
    }
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

/** `expectBuilder` is false for a fresh account with no personal banks, whose builder has no question supply. */
export async function syntheticSignIn(page: Page, navigate = true, email = user.email, expectBuilder = true) {
  if (navigate) await page.goto('/')
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email)
  await page.getByLabel('Password', { exact: false }).fill('Synthetic-password-123')
  await page.getByRole('button', { name: 'Sign in', exact: true }).last().click()
  if (expectBuilder) {
    await expect(page.getByRole('heading', { name: 'New paper', exact: true })).toBeVisible()
    await expect(page.getByRole('spinbutton', { name: /Short answer 2 available/ })).toBeEnabled()
  } else {
    // An account without banks is moved to Question banks as soon as its empty bank list loads, so New paper
    // may never be visible; wait for the signed-in workspace instead.
    await expect(page.getByRole('navigation', { name: 'Teacher workspace' })).toBeVisible()
  }
}
