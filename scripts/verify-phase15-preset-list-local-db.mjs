// Isolated PostgreSQL rehearsal of the Phase 15C preset-list filter-order migration.
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
const runDir = path.join(root, 'integration-c-baseline.local', `phase15-presets-${Date.now()}`)
const data = path.join(runDir, 'data')
await mkdir(runDir, { recursive: true })
const password = randomBytes(32).toString('hex')
const pwfile = path.join(runDir, 'password.local')
await writeFile(pwfile, password)
const port = await new Promise((resolve, reject) => {
  const server = net.createServer().on('error', reject)
  server.listen(0, '127.0.0.1', () => { const assigned = server.address().port; server.close(() => resolve(assigned)) })
})
const migrationName = '20261018160000_phase15_preset_list_filter_order.sql'
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
const definition = async (client) => (await client.query(`select p.prosrc, p.prosecdef, p.provolatile, p.proconfig,
    pg_get_userbyid(p.proowner) owner, coalesce(p.proacl::text, '') acl
  from pg_proc p where p.oid = 'private.get_eligible_simple_presets(uuid,integer)'::regprocedure`)).rows[0]
const wrapperAcl = async (client) => (await client.query(`select coalesce(p.proacl::text, '') acl
  from pg_proc p where p.oid = 'public.get_eligible_simple_presets(uuid,integer)'::regprocedure`)).rows[0].acl

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

  const before = await definition(admin)
  const beforeWrapper = await wrapperAcl(admin)
  assert.ok(!before.prosrc.includes('as materialized'))
  await admin.query(migration)
  const after = await definition(admin)
  assert.ok(after.prosrc.includes('candidates as materialized'))
  assert.deepEqual([after.prosecdef, after.provolatile, after.proconfig, after.owner, after.acl],
    [before.prosecdef, before.provolatile, before.proconfig, before.owner, before.acl])
  assert.equal(await wrapperAcl(admin), beforeWrapper)
  pass('migration installs; definer setting, volatility, search path, owner and grants unchanged')

  const owner = randomUUID()
  await admin.query('insert into auth.users(id) values($1)', [owner])
  const teacher = await connect(owner, 'authenticated'), signedOut = await connect(null, 'authenticated'), anon = await connect(null, 'anon')
  await rejects(() => signedOut.query('select public.get_eligible_simple_presets(null, 100)'), '42501')
  await rejects(() => anon.query('select public.get_eligible_simple_presets(null, 100)'), '42501')
  for (const limit of [0, 101, null]) await rejects(() => teacher.query('select public.get_eligible_simple_presets(null, $1)', [limit]), '23514')
  assert.deepEqual((await teacher.query('select public.get_eligible_simple_presets(null, 100) page')).rows[0].page, [])
  assert.deepEqual((await teacher.query('select public.get_eligible_simple_presets($1, 1) page', [randomUUID()])).rows[0].page, [])
  pass('signed-out and anonymous denial, page-limit checks and empty pool unchanged')

  await admin.query(rollback)
  const restored = await definition(admin)
  // A Windows checkout may store the original migration with CRLF; the SQL is otherwise identical.
  const lf = (text) => text.replace(/\r\n/g, '\n')
  assert.equal(lf(restored.prosrc), lf(before.prosrc))
  assert.deepEqual([restored.prosecdef, restored.proconfig, restored.owner, restored.acl], [before.prosecdef, before.proconfig, before.owner, before.acl])
  await admin.query(migration)
  assert.equal((await definition(admin)).prosrc, after.prosrc)
  pass('rollback restores the original body (line endings normalized); reinstall succeeds')

  console.log(`All ${checks} Phase 15 preset-list checks passed.`)
} finally {
  await Promise.allSettled(clients.map((client) => client.end()))
  if (started) {
    try { execFileSync(binary('pg_ctl'), ['-D', data, '-m', 'fast', '-w', 'stop'], { windowsHide: true, stdio: 'ignore', timeout: 60000 }) }
    catch { console.error('Disposable PostgreSQL shutdown failed. Inspect the local rehearsal directory:', runDir); process.exitCode = 1 }
  }
}
