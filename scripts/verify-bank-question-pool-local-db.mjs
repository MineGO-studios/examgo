// Isolated PostgreSQL rehearsal of the bank question pool function (owner request, 19 October 2026).
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
const runDir = path.join(root, 'integration-c-baseline.local', `bank-pool-${Date.now()}`)
const data = path.join(runDir, 'data')
await mkdir(runDir, { recursive: true })
const password = randomBytes(32).toString('hex')
const pwfile = path.join(runDir, 'password.local')
await writeFile(pwfile, password)
const port = await new Promise((resolve, reject) => {
  const server = net.createServer().on('error', reject)
  server.listen(0, '127.0.0.1', () => { const assigned = server.address().port; server.close(() => resolve(assigned)) })
})
const migrationName = '20261019090000_bank_question_pool.sql'
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
async function addQuestion(admin, owner, bank, externalId) {
  return (await admin.query(`insert into public.questions(owner_id,bank_id,external_id,unit,lesson,question_type,difficulty,prompt,marks,content,answer,options,correct_option_label)
    values($1,$2,$3,1,'L1','multiple-choice','easy','Question?',1,$4,$5,$6,'A') returning id`,
  [owner, bank, externalId, mc, mcAnswer, JSON.stringify(mc.options)])).rows[0].id
}

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
  const fn = (await admin.query(`select p.prosecdef, p.provolatile, p.proconfig,
      has_function_privilege('anon', p.oid, 'execute') anon, has_function_privilege('authenticated', p.oid, 'execute') auth
    from pg_proc p where p.oid = 'public.get_bank_question_pool(uuid[],boolean,boolean)'::regprocedure`)).rows[0]
  assert.deepEqual([fn.prosecdef, fn.provolatile, fn.proconfig, fn.anon, fn.auth], [false, 's', ['search_path=""'], false, true])
  pass('function installs as invoker, stable, fixed search path; anon cannot execute, authenticated can')

  // Synthetic data: owner A with two banks (one archived), owner B with one bank.
  const [ownerA, ownerB] = [randomUUID(), randomUUID()]
  await admin.query('insert into auth.users(id) values($1),($2)', [ownerA, ownerB])
  const [bankA, bankA2, archived, bankB] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()]
  await admin.query(`insert into public.question_banks(id,owner_id,name,grade,is_archived) values
    ($1,$5,'A one',6,false),($2,$5,'A two',6,false),($3,$5,'A archived',6,true),($4,$6,'B one',6,false)`, [bankA, bankA2, archived, bankB, ownerA, ownerB])
  const active = await addQuestion(admin, ownerA, bankA, 'ACTIVE')
  const inactive = await addQuestion(admin, ownerA, bankA, 'INACTIVE')
  await admin.query('update public.questions set is_active = false where id = $1', [inactive])
  const child = await addQuestion(admin, ownerA, bankA, 'CHILD')
  const shared = await addQuestion(admin, ownerA, bankA2, 'SHARED')
  await admin.query('insert into public.question_bank_memberships(bank_id, question_id, owner_id) values ($1,$2,$3) on conflict do nothing', [bankA, shared, ownerA])
  const group = (await admin.query(`insert into public.question_groups(owner_id,group_type,content,schema_version,expected_marks,attempt_count)
    values($1,'passage',$2,1,1,1) returning id`, [ownerA, { type: 'passage', schemaVersion: 1, passage: 'Read this.' }])).rows[0].id
  await admin.query('insert into public.question_group_questions(group_id, question_id, position, owner_id) values ($1,$2,1,$3)', [group, child, ownerA])
  const foreignQuestion = await addQuestion(admin, ownerB, bankB, 'FOREIGN')
  pass('synthetic fixtures: active, inactive, passage child, multi-bank membership, archived bank, foreign owner')

  const a = await connect(ownerA, 'authenticated'), b = await connect(ownerB, 'authenticated')
  const signedOut = await connect(null, 'authenticated'), anon = await connect(null, 'anon')
  const pool = async (client, banks, activeOnly, standaloneOnly) =>
    (await client.query('select public.get_bank_question_pool($1,$2,$3) pool', [banks, activeOnly, standaloneOnly])).rows[0].pool.map(q => q.id)
  const sorted = ids => [...ids].sort()
  assert.deepEqual(await pool(a, [bankA], false, false), sorted([active, inactive, child, shared]))
  assert.deepEqual(await pool(a, [bankA], true, false), sorted([active, child, shared]))
  assert.deepEqual(await pool(a, [bankA], false, true), sorted([active, inactive, shared]))
  assert.deepEqual(await pool(a, [bankA], true, true), sorted([active, shared]))
  assert.deepEqual(await pool(a, [bankA, bankA2, bankA], false, false), sorted([active, inactive, child, shared]))
  const full = (await a.query('select public.get_bank_question_pool($1) pool', [[bankA]])).rows[0].pool
  assert.ok(full.every(q => q.owner_id === ownerA && q.prompt === 'Question?' && q.content?.type === 'multiple-choice'))
  pass('filters: all / active / standalone / both; duplicate bank ids deduplicated; shared question once; full rows returned')

  await rejects(() => pool(signedOut, [bankA], false, false), '42501')
  await rejects(() => pool(anon, [bankA], false, false), '42501')
  await rejects(() => pool(a, [bankB], false, false), '42501')
  await rejects(() => pool(a, [bankA, bankB], false, false), '42501')
  await rejects(() => pool(a, [archived], false, false), '42501')
  await rejects(() => pool(a, [], false, false), '23514')
  await rejects(() => pool(a, Array.from({ length: 21 }, randomUUID), false, false), '23514')
  await rejects(() => a.query('select public.get_bank_question_pool($1) pool', [[bankA, null]]), '23514')
  assert.deepEqual(await pool(b, [bankB], false, false), [foreignQuestion])
  pass('signed-out, anon, foreign, mixed, archived, empty, oversized and null-id requests refused; owner B sees only B')

  await admin.query(rollback)
  assert.equal((await admin.query("select to_regprocedure('public.get_bank_question_pool(uuid[],boolean,boolean)') fn")).rows[0].fn, null)
  await admin.query(migration)
  pass('rollback removes the function; reinstall succeeds')

  console.log(`All ${checks} bank question pool checks passed.`)
} finally {
  await Promise.allSettled(clients.map((client) => client.end()))
  if (started) {
    try { execFileSync(binary('pg_ctl'), ['-D', data, '-m', 'fast', '-w', 'stop'], { windowsHide: true, stdio: 'ignore', timeout: 60000 }) }
    catch { console.error('Disposable PostgreSQL shutdown failed. Inspect the local rehearsal directory:', runDir); process.exitCode = 1 }
  }
}
