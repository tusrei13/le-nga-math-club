import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {seed} from '../database/seed.mjs';
import {sqliteD1} from '../database/d1-adapter.mjs';
import worker from '../cloudflare/worker.mjs';
import stemWorker from '../stem-maths/worker.mjs';
function fixture(){
  const db=new DatabaseSync(':memory:');
  for(const file of ['database/schema.sql','database/admin-schema.sql','database/customer-schema.sql','database/migrations/005-stem-maths.sql'])db.exec(readFileSync(file,'utf8'));
  seed(db);const env={DB:sqliteD1(db)};
  const req=(path,{method='GET',data,headers={},stem=true}={})=>(stem?stemWorker:worker).fetch(new Request('https://site.test'+path,{method,headers:{'Content-Type':'application/json',...headers},body:data===undefined?undefined:JSON.stringify(data)}),env);
  return {db,req};
}
const payload={name:'Phụ huynh',phone:'0989066885',grade:7,level:'advanced',specialist_goal:true,consent:true,note:'Con muốn ôn hình học.'};
test('STEM migration can be retried without duplicating programs or overwriting existing data',async()=>{
  const {db,req}=fixture();try{
    const receipt=await(await req('/api/stem/enquiries',{method:'POST',data:payload,headers:{'Idempotency-Key':crypto.randomUUID()}})).json();
    const enquiries=db.prepare('SELECT * FROM stem_enquiries').all();
    const history=db.prepare('SELECT * FROM stem_enquiry_history').all();
    db.prepare('UPDATE stem_programs SET title=?,active=0 WHERE id=?').run('Chương trình đã chỉnh sửa','g7-advanced');
    db.exec(readFileSync('database/migrations/005-stem-maths.sql','utf8'));
    assert.equal(db.prepare('SELECT count(*) AS n FROM stem_programs').get().n,28);
    for(let grade=3;grade<=9;grade++)assert.equal(db.prepare('SELECT count(*) AS n FROM stem_programs WHERE grade=?').get(grade).n,4);
    const program=db.prepare('SELECT title,active FROM stem_programs WHERE id=?').get('g7-advanced');
    assert.equal(program.title,'Chương trình đã chỉnh sửa');assert.equal(program.active,0);
    assert.ok(receipt.id);assert.deepEqual(db.prepare('SELECT * FROM stem_enquiries').all(),enquiries);
    assert.deepEqual(db.prepare('SELECT * FROM stem_enquiry_history').all(),history);
    assert.equal(db.prepare('SELECT count(*) AS n FROM schema_versions WHERE version=5').get().n,1);
  }finally{db.close();}
});
test('STEM has 28 programs, validates enquiries and replays without exposing parent data',async()=>{
  const {db,req}=fixture();try{
    const programs=await(await req('/api/stem/programs')).json();assert.equal(programs.programs.length,28);
    assert.equal((await req('/healthz')).status,200);
    const headers={'Idempotency-Key':crypto.randomUUID()};
    const created=await req('/api/stem/enquiries',{method:'POST',data:payload,headers});assert.equal(created.status,201);
    const receipt=await created.json();assert.match(receipt.id,/^STEM-/);assert.equal(receipt.phone,undefined);assert.equal(receipt.parent_name,undefined);
    const replay=await req('/api/stem/enquiries',{method:'POST',data:payload,headers});assert.equal(replay.status,200);assert.equal((await replay.json()).id,receipt.id);
    assert.equal((await req('/api/stem/enquiries',{method:'POST',data:{...payload,note:'Khác'},headers})).status,409);
    for(const changes of [{phone:'123'},{grade:2},{grade:3,specialist_goal:true},{consent:false},{level:'fake'},{website:'spam'}])assert.equal((await req('/api/stem/enquiries',{method:'POST',data:{...payload,...changes},headers:{'Idempotency-Key':crypto.randomUUID()}})).status,400);
    assert.equal((await req('/api/stem/enquiries',{method:'POST',data:payload,headers:{'Idempotency-Key':crypto.randomUUID(),Origin:'https://evil.test'}})).status,403);
    assert.equal((await req('/api/admin/stem-enquiries',{stem:false})).status,401);
    assert.equal((await req('/api/admin/stem-enquiries')).status,404);
    assert.equal(db.prepare('SELECT count(*) AS n FROM stem_enquiries').get().n,1);
    assert.equal(db.prepare('SELECT count(*) AS n FROM stem_enquiry_history').get().n,1);
  }finally{db.close();}
});
test('STEM admin uses the book session, CSRF, status history and optimistic staff notes',async()=>{
  const {db,req}=fixture();try{
    const password='a'.repeat(64),digest=createHash('sha256').update(password).digest('hex');
    db.prepare('INSERT INTO admin_users(id,username,password_hash) VALUES(?,?,?)').run('owner','admin','token-sha256:'+digest);
    const login=await req('/api/auth/login',{method:'POST',data:{username:'admin',password},stem:false});assert.equal(login.status,200);
    const cookie=login.headers.get('Set-Cookie').split(';')[0],session=await login.json(),headers={Cookie:cookie,'X-CSRF-Token':session.csrf_token};
    const created=await(await req('/api/stem/enquiries',{method:'POST',data:payload,headers:{'Idempotency-Key':crypto.randomUUID()}})).json();
    const summary=await(await req('/api/admin/summary',{headers,stem:false})).json();assert.equal(summary.stem_enquiries.new,1);
    const list=await(await req('/api/admin/stem-enquiries?q=0989&status=new',{headers,stem:false})).json();assert.equal(list.total,1);
    const base='/api/admin/stem-enquiries/'+created.id;
    assert.equal((await req(base+'/status',{method:'PATCH',data:{status:'contacted',expected_status:'new'},headers:{Cookie:cookie},stem:false})).status,403);
    assert.equal((await req(base+'/status',{method:'PATCH',data:{status:'contacted',expected_status:'new'},headers,stem:false})).status,200);
    assert.equal((await req(base+'/status',{method:'PATCH',data:{status:'cancelled',expected_status:'new'},headers,stem:false})).status,409);
    assert.equal((await req(base+'/notes',{method:'PATCH',data:{staff_note:'Đã hẹn trao đổi',expected_note:''},headers,stem:false})).status,200);
    assert.equal((await req(base+'/notes',{method:'PATCH',data:{staff_note:'Ghi đè cũ',expected_note:''},headers,stem:false})).status,409);
    const detail=await(await req(base,{headers,stem:false})).json();assert.equal(detail.staff_note,'Đã hẹn trao đổi');assert.equal(detail.history.length,3);assert.equal(detail.history[2].event_type,'note');assert.equal(detail.request_hash,undefined);
    const count=db.prepare('SELECT count(*) AS n FROM stem_enquiry_history').get().n;assert.equal(count,3);
  }finally{db.close();}
});
test('STEM rate limit and request size protect the public form',async()=>{
  const {db,req}=fixture();try{
    const oversized=await req('/api/stem/enquiries',{method:'POST',data:{...payload,note:'x'.repeat(33000)},headers:{'Idempotency-Key':crypto.randomUUID()}});assert.equal(oversized.status,413);
    for(let index=0;index<20;index++)assert.equal((await req('/api/stem/enquiries',{method:'POST',data:payload,headers:{'Idempotency-Key':crypto.randomUUID()}})).status,201);
    assert.equal((await req('/api/stem/enquiries',{method:'POST',data:payload,headers:{'Idempotency-Key':crypto.randomUUID()}})).status,429);
  }finally{db.close();}
});
test('STEM builds from root and Cloudflare project root without shipping private source',()=>{
  execFileSync(process.execPath,['scripts/build-stem.mjs']);
  execFileSync(process.execPath,['../scripts/build-stem.mjs'],{cwd:resolve('stem-maths')});
  for(const file of ['index.html','app.js','styles.css','_worker.js','_routes.json','assets/logo.png','assets/teacher-le-nga.jpg'])assert.equal(existsSync('stem-maths/dist-stem/'+file),true);
  for(const file of ['server.mjs','stem-api.mjs','security.mjs','edge-rate-limit.mjs','wrangler.toml','package.json','.env','data/landing.sqlite','database/migrations/005-stem-maths.sql'])assert.equal(existsSync('stem-maths/dist-stem/'+file),false);
});
