// Isolated PostgreSQL rehearsal of the Phase 15A content-limit migration.
// No application credentials or remote database access.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { Client } from 'pg'
import net from 'node:net'
import path from 'node:path'

const root = process.cwd()
const runtime = path.join(root, 'integration-c-baseline.local/pg-runtime')
const bin = process.env.EXAMGO_TEST_PG_BIN ?? path.join(runtime, 'node_modules/@embedded-postgres/windows-x64/native/bin')
const binary = name => path.join(bin, name + (process.platform === 'win32' ? '.exe' : ''))
const runDir = path.join(root, 'integration-c-baseline.local', `phase15-limits-${Date.now()}`)
const data = path.join(runDir, 'data')
await mkdir(runDir, { recursive: true })
const password = randomBytes(32).toString('hex')
const pwfile = path.join(runDir, 'password.local')
await writeFile(pwfile, password)
const port = await new Promise((resolve, reject) => {
  const server = net.createServer().on('error', reject)
  server.listen(0, '127.0.0.1', () => { const assigned = server.address().port; server.close(() => resolve(assigned)) })
})
const migrationName = '20261018120000_phase15_jsonb_content_limits.sql'
const migration = await readFile(path.join('supabase/migrations', migrationName), 'utf8')
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
const text = (length, char = 'a') => char.repeat(length)
function mcContent(optionText = 'Yes') {
  return { type: 'multiple-choice', schemaVersion: 1, options: [{ label: 'A', text: optionText }, { label: 'B', text: 'No' }] }
}
const mcAnswer = { type: 'multiple-choice', schemaVersion: 1, correctOptionLabel: 'A' }
async function addQuestion(client, owner, bank, content = mcContent(), options = content.options) {
  const id = randomUUID()
  await client.query(`insert into public.questions
    (id,owner_id,bank_id,external_id,unit,lesson,question_type,difficulty,prompt,marks,content,answer,options,correct_option_label)
    values($1,$2,$3,$4,1,'L1','multiple-choice','easy','Question?',1,$5,$6,$7,'A')`,
  [id, owner, bank, `Q-${id.slice(0, 8)}`, content, mcAnswer, JSON.stringify(options)])
  return id
}
async function constraintCount(client) {
  return (await client.query("select count(*)::int n from pg_constraint where conname like '%\\_limits' and connamespace='public'::regnamespace")).rows[0].n
}

try {
  const options = { windowsHide: true, encoding: 'utf8', timeout: 60000 }
  execFileSync(binary('initdb'), ['-D', data, '-U', 'postgres', '-A', 'scram-sha-256', '--pwfile', pwfile, '--encoding=UTF8', '--locale=C'], options)
  execFileSync(binary('pg_ctl'), ['-D', data, '-l', path.join(runDir, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start'], { ...options, stdio: 'ignore' })
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

  const [owner, foreignOwner, bank] = [randomUUID(), randomUUID(), randomUUID()]
  await admin.query('insert into auth.users(id) values($1),($2)', [owner, foreignOwner])
  await admin.query("insert into public.question_banks(id,owner_id,name,grade) values($1,$2,'Synthetic limits',6)", [bank, owner])
  const existing = await addQuestion(admin, owner, bank)

  // A violating row must abort the migration and leave everything unchanged.
  const oversized = await addQuestion(admin, owner, bank, mcContent(text(2001)))
  await rejects(() => admin.query(migration), '23514')
  assert.equal(await constraintCount(admin), 0)
  assert.equal((await admin.query("select to_regprocedure('public.jsonb_within_limits(jsonb,integer,integer)') fn")).rows[0].fn, null)
  assert.equal((await admin.query("select char_length(content #>> '{options,0,text}') n from public.questions where id=$1", [oversized])).rows[0].n, 2001)
  pass('an existing violating row aborts the migration atomically without rewriting it')
  await admin.query('update public.questions set content=$2, options=$3 where id=$1', [oversized, mcContent(), JSON.stringify(mcContent().options)])

  await admin.query(migration)
  assert.equal(await constraintCount(admin), 8)
  assert.equal((await admin.query("select count(*)::int n from pg_constraint where conname like '%\\_limits' and not convalidated")).rows[0].n, 0)
  pass('migration installs and validates eight constraints against existing rows')

  const anon = await connect(null, 'anon'), a = await connect(owner, 'authenticated'), b = await connect(foreignOwner, 'authenticated')
  await rejects(() => anon.query("select public.jsonb_within_limits('{}'::jsonb,1,1)"), '42501')
  const fnAcl = (await admin.query(`select has_function_privilege('anon','public.jsonb_within_limits(jsonb,integer,integer)','execute') anon,
    has_function_privilege('authenticated','public.jsonb_within_limits(jsonb,integer,integer)','execute') auth,
    p.provolatile, p.prosecdef, p.proconfig from pg_proc p where p.oid='public.jsonb_within_limits(jsonb,integer,integer)'::regprocedure`)).rows[0]
  assert.deepEqual([fnAcl.anon, fnAcl.auth, fnAcl.provolatile, fnAcl.prosecdef, fnAcl.proconfig], [false, true, 'i', false, ['search_path=""']])
  pass('validator is immutable, invoker, fixed search path; anonymous execution denied')

  const within = async (doc, bytes, chars) => (await a.query('select public.jsonb_within_limits($1,$2,$3) ok', [doc, bytes, chars])).rows[0].ok
  assert.equal(await within(null, 1, 1), true)
  assert.equal(await within({ a: [{ b: [text(10)] }] }, 1000, 10), true)
  assert.equal(await within({ a: [{ b: [text(11)] }] }, 1000, 10), false)
  assert.equal(await within(JSON.stringify(text(11)), 1000, 10), false)
  assert.equal(await within({ arabic: text(10, 'ب') }, 1000, 10), true)
  const exact = { k: text(20) }
  const exactBytes = (await a.query('select octet_length($1::jsonb::text) n', [exact])).rows[0].n
  assert.equal(await within(exact, exactBytes, 20), true)
  assert.equal(await within(exact, exactBytes - 1, 20), false)
  assert.equal(await within({ k: text(10, 'ب') }, (await a.query('select octet_length($1::jsonb::text) n', [{ k: text(10, 'ب') }])).rows[0].n - 1, 100), false)
  pass('validator: nested/root strings, exact byte and character boundaries, UTF-8 bytes vs characters')

  await addQuestion(a, owner, bank, mcContent(text(2000)))
  await addQuestion(a, owner, bank, mcContent(text(2000, 'ع')))
  await rejects(() => addQuestion(a, owner, bank, mcContent(text(2001))), '23514')
  const manyOptions = mcContent(); manyOptions.padding = Array.from({ length: 400 }, () => text(100))
  await rejects(() => addQuestion(a, owner, bank, manyOptions, mcContent().options), '23514')
  await rejects(() => addQuestion(a, owner, bank, mcContent(), [{ label: 'A', text: text(2001) }, { label: 'B', text: 'No' }]), '23514')
  await rejects(() => a.query('update public.questions set content=$2 where id=$1', [existing, mcContent(text(2001))]), '23514')
  assert.equal((await a.query("select content #>> '{options,0,text}' t from public.questions where id=$1", [existing])).rows[0].t, 'Yes')
  await a.query('update public.questions set content=$2 where id=$1', [existing, mcContent('Edited within limits')])
  pass('authenticated direct question insert/update: 2,000 characters accepted (Latin and Arabic); oversized string, document and option rejected')

  const updateFromForeign = await b.query('update public.questions set content=$2 where id=$1', [existing, mcContent(text(2001))])
  assert.equal(updateFromForeign.rowCount, 0)
  pass('foreign owner still cannot touch the row (RLS unchanged)')

  const groupContent = (passage) => ({ type: 'passage', schemaVersion: 1, passage })
  const groupColumns = (await admin.query(`select string_agg(column_name, ',') c from information_schema.columns
    where table_schema='public' and table_name='question_groups' and is_nullable='NO' and column_default is null`)).rows[0].c
  const insertGroup = (passage) => admin.query(`insert into public.question_groups(owner_id,group_type,content,schema_version,expected_marks,attempt_count)
    values($1,'passage',$2,1,1,1)`, [owner, groupContent(passage)])
  await insertGroup(text(5000))
  await rejects(() => insertGroup(text(5001)), '23514')
  pass(`question group passage bounded at 5,000 characters for privileged writers too (required columns: ${groupColumns})`)

  const draft = randomUUID()
  await admin.query(`insert into public.exam_drafts(id,owner_id,bank_id,exam_title,school_name,grade,unit,marks_per_question,question_count,selection_seed)
    values($1,$2,$3,'Synthetic','School',6,1,1,1,1)`, [draft, owner, bank])
  await rejects(() => admin.query('update public.exam_drafts set workflow=$2 where id=$1', [draft, { items: Array.from({ length: 120 }, () => text(4500)) }]), '23514')
  await rejects(() => admin.query('update public.exam_drafts set workflow=$2 where id=$1', [draft, { note: text(5001) }]), '23514')
  const t0 = performance.now()
  assert.equal((await admin.query('select public.jsonb_within_limits($1,524288,5000) ok', [{ items: Array.from({ length: 100 }, () => text(5000)) }])).rows[0].ok, true)
  const elapsed = performance.now() - t0
  assert.equal((await admin.query('select workflow from public.exam_drafts where id=$1', [draft])).rows[0].workflow, null)
  pass(`legacy draft workflow bounded at 512 KiB / 5,000 characters; 500 KB check took ${elapsed.toFixed(0)} ms round trip`)

  const stagedImport = randomUUID()
  await a.query(`insert into public.catalogue_imports(id,owner_id,source_namespace,source_sha256,source_bank_id,expected_rows)
    values($1,$2,'Synthetic/limits',$3,$4,3)`, [stagedImport, owner, text(64, 'a'), bank])
  const stage = (catalogueId, value) => a.query(`insert into public.catalogue_import_rows
    (import_id, owner_id, catalogue_id, source_content_hash, source_fields, unit_tags, display_unit, group_ids)
    values($1,$2,$3,$4,$5,'{1}',1,'{}')`, [stagedImport, owner, catalogueId, text(64, 'b'), { catalogue_id: catalogueId, unit: '1', source_text: value }])
  await stage('Q-0001', text(100000))
  await rejects(() => stage('Q-0002', text(100001)), '23514')
  pass('staged import source field bounded at 100,000 characters (client cap) through direct authenticated insert')

  await admin.query(rollback)
  assert.equal(await constraintCount(admin), 0)
  const afterRollback = await addQuestion(a, owner, bank, mcContent(text(2001)))
  await admin.query('update public.questions set content=$2, options=$3 where id=$1', [afterRollback, mcContent(), JSON.stringify(mcContent().options)])
  await admin.query(migration)
  assert.equal(await constraintCount(admin), 8)
  pass('rollback removes constraints and validator; migration reinstalls cleanly')

  console.log(`All ${checks} Phase 15 content-limit checks passed.`)
} finally {
  await Promise.allSettled(clients.map((client) => client.end()))
  if (started) {
    try { execFileSync(binary('pg_ctl'), ['-D', data, '-m', 'fast', '-w', 'stop'], { windowsHide: true, stdio: 'ignore', timeout: 60000 }) }
    catch { console.error('Disposable PostgreSQL shutdown failed. Inspect the local rehearsal directory:', runDir); process.exitCode = 1 }
  }
}
