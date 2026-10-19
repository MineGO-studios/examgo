// Isolated PostgreSQL rehearsal of the preset intake candidates read (MIN-49 follow-up, 19 October 2026).
// No application credentials or remote database access.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { Client } from 'pg'
import net from 'node:net'
import path from 'node:path'

process.on('uncaughtExceptionMonitor', error => {
  if (process.env.GITHUB_ACTIONS === 'true') console.error('::error title=Disposable database verifier::' +
    String(error.stderr || error.message).slice(0, 1200).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A'))
})

const root = process.cwd()
const runtime = path.join(root, 'integration-c-baseline.local/pg-runtime')
const bin = process.env.EXAMGO_TEST_PG_BIN ?? path.join(runtime, 'node_modules/@embedded-postgres/windows-x64/native/bin')
const binary = name => path.join(bin, name + (process.platform === 'win32' ? '.exe' : ''))
const runDir = path.join(root, 'integration-c-baseline.local', `intake-candidates-${Date.now()}`)
const data = path.join(runDir, 'data')
await mkdir(runDir, { recursive: true })
const password = randomBytes(32).toString('hex')
const pwfile = path.join(runDir, 'password.local')
await writeFile(pwfile, password)
const port = await new Promise((resolve, reject) => {
  const server = net.createServer().on('error', reject)
  server.listen(0, '127.0.0.1', () => { const assigned = server.address().port; server.close(() => resolve(assigned)) })
})
const migrationName = '20261019140000_preset_intake_candidates.sql'
const migrationPath = ['supabase/migrations', 'supabase/pending'].map((dir) => path.join(dir, migrationName)).find((file) => existsSync(file))
const migration = await readFile(migrationPath, 'utf8')
const rollback = await readFile(path.join('supabase/rollback', migrationName), 'utf8')
const clients = []
let started = false
let checks = 0
function pass(label) { checks++; console.log(`PASS ${label}`) }
async function connect(owner, role) {
  const client = new Client({ host: '127.0.0.1', port, user: 'postgres', password, database: 'postgres', statement_timeout: 15000 })
  await client.connect(); clients.push(client)
  if (role) await client.query(`set role ${role}`)
  if (owner) await client.query("select set_config('request.jwt.claim.sub',$1,false)", [owner])
  return client
}
async function rejects(action, code) {
  try { await action() } catch (error) { assert.equal(error.code, code, error.message); return error }
  throw new Error(`Expected SQLSTATE ${code}`)
}
const mc = { type: 'multiple-choice', schemaVersion: 1, options: [{ label: 'A', text: 'Yes' }, { label: 'B', text: 'No' }] }
const mcAnswer = { type: 'multiple-choice', schemaVersion: 1, correctOptionLabel: 'A' }
const provenance = (sourceReference) => ({ schemaVersion: 2, sourceReference, corpusScope: 'Synthetic corpus',
  ministerialOccurrences: 1, missingEvidence: [] })

try {
  const options = { windowsHide: true, encoding: 'utf8', timeout: 60000 }
  execFileSync(binary('initdb'), ['-D', data, '-U', 'postgres', '-A', 'scram-sha-256', '--pwfile', pwfile, '--encoding=UTF8', '--locale=C'], options)
  // Clients use loopback TCP; see verify-phase15-owner-quotas-local-db.mjs.
  const socketOptions = process.platform === 'win32' ? '' : " -k ''"
  try {
    execFileSync(binary('pg_ctl'), ['-D', data, '-l', path.join(runDir, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}${socketOptions}`, '-w', 'start'], { ...options, stdio: 'ignore' })
  } catch (error) {
    const log = await readFile(path.join(runDir, 'postgres.log'), 'utf8').catch(() => '')
    const fatal = log.split('\n').filter(line => /FATAL|PANIC|ERROR/.test(line)).slice(-3).join('; ')
    throw new Error('Disposable PostgreSQL startup failed: ' + (fatal || 'inspect the local postgres.log'), { cause: error })
  }
  started = true
  const admin = await connect()
  await admin.query(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon,authenticated,service_role;
    grant execute on function auth.uid() to anon,authenticated,service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;`)
  const files = (await readdir('supabase/migrations')).filter((name) => name.endsWith('.sql') && name < migrationName).sort()
  for (const file of files) await admin.query(await readFile(path.join('supabase/migrations', file), 'utf8'))
  pass(`all ${files.length} earlier migrations compile in a fresh database`)

  await admin.query(migration)
  const fns = (await admin.query(`select p.oid::regprocedure::text sig, p.prosecdef, p.proconfig,
      has_function_privilege('anon', p.oid, 'execute') anon, has_function_privilege('authenticated', p.oid, 'execute') auth
    from pg_proc p where p.proname = 'get_preset_intake_candidates' order by 1`)).rows
  assert.equal(fns.length, 2)
  for (const fn of fns) {
    assert.deepEqual([fn.proconfig, fn.anon, fn.auth, fn.prosecdef], [['search_path=""'], false, true, fn.sig.startsWith('private.')], fn.sig)
  }
  pass('public wrapper is invoker, private function definer; fixed search path; anon denied')

  // Synthetic data: a reviewer-owner with a 60-question bank and governed records, a non-reviewer owner, a foreign owner.
  const [owner, plain, foreign] = [randomUUID(), randomUUID(), randomUUID()]
  await admin.query('insert into auth.users(id) values($1),($2),($3)', [owner, plain, foreign])
  await admin.query("insert into private.preset_reviewers(user_id, display_name) values($1, 'Synthetic Reviewer')", [owner])
  const [bank, plainBank, foreignBank] = [randomUUID(), randomUUID(), randomUUID()]
  await admin.query(`insert into public.question_banks(id,owner_id,name,grade) values ($1,$4,'Big',6),($2,$5,'Plain',6),($3,$6,'Foreign',6)`,
    [bank, plainBank, foreignBank, owner, plain, foreign])
  const revisionIds = []
  for (let n = 1; n <= 60; n++) {
    const id = (await admin.query(`insert into public.questions(owner_id,bank_id,external_id,unit,lesson,question_type,difficulty,prompt,marks,content,answer,options,correct_option_label)
      values($1,$2,$3,1,'L1','multiple-choice','easy',$4,1,$5,$6,$7,'A') returning id`,
    [owner, bank, `Q${String(n).padStart(3, '0')}`, n % 7 === 0 ? `Apple question ${n}?` : `Question ${n}?`, mc, mcAnswer, JSON.stringify(mc.options)])).rows[0].id
    revisionIds.push((await admin.query('select id from public.question_revisions where question_id=$1 and revision=1', [id])).rows[0].id)
  }
  const curation = async (revisionId, reference, notes, state = 'draft') => {
    const id = randomUUID()
    await admin.query(`insert into public.preset_curation(id,owner_id,bank_id,question_revision_id,state,provenance,private_source_notes)
      values($1,$2,$3,$4,$5,$6,$7)`, [id, owner, bank, revisionId, state, provenance(reference), notes])
    await admin.query(`insert into public.preset_curation_history(curation_id,version,actor_id,actor_name,state,provenance,private_source_notes,reason)
      values($1,1,$2,'Synthetic Reviewer',$3,$4,$5,'Synthetic intake')`, [id, owner, state, provenance(reference), notes])
    return id
  }
  const bankRecord = await curation(null, 'Bank level source', 'bank notes')
  const recordIds = []
  for (let n = 0; n < 40; n++) recordIds.push(await curation(revisionIds[n], n % 5 === 0 ? `Ministry booklet ${n}` : `Workbook ${n}`, `notes ${n}`))
  await admin.query(`insert into public.preset_publications(curation_id,review_version,public_provenance,source_groups,publisher_id,publisher_name,reason)
    values($1,1,$2,'[]',$3,'Synthetic Reviewer','Synthetic publication')`, [recordIds[3], provenance('Workbook 3'), owner])
  await admin.query('update public.questions set is_active=false where id=(select question_id from public.question_revisions where id=$1)', [revisionIds[59]])
  pass('synthetic fixtures: 60 questions, bank record, 40 question records with history, one publication, one inactive question')

  const reviewer = await connect(owner, 'authenticated'), other = await connect(plain, 'authenticated')
  const outsider = await connect(foreign, 'authenticated'), signedOut = await connect(null, 'authenticated'), anon = await connect(null, 'anon')
  const questionIds = (await admin.query('select question_id id from public.question_revisions where id = any($1) order by id', [revisionIds])).rows.map(r => r.id)
  const legacy = (await reviewer.query('select public.get_preset_curation($1) d', [bank])).rows[0].d
  // Exactly what prepareCataloguePresetProvenance derives from the legacy readback.
  const expected = (ids) => legacy.targets.filter(t => ids.includes(t.questionId)).map(t => {
    const existing = legacy.records.find(r => r.revisionId === t.revisionId)
    return { revisionId: t.revisionId, questionId: t.questionId, externalId: t.externalId, revision: t.revision,
      record: existing ? { id: existing.id, provenance: existing.provenance, privateNotes: existing.privateNotes } : null }
  })
  const intake = async (client, ids, bankId = bank) => (await client.query('select public.get_preset_intake_candidates($1,$2) d', [bankId, ids])).rows[0].d
  const all = await intake(reviewer, questionIds)
  assert.equal(all.reviewer, 'Synthetic Reviewer')
  assert.equal(all.candidates.length, 59)
  assert.deepEqual(all.candidates, expected(questionIds))
  assert.equal(all.candidates.filter(c => c.record).length, 40)
  const inactive = (await admin.query('select question_id id from public.question_revisions where id=$1', [revisionIds[59]])).rows[0].id
  const some = [questionIds[3], questionIds[45], randomUUID(), inactive]
  assert.deepEqual((await intake(reviewer, some)).candidates, expected(some))
  assert.equal((await intake(reviewer, some)).candidates.length, 2)
  pass('candidates equal what preparation derived from the legacy readback, in the same order; unknown and inactive ids skipped')

  const plainQuestion = (await admin.query(`insert into public.questions(owner_id,bank_id,external_id,unit,lesson,question_type,difficulty,prompt,marks,content,answer,options,correct_option_label)
    values($1,$2,'P1',1,'L1','multiple-choice','easy','Plain?',1,$3,$4,$5,'A') returning id`, [plain, plainBank, mc, mcAnswer, JSON.stringify(mc.options)])).rows[0].id
  const plainRevision = (await admin.query('select id from public.question_revisions where question_id=$1', [plainQuestion])).rows[0].id
  await admin.query(`insert into public.preset_curation(owner_id,bank_id,question_revision_id,state,provenance,private_source_notes)
    values($1,$2,$3,'draft',$4,'secret notes')`, [plain, plainBank, plainRevision, provenance('Plain source')])
  const plainView = await intake(other, [plainQuestion], plainBank)
  assert.equal(plainView.reviewer, null)
  assert.equal(plainView.candidates[0].record.privateNotes, null)
  pass('non-reviewer owners get no reviewer name and no private notes')

  for (const client of [signedOut, anon, outsider]) await rejects(() => intake(client, questionIds), '42501')
  await rejects(() => intake(reviewer, [plainQuestion], plainBank), '42501')
  await rejects(() => intake(reviewer, []), '23514')
  await rejects(() => intake(reviewer, [questionIds[0], null]), '23514')
  await rejects(() => intake(reviewer, Array.from({ length: 10001 }, randomUUID)), '23514')
  pass('signed-out, anonymous, foreign and cross-bank callers refused; bounds enforced')

  await admin.query(rollback)
  assert.equal((await admin.query("select count(*)::int n from pg_proc where proname='get_preset_intake_candidates'")).rows[0].n, 0)
  assert.equal((await reviewer.query('select public.get_preset_curation($1) d', [bank])).rows[0].d.records.length, 41)
  await admin.query(migration)
  pass('rollback removes only the new functions; legacy readback still works; reinstall succeeds')

  console.log(`All ${checks} preset intake candidate checks passed.`)
} finally {
  await Promise.allSettled(clients.map((client) => client.end()))
  if (started) {
    try { execFileSync(binary('pg_ctl'), ['-D', data, '-m', 'fast', '-w', 'stop'], { windowsHide: true, stdio: 'ignore', timeout: 60000 }) }
    catch { console.error('Disposable PostgreSQL shutdown failed. Inspect the local rehearsal directory:', runDir); process.exitCode = 1 }
  }
}
