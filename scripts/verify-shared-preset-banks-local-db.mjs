// Isolated PostgreSQL rehearsal of the shared published preset catalogue (owner request, 19 October 2026).
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
const runDir = path.join(root, 'integration-c-baseline.local', `shared-presets-${Date.now()}`)
const data = path.join(runDir, 'data')
await mkdir(runDir, { recursive: true })
const password = randomBytes(32).toString('hex')
const pwfile = path.join(runDir, 'password.local')
await writeFile(pwfile, password)
const port = await new Promise((resolve, reject) => {
  const server = net.createServer().on('error', reject)
  server.listen(0, '127.0.0.1', () => { const assigned = server.address().port; server.close(() => resolve(assigned)) })
})
const migrationName = '20261020163754_phase16_shared_preset_banks.sql'
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
  for (const file of files) await admin.query((await readFile(path.join('supabase/migrations', file), 'utf8')).replaceAll('\r\n', '\n'))
  pass(`all ${files.length} earlier migrations compile in a fresh database`)

  await admin.query(migration)

  for (const signature of ['public.get_preset_banks(uuid,integer)','public.get_preset_bank_questions(uuid,uuid,integer,text)']) {
    const fn=(await admin.query("select prosecdef,provolatile,proconfig,has_function_privilege('anon',oid,'execute') anon,has_function_privilege('authenticated',oid,'execute') auth from pg_proc where oid=$1::regprocedure",[signature])).rows[0]
    assert.deepEqual([fn.prosecdef,fn.provolatile,fn.proconfig,fn.anon,fn.auth],[true,'s',['search_path=""'],false,true])
  }
  pass('fixed search path, stable read-only functions, authenticated execute only')
  const [publisher,teacherId,futureId]=[randomUUID(),randomUUID(),randomUUID()]
  await admin.query('insert into auth.users(id) values($1),($2)',[publisher,teacherId])
  await admin.query('insert into private.preset_reviewers(user_id,display_name) values($1,$2)',[publisher,'Synthetic publisher'])
  const [bank,second,privateBank]=[randomUUID(),randomUUID(),randomUUID()]
  await admin.query("insert into public.question_banks(id,owner_id,name,grade) values($1,$4,'Shared one',6),($2,$4,'Shared two',6),($3,$4,'Private source',6)",[bank,second,privateBank,publisher])
  const q1=await addQuestion(admin,publisher,bank,'FIRST'),q2=await addQuestion(admin,publisher,bank,'SECOND'),q3=await addQuestion(admin,publisher,second,'THIRD')
  await addQuestion(admin,publisher,privateBank,'PRIVATE')
  const publish=async question=>{
    const revision=(await admin.query('select id from public.question_revisions where question_id=$1 order by revision desc limit 1',[question])).rows[0].id
    const c=(await admin.query("insert into public.preset_curation(owner_id,bank_id,question_revision_id,state,provenance,private_source_notes,reviewer_id,reviewer_name,approved_at) select $1,bank_id,id,'approved','{}','PRIVATE NOTES',$1,'Synthetic publisher',now() from public.question_revisions where id=$2 returning id",[publisher,revision])).rows[0].id
    await admin.query("insert into public.preset_publications(curation_id,review_version,public_provenance,source_groups,publisher_id,publisher_name,reason) values($1,1,'{}',private.preset_source_groups($3),$2,'Synthetic publisher','Synthetic publication')",[c,publisher,question])
    return c
  }
  await publish(q1);const c2=await publish(q2);await publish(q3)
  const q4=await addQuestion(admin,publisher,privateBank,'GROUP-ONE'),q5=await addQuestion(admin,publisher,privateBank,'GROUP-TWO')
  const group=(await admin.query("insert into public.question_groups(owner_id,group_type,content,schema_version,expected_marks,attempt_count) values($1,'passage',$2,1,2,2) returning id",[publisher,{type:'passage',schemaVersion:1,passage:'Synthetic context.'}])).rows[0].id
  await admin.query('insert into public.question_group_questions(group_id,question_id,position,owner_id) values($1,$2,1,$4),($1,$3,2,$4)',[group,q4,q5,publisher])
  await publish(q5)
  const teacher=await connect(teacherId,'authenticated'),anon=await connect(null,'anon'),signedOut=await connect(null,'authenticated')
  const banks=async c=>(await c.query('select public.get_preset_banks() value')).rows[0].value
  const questions=async(c,b,after=null,limit=50,search='')=>(await c.query('select public.get_preset_bank_questions($1,$2,$3,$4) value',[b,after,limit,search])).rows[0].value
  const original=await banks(teacher)
  assert.equal(original.length,2);assert.deepEqual(new Set(original.map(b=>b.id)),new Set([bank,second]))
  assert.ok(original.every(b=>Object.keys(b).sort().join(',')==='grade,id,name,publishedCount,subject'))
  assert.equal(original.find(b=>b.id===bank).publishedCount,2)
  pass('existing ordinary account sees published banks; private source bank and private fields hidden')
  await admin.query('insert into auth.users(id) values($1)',[futureId])
  const future=await connect(futureId,'authenticated')
  assert.deepEqual(await banks(future),original)
  pass('account created after installation automatically sees identical shared catalogue')
  const rows=await questions(teacher,bank)
  assert.equal(rows.length,2)
  assert.ok(rows.every(row=>Object.keys(row).sort().join(',')==='difficulty,id,lesson,prompt,revisionId,type,unit'))
  const first=await questions(teacher,bank,null,1),next=await questions(teacher,bank,first[0].id,1)
  assert.notEqual(first[0].id,next[0].id)
  assert.deepEqual(await questions(teacher,privateBank),[])
  assert.equal((await questions(teacher,bank,null,1,'Question?')).length,1)
  assert.deepEqual(await questions(teacher,bank,null,50,'%'),[])
  pass('bounded cursor pagination and literal search; no unpublished question or incomplete group access')
  assert.deepEqual(new Set((await admin.query('select question_id from private.shared_preset_revisions()')).rows.map(r=>r.question_id)),new Set((await admin.query('select v.question_id from public.question_revisions v where private.preset_question_is_eligible(v.id)')).rows.map(r=>r.question_id)))
  await publish(q4)
  assert.equal((await banks(future)).length,3)
  assert.equal((await questions(future,privateBank)).length,2)
  pass('same eligibility as protected selector; completing publication makes a new bank available automatically')
  for(const c of [anon,signedOut]){
    await rejects(()=>banks(c),'42501');await rejects(()=>questions(c,bank),'42501')
  }
  for(const limit of [0,101,null])await rejects(()=>questions(teacher,bank,null,limit),'23514')
  await rejects(()=>questions(teacher,null),'23514')
  await rejects(()=>questions(teacher,bank,null,50,'x'.repeat(201)),'23514')
  pass('anonymous, signed-out and invalid requests rejected')
  assert.equal((await teacher.query('select * from public.question_banks where id=$1',[bank])).rowCount,0)
  assert.equal((await teacher.query('select * from public.questions where id=$1',[q1])).rowCount,0)
  assert.equal((await teacher.query("update public.question_banks set name='forged' where id=$1",[bank])).rowCount,0)
  assert.equal((await teacher.query("update public.questions set prompt='forged' where id=$1",[q1])).rowCount,0)
  await rejects(()=>teacher.query('select * from public.preset_curation'),'42501')
  await rejects(()=>teacher.query('select * from private.shared_preset_revisions()'),'42501')
  pass('original ownership RLS, internal helper and publisher-private curation access remain intact')
  await admin.query("update public.preset_curation set state='withdrawn' where id=$1",[c2])
  assert.equal((await questions(teacher,bank)).length,1)
  await admin.query('update public.question_banks set is_archived=true where id=$1',[second])
  assert.equal((await banks(teacher)).length,2)
  pass('withdrawal and bank archive immediately remove shared content')
  await admin.query(rollback)
  assert.equal((await admin.query("select to_regprocedure('public.get_preset_banks(uuid,integer)') fn")).rows[0].fn,null)
  await admin.query(migration)
  assert.equal((await banks(future)).length,2)
  pass('rollback removes only new projections; reinstall preserves source and future-account access')
  console.log('All '+checks+' shared preset database checks passed.')

} finally {
  await Promise.allSettled(clients.map((client) => client.end()))
  if (started) {
    try { execFileSync(binary('pg_ctl'), ['-D', data, '-m', 'fast', '-w', 'stop'], { windowsHide: true, stdio: 'ignore', timeout: 60000 }) }
    catch { console.error('Disposable PostgreSQL shutdown failed. Inspect the local rehearsal directory:', runDir); process.exitCode = 1 }
  }
}
