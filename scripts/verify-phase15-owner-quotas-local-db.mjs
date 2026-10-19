// Isolated PostgreSQL rehearsal of the Phase 15A per-teacher quota migration.
// No application credentials or remote database access.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { Client } from 'pg'
import net from 'node:net'
import path from 'node:path'
import { verifyFinalizationQuotas } from './verify-phase15-finalization-quotas.mjs'

process.on('uncaughtExceptionMonitor', error => {
  if (process.env.GITHUB_ACTIONS === 'true') console.error('::error title=Disposable database verifier::' +
    String(error.stderr || error.message).slice(0, 1200).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A'))
})

const root = process.cwd()
const runtime = path.join(root, 'integration-c-baseline.local/pg-runtime')
const bin = process.env.EXAMGO_TEST_PG_BIN ?? path.join(runtime, 'node_modules/@embedded-postgres/windows-x64/native/bin')
const binary = name => path.join(bin, name + (process.platform === 'win32' ? '.exe' : ''))
const runDir = path.join(root, 'integration-c-baseline.local', `phase15-quotas-${Date.now()}`)
const data = path.join(runDir, 'data')
await mkdir(runDir, { recursive: true })
const password = randomBytes(32).toString('hex')
const pwfile = path.join(runDir, 'password.local')
await writeFile(pwfile, password)
const port = await new Promise((resolve, reject) => {
  const server = net.createServer().on('error', reject)
  server.listen(0, '127.0.0.1', () => { const assigned = server.address().port; server.close(() => resolve(assigned)) })
})
const migrationName = '20261018140000_phase15_owner_quotas.sql'
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
async function rejects(action, code, hint) {
  try { await action() } catch (error) {
    assert.equal(error.code, code, error.message)
    if (hint) assert.equal(error.hint, hint)
    return error
  }
  throw new Error(`Expected SQLSTATE ${code}`)
}
const count = async (client, table, owner) => (await client.query(`select count(*)::int n from public.${table} where owner_id=$1`, [owner])).rows[0].n
const mc = { type: 'multiple-choice', schemaVersion: 1, options: [{ label: 'A', text: 'Yes' }, { label: 'B', text: 'No' }] }
const mcAnswer = { type: 'multiple-choice', schemaVersion: 1, correctOptionLabel: 'A' }
function questionValues(owner, bank, n, prefix) {
  const params = []; const rows = []
  for (let i = 0; i < n; i++) {
    const b = params.length
    params.push(owner, bank, `${prefix}-${i}`, mc, mcAnswer, JSON.stringify(mc.options))
    rows.push(`($${b + 1},$${b + 2},$${b + 3},1,'L1','multiple-choice','easy','Question?',1,$${b + 4},$${b + 5},$${b + 6},'A')`)
  }
  return { sql: `insert into public.questions(owner_id,bank_id,external_id,unit,lesson,question_type,difficulty,prompt,marks,content,answer,options,correct_option_label) values ${rows.join(',')}`, params }
}
const setLimit = (admin, resource, total, inWindow = null, window = null) =>
  admin.query('update private.owner_quota_limits set max_total=$2, max_in_window=$3, rate_window=$4::interval where resource=$1', [resource, total, inWindow, window])

try {
  const options = { windowsHide: true, encoding: 'utf8', timeout: 60000 }
  execFileSync(binary('initdb'), ['-D', data, '-U', 'postgres', '-A', 'scram-sha-256', '--pwfile', pwfile, '--encoding=UTF8', '--locale=C'], options)
  // Clients use loopback TCP. Do not require the runner to own the distro's
  // default Unix socket directory (Windows already defaults to no Unix socket).
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

  const [owner, other] = [randomUUID(), randomUUID()]
  await admin.query('insert into auth.users(id) values($1),($2)', [owner, other])
  const existingBank = randomUUID()
  await admin.query("insert into public.question_banks(id,owner_id,name,grade) values($1,$2,'Existing',6)", [existingBank, owner])

  await admin.query(migration)
  const seeded = (await admin.query('select resource, max_total, max_in_window, rate_window::text w from private.owner_quota_limits order by resource')).rows
  assert.deepEqual(seeded.map((r) => [r.resource, r.max_total, r.max_in_window, r.w]), [
    ['catalogue_imports', null, 20, '1 day'], ['exam_drafts', 200, null, null], ['exam_snapshots', 500, 30, '01:00:00'],
    ['question_banks', 50, null, null], ['questions', 10000, null, null]])
  const triggers = (await admin.query("select count(*)::int n from pg_trigger where tgname like '%\\_owner\\_quota' and not tgisinternal")).rows[0].n
  assert.equal(triggers, 5)
  pass('migration installs: decided limits seeded, five statement-level triggers')

  const a = await connect(owner, 'authenticated'), b = await connect(other, 'authenticated'), anon = await connect(null, 'anon')
  await rejects(() => a.query('select * from private.owner_quota_limits'), '42501')
  await rejects(() => anon.query('select * from private.owner_quota_limits'), '42501')
  await rejects(() => a.query('update private.owner_quota_limits set max_total=999999'), '42501')
  const fn = (await admin.query(`select p.prosecdef, p.proconfig, has_function_privilege('authenticated', p.oid, 'execute') auth,
    has_function_privilege('anon', p.oid, 'execute') anon from pg_proc p where p.oid='private.enforce_owner_quota()'::regprocedure`)).rows[0]
  assert.deepEqual([fn.prosecdef, fn.proconfig, fn.auth, fn.anon], [true, ['search_path=""'], false, false])
  pass('teachers cannot read or change limits; trigger function is definer with fixed search path and not callable directly')

  await setLimit(admin, 'question_banks', 3)
  const addBank = (client, ownerId, name) => client.query("insert into public.question_banks(owner_id,name,grade) values($1,$2,6)", [ownerId, name])
  await addBank(a, owner, 'Two'); await addBank(a, owner, 'Three')
  await rejects(() => addBank(a, owner, 'Four'), '53400', 'account-limit:question_banks:total')
  assert.equal(await count(admin, 'question_banks', owner), 3)
  await addBank(b, other, 'Other one')
  pass('bank total: third bank accepted, fourth rejected with the client hint; another teacher is unaffected')

  await setLimit(admin, 'question_banks', 4)
  await rejects(() => a.query("insert into public.question_banks(owner_id,name,grade) values($1,'Five',6),($1,'Six',6)", [owner]), '53400')
  assert.equal(await count(admin, 'question_banks', owner), 3)
  pass('a multi-row insert that would cross the limit is rejected as a whole')

  await admin.query("update public.question_banks set name='Existing renamed' where id=$1", [existingBank])
  await setLimit(admin, 'question_banks', 2)
  await a.query("update public.question_banks set name='Renamed by teacher' where id=$1", [existingBank])
  assert.equal((await a.query('select count(*)::int n from public.question_banks where owner_id=$1', [owner])).rows[0].n, 3)
  await rejects(() => addBank(a, owner, 'Over'), '53400')
  pass('an account already above a lowered limit keeps reading and updating; only new rows are refused')

  await setLimit(admin, 'question_banks', 4)
  const race1 = await connect(owner, 'authenticated'), race2 = await connect(owner, 'authenticated')
  await race1.query('begin'); await race2.query('begin')
  await addBank(race1, owner, 'Race one')
  const second = addBank(race2, owner, 'Race two').then(() => 'inserted', (error) => error)
  await new Promise((resolve) => setTimeout(resolve, 300))
  await race1.query('commit')
  const outcome = await second
  assert.equal(outcome.code, '53400', String(outcome))
  await race2.query('rollback')
  assert.equal(await count(admin, 'question_banks', owner), 4)
  pass('two concurrent requests for the last slot: the advisory lock serializes them and exactly one succeeds')

  await setLimit(admin, 'questions', 5)
  const bank = (await admin.query('select id from public.question_banks where owner_id=$1 limit 1', [owner])).rows[0].id
  const three = questionValues(owner, bank, 3, 'Q3'); await a.query(three.sql, three.params)
  const two = questionValues(owner, bank, 2, 'Q2'); await a.query(two.sql, two.params)
  const one = questionValues(owner, bank, 1, 'Q1')
  await rejects(() => a.query(one.sql, one.params), '53400', 'account-limit:questions:total')
  await setLimit(admin, 'questions', 10000)
  const bulk = questionValues(owner, bank, 500, 'BULK')
  const t0 = performance.now(); await a.query(bulk.sql, bulk.params); const bulkMs = performance.now() - t0
  assert.equal(await count(admin, 'questions', owner), 505)
  pass(`question total counted per statement; a 500-row insert under the 10,000 limit took ${bulkMs.toFixed(0)} ms`)

  await setLimit(admin, 'catalogue_imports', null, 2, '1 day')
  const stage = (client, sha) => client.query(`insert into public.catalogue_imports(owner_id,source_namespace,source_sha256,source_bank_id,expected_rows)
    values($1,'Synthetic/quota',$2,$3,1) on conflict do nothing`, [owner, sha, bank])
  await stage(a, 'a'.repeat(64)); await stage(a, 'b'.repeat(64))
  await rejects(() => stage(a, 'c'.repeat(64)), '53400', 'account-limit:catalogue_imports:rate')
  await stage(a, 'a'.repeat(64))
  assert.equal(await count(admin, 'catalogue_imports', owner), 2)
  await admin.query("update public.catalogue_imports set created_at = now() - interval '2 days' where owner_id=$1 and source_sha256=$2", [owner, 'a'.repeat(64)])
  await stage(a, 'c'.repeat(64))
  pass('import rate: third import in a day rejected; an exact retry is not charged; the window rolls forward')

  await setLimit(admin, 'exam_drafts', 1)
  const draft = (client, title) => client.query(`insert into public.exam_drafts(owner_id,bank_id,exam_title,school_name,grade,unit,marks_per_question,question_count,selection_seed)
    values($1,$2,$3,'School',6,1,1,1,1)`, [owner, bank, title])
  await draft(a, 'One')
  await rejects(() => draft(a, 'Two'), '53400', 'account-limit:exam_drafts:total')
  pass('draft total enforced on direct legacy draft insert')

  const snapshotTrigger = (await admin.query(`select tgtype from pg_trigger where tgname='exam_snapshots_owner_quota'`)).rows[0].tgtype
  assert.equal(snapshotTrigger & 1, 0) // statement level
  await setLimit(admin, 'exam_snapshots', 500, 1, '1 hour')
  const snapshotLimitSql = "select max_total, max_in_window, rate_window::text w from private.owner_quota_limits where resource='exam_snapshots'"
  assert.deepEqual(Object.values((await admin.query(snapshotLimitSql)).rows[0]), [500, 1, '01:00:00'])
  pass('finalized-paper trigger is installed at statement level; its total and rate use the same tested code path')

  await verifyFinalizationQuotas({ admin, teacher: a, owner, bank, setLimit, pass })

  await admin.query(rollback)
  assert.equal((await admin.query("select count(*)::int n from pg_trigger where tgname like '%\\_owner\\_quota'")).rows[0].n, 0)
  assert.equal((await admin.query("select to_regclass('private.owner_quota_limits') t")).rows[0].t, null)
  await draft(a, 'After rollback')
  await admin.query(migration)
  pass('rollback removes triggers, function and limits table; reinstall succeeds')

  console.log(`All ${checks} Phase 15 quota checks passed.`)
} finally {
  await Promise.allSettled(clients.map((client) => client.end()))
  if (started) {
    try { execFileSync(binary('pg_ctl'), ['-D', data, '-m', 'fast', '-w', 'stop'], { windowsHide: true, stdio: 'ignore', timeout: 60000 }) }
    catch { console.error('Disposable PostgreSQL shutdown failed. Inspect the local rehearsal directory:', runDir); process.exitCode = 1 }
  }
}
