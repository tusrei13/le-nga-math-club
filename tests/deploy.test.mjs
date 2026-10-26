import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seed } from '../database/seed.mjs';
import { createHash, randomBytes } from 'node:crypto';
import worker from '../cloudflare/worker.mjs';
class D1 {
  constructor(){this.db=new DatabaseSync(':memory:');for(const file of ['database/schema.sql','database/admin-schema.sql','database/customer-schema.sql','cloudflare/edge-schema.sql'])this.db.exec(readFileSync(file,'utf8'));seed(this.db);}
  prepare(sql) {
    const db=this.db;
    return { bind(...args) { return {
      first:async()=>db.prepare(sql).get(...args)||null,
      all:async()=>({results:db.prepare(sql).all(...args)}),
      run:async()=>({meta:{changes:db.prepare(sql).run(...args).changes}})
    }; } };
  }
  async batch(statements){this.db.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());this.db.exec('COMMIT');return result;}catch(e){this.db.exec('ROLLBACK');throw e;}}
}
test('Pages D1 orders, private receipts, random-key login, CSRF, logout and replay',async()=>{
  const d1=new D1(),env={DB:d1};const password=randomBytes(32).toString('hex'),digest=createHash('sha256').update(password).digest('hex');
  d1.db.prepare('INSERT INTO admin_users(id,username,password_hash) VALUES(?,?,?)').run('u','admin','token-sha256:'+digest);
  async function req(path,method='GET',data,headers={}){return worker.fetch(new Request('https://books.pages.dev'+path,{method,headers:{'Content-Type':'application/json',...headers},body:data?JSON.stringify(data):undefined}),env);}
  try {
    assert.equal((await req('/healthz')).status,200);
    const landing=await (await req('/api/landing')).json();assert.equal(landing.products.length,10);assert.deepEqual(landing.testimonials,[]);
    assert.equal((await req('/api/admin/orders')).status,401);
    assert.equal((await req('/api/auth/login','POST',{username:'admin',password:'wrong'})).status,401);
    assert.equal((await req('/api/auth/login','POST',{username:'admin',password},{Origin:'https://evil.test'})).status,403);
    const login=await req('/api/auth/login','POST',{username:'admin',password});assert.equal(login.status,200);const auth=await login.json();const cookie=login.headers.get('Set-Cookie').split(';')[0];assert.match(login.headers.get('Set-Cookie'),/Secure/);
    const admin={Cookie:cookie,'X-CSRF-Token':auth.csrf_token};
    const payload={name:'Nguyễn An',phone:'0989066885',grade:6,address:'Hà Nội',items:[{product_id:'toan-6-tap-1',quantity:2}],total_vnd:1};const key={'Idempotency-Key':crypto.randomUUID()};
    const created=await req('/api/orders','POST',payload,key);assert.equal(created.status,201);const receipt=await created.json();assert.equal(receipt.total_vnd,598000);assert.equal(receipt.phone,undefined);
    assert.equal((await req('/api/orders','POST',payload,key)).status,200);assert.equal((await req('/api/orders','POST',{...payload,address:'Khác'},key)).status,409);
    const invalid=await req('/api/orders','POST',{...payload,items:[{product_id:'toan-6-tap-1',quantity:2},{product_id:'missing',quantity:1}]},{'Idempotency-Key':crypto.randomUUID()});assert.equal(invalid.status,400);assert.equal(d1.db.prepare('SELECT count(*) n FROM orders').get().n,1);
    assert.equal((await req(`/api/admin/orders/${receipt.id}/status`,'PATCH',{status:'confirmed'},{Cookie:cookie})).status,403);
    assert.equal((await req(`/api/admin/orders/${receipt.id}/status`,'PATCH',{status:'confirmed',expected_status:'pending'},admin)).status,200);
    assert.equal((await req(`/api/admin/orders/${receipt.id}/status`,'PATCH',{status:'shipping',expected_status:'pending'},admin)).status,409);
    const details=await (await req(`/api/admin/orders/${receipt.id}`,'GET',undefined,admin)).json();assert.equal(details.items.length,1);assert.equal(details.history.length,2);
    const list=await (await req('/api/admin/orders?q=0989&status=confirmed','GET',undefined,admin)).json();assert.equal(list.total,1);
    assert.equal((await req('/api/consultations','POST',{name:'An',phone:'0989066885',grade:5},{'Idempotency-Key':crypto.randomUUID()})).status,201);
    assert.equal((await req('/api/auth/logout','POST',{},admin)).status,200);assert.equal((await req('/api/admin/orders','GET',undefined,admin)).status,401);
  } finally { d1.db.close(); }
});
test('Catalog corrections update existing prices once and preserve order snapshots and later edits',async()=>{
  const d1=new D1();
  try {
    d1.db.exec("UPDATE products SET price_vnd=119000; UPDATE gifts SET active=1;");
    const payload={name:'Parent',phone:'0989066885',grade:6,address:'Hà Nội',items:[{product_id:'toan-6-tap-1',quantity:2}]};
    const response=await worker.fetch(new Request('https://books.pages.dev/api/orders',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify(payload)}),{DB:d1});
    assert.equal(response.status,201);assert.equal((await response.json()).total_vnd,238000);
    const migration=readFileSync('database/migrations/004-catalog-corrections.sql','utf8');
    d1.db.exec(migration);
    assert.equal(d1.db.prepare('SELECT count(*) AS n FROM products WHERE price_vnd=299000').get().n,10);
    assert.equal(d1.db.prepare('SELECT count(*) AS n FROM gifts WHERE active=1').get().n,0);
    assert.equal(d1.db.prepare('SELECT unit_price_vnd FROM order_items').get().unit_price_vnd,119000);
    assert.equal(d1.db.prepare('SELECT total_vnd FROM orders').get().total_vnd,238000);
    d1.db.exec("UPDATE products SET price_vnd=305000 WHERE id='toan-6-tap-1'");
    d1.db.exec(migration);
    assert.equal(d1.db.prepare("SELECT price_vnd FROM products WHERE id='toan-6-tap-1'").get().price_vnd,305000);
  }finally{d1.db.close();}
});

test('Pages admin login accepts a chosen password only for the Firebase UID granted in D1',async()=>{
  const d1=new D1();const original=globalThis.fetch;
  const env={DB:d1,FIREBASE_API_KEY:'test-key',FIREBASE_PROJECT_ID:'test-project',FIREBASE_AUTH_DOMAIN:'test-project.firebaseapp.com'};
  const password=' A custom test passphrase ';
  d1.db.prepare('INSERT INTO admin_users(id,username,password_hash) VALUES(?,?,?)').run('admin-user','owner','firebase-auth:'+JSON.stringify({uid:'owner-uid',email:'owner@example.test',projectId:'test-project'}));
  const login=value=>worker.fetch(new Request('https://books.pages.dev/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'owner',password:value})}),env);
  try{
    globalThis.fetch=async(_url,options)=>JSON.parse(options.body).password===password?new Response('{"localId":"owner-uid"}'):new Response('{"error":{"message":"INVALID_PASSWORD"}}',{status:400});
    assert.equal((await login('wrong')).status,401);
    const success=await login(password);assert.equal(success.status,200);const cookie=success.headers.get('Set-Cookie').split(';')[0];
    assert.equal((await worker.fetch(new Request('https://books.pages.dev/api/admin/summary',{headers:{Cookie:cookie}}),env)).status,200);
    globalThis.fetch=async()=>new Response('{"localId":"not-an-admin"}');assert.equal((await login(password)).status,401);
  }finally{globalThis.fetch=original;d1.db.close();}
});
test('Pages output excludes private files and SQLite online backups preserve rows',()=>{
  execFileSync(process.execPath,['scripts/build-pages.mjs']);
  for(const file of ['server.mjs','api.mjs','auth.mjs','database/db.mjs','data/landing.sqlite','.env'])assert.equal(existsSync(join('dist',file)),false);
  for(const file of ['_worker.js','index.html','admin.html','assets/book-stack.png'])assert.equal(existsSync(join('dist',file)),true);
  const scratch=mkdtempSync(join(tmpdir(),'le-nga-backup-')),source=join(scratch,'source.sqlite'),target=join(scratch,'backup.sqlite');
  try{const db=new DatabaseSync(source);db.exec("PRAGMA journal_mode=WAL;CREATE TABLE sample(value TEXT);INSERT INTO sample VALUES('saved');");execFileSync(process.execPath,['database/backup.mjs',target],{env:{...process.env,DATABASE_PATH:source}});const copy=new DatabaseSync(target);assert.equal(copy.prepare('SELECT value FROM sample').get().value,'saved');copy.close();db.close();}finally{rmSync(scratch,{recursive:true,force:true});}
});
