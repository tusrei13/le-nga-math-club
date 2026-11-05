import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seed } from '../database/seed.mjs';
import { bookVideos } from '../book-video-data.js';
import { bookPreviews } from '../database/book-previews.mjs';
import { createHash, randomBytes } from 'node:crypto';
import worker from '../cloudflare/worker.mjs';
class D1 {
  constructor({reference=true}={}){this.db=new DatabaseSync(':memory:');for(const file of ['database/schema.sql','database/admin-schema.sql','database/customer-schema.sql','cloudflare/edge-schema.sql'])this.db.exec(readFileSync(file,'utf8'));seed(this.db,{reference});}
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
    const landing=await (await req('/api/landing')).json();assert.equal(landing.products.length,21);assert.deepEqual(landing.testimonials,[]);
    assert.equal((await req('/api/admin/orders')).status,401);
    assert.equal((await req('/api/auth/login','POST',{username:'admin',password:'wrong'})).status,401);
    assert.equal((await req('/api/auth/login','POST',{username:'admin',password},{Origin:'https://evil.test'})).status,403);
    const login=await req('/api/auth/login','POST',{username:'admin',password});assert.equal(login.status,200);const auth=await login.json();const cookie=login.headers.get('Set-Cookie').split(';')[0];assert.match(login.headers.get('Set-Cookie'),/Secure/);
    const admin={Cookie:cookie,'X-CSRF-Token':auth.csrf_token};
    const payload={name:'Nguyễn An',phone:'0989066885',grade:6,address:'Hà Nội',items:[{product_id:'phan-dang-6-bo-2-tap',quantity:2}],total_vnd:1};const key={'Idempotency-Key':crypto.randomUUID()};
    const created=await req('/api/orders','POST',payload,key);assert.equal(created.status,201);const receipt=await created.json();assert.equal(receipt.total_vnd,538000);assert.equal(receipt.phone,undefined);
    assert.equal((await req('/api/orders','POST',payload,key)).status,200);assert.equal((await req('/api/orders','POST',{...payload,address:'Khác'},key)).status,409);
    const invalid=await req('/api/orders','POST',{...payload,items:[{product_id:'phan-dang-6-bo-2-tap',quantity:2},{product_id:'missing',quantity:1}]},{'Idempotency-Key':crypto.randomUUID()});assert.equal(invalid.status,400);assert.equal(d1.db.prepare('SELECT count(*) n FROM orders').get().n,1);
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
  const d1=new D1({reference:false});
  try {
    d1.db.exec("UPDATE products SET price_vnd=119000; UPDATE gifts SET active=1;");
    const payload={name:'Parent',phone:'0989066885',grade:6,address:'Hà Nội',items:[{product_id:'toan-6-tap-1',quantity:2}]};
    const response=await worker.fetch(new Request('https://books.pages.dev/api/orders',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify(payload)}),{DB:d1});
    assert.equal(response.status,201);assert.equal((await response.json()).total_vnd,238000);
    const migration=readFileSync('database/migrations/004-catalog-corrections.sql','utf8');
    d1.db.exec(migration);
    assert.equal(d1.db.prepare('SELECT count(*) AS n FROM products WHERE price_vnd=299000').get().n,9);
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
  for(const file of ['_worker.js','index.html','admin.html','assets/logo.png'])assert.equal(existsSync(join('dist',file)),true);
  for(const preview of bookPreviews){
    const source=readFileSync(join('public/assets/books preview',preview.file));
    assert.ok(readFileSync(join('dist/assets/books preview',preview.file)).equals(source),'Deployed sample differs: '+preview.id);
  }
  for(const config of Object.values(bookVideos))for(const path of [config.src,config.poster])assert.ok(readFileSync(join('dist',path)).equals(readFileSync(join('public',path))),'Video asset differs: '+path);
  for(const file of ['book-videos.js','book-videos.css','book-video-data.js'])assert.ok(existsSync(join('dist',file)));
  const scratch=mkdtempSync(join(tmpdir(),'le-nga-backup-')),source=join(scratch,'source.sqlite'),target=join(scratch,'backup.sqlite');
  try{const db=new DatabaseSync(source);db.exec("PRAGMA journal_mode=WAL;CREATE TABLE sample(value TEXT);INSERT INTO sample VALUES('saved');");execFileSync(process.execPath,['database/backup.mjs',target],{env:{...process.env,DATABASE_PATH:source}});const copy=new DatabaseSync(target);assert.equal(copy.prepare('SELECT value FROM sample').get().value,'saved');copy.close();db.close();}finally{rmSync(scratch,{recursive:true,force:true});}
});


test('Retiring a book preserves order snapshots, rejects purchases and survives reseeding',async()=>{
  const d1=new D1({reference:false}),db=d1.db;
  try {
    const retired='200-bai-hinh-vao-6',title='200 bài hình học thi vào lớp 6 Chất lượng cao';
    db.prepare("INSERT INTO products(id,slug,title,category,grade,description,price_vnd) VALUES(?,?,?,'thi-vao-6',5,'Historical book',299000)").run(retired,retired,title);
    db.prepare("INSERT INTO product_media(product_id,kind,url) VALUES(?,'cover','/assets/books/200_bai_hinh_hoc_thi_vao_lop_6_clc.jpg')").run(retired);
    db.exec("INSERT INTO orders(id,request_key,request_hash,parent_name,phone,grade,address,subtotal_vnd,shipping_vnd,total_vnd) VALUES('legacy-order','legacy-request','hash','Test parent','0989066885',5,'Test address',598000,0,598000)");
    db.prepare("INSERT INTO order_items(order_id,product_id,title,unit_price_vnd,quantity) VALUES('legacy-order',?,?,299000,2)").run(retired,title);
    db.exec("INSERT INTO request_history(order_id,to_status) VALUES('legacy-order','pending')");
    const snapshot=db.prepare("SELECT * FROM order_items WHERE order_id='legacy-order'").get();
    const migration=readFileSync('database/migrations/006-retire-geometry-book.sql','utf8');
    db.exec(migration);
    assert.equal(db.prepare('SELECT active FROM products WHERE id=?').get(retired).active,0);
    assert.equal(db.prepare("SELECT count(*) n FROM product_media WHERE product_id=? AND kind='cover'").get(retired).n,0);
    seed(db,{reference:false});db.exec(migration);
    assert.equal(db.prepare('SELECT active FROM products WHERE id=?').get(retired).active,0);
    assert.equal(db.prepare("SELECT count(*) n FROM product_media WHERE product_id=? AND kind='cover'").get(retired).n,0);
    assert.deepEqual(db.prepare("SELECT * FROM order_items WHERE order_id='legacy-order'").get(),snapshot);
    assert.equal(db.prepare("SELECT total_vnd FROM orders WHERE id='legacy-order'").get().total_vnd,598000);
    assert.equal(db.prepare("SELECT count(*) n FROM request_history WHERE order_id='legacy-order'").get().n,1);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
    const env={DB:d1},origin='https://books.pages.dev';
    const catalog=await (await worker.fetch(new Request(origin+'/api/products'),env)).json();
    assert.equal(catalog.products.length,13);
    assert.equal(catalog.products.some(p=>p.id===retired),false);
    const response=await worker.fetch(new Request(origin+'/api/orders',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,'Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({name:'Test parent',phone:'0989066885',grade:5,address:'Test address',items:[{product_id:retired,quantity:1}]})}),env);
    assert.equal(response.status,400);
    assert.equal(db.prepare('SELECT count(*) n FROM orders').get().n,1);
    assert.equal(db.prepare('SELECT count(*) n FROM schema_versions WHERE version=6').get().n,1);
  } finally {db.close();}
});


test('Book preview migration replaces legacy samples once and preserves orders and later edits',async()=>{
  const d1=new D1({reference:false}),db=d1.db,env={DB:d1};
  try {
    db.exec("UPDATE product_media SET url='/assets/trang-mau-toan.pdf',alt='Legacy generic sample' WHERE kind='sample' AND product_id NOT LIKE 'sieu-nhan-tap-%'; UPDATE products SET price_vnd=305000 WHERE id='toan-6-tap-1';");
    const created=await worker.fetch(new Request('https://books.pages.dev/api/orders',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({name:'Test parent',phone:'0989066885',grade:6,address:'Test address',items:[{product_id:'toan-6-tap-1',quantity:1}]})}),env);
    assert.equal(created.status,201);
    const receipt=await created.json(),snapshot=db.prepare('SELECT * FROM order_items WHERE order_id=?').get(receipt.id);
    const migration=readFileSync('database/migrations/007-book-previews.sql','utf8');
    db.exec(migration);
    for(const preview of bookPreviews){
      const rows=db.prepare("SELECT url,alt FROM product_media WHERE product_id=? AND kind='sample'").all(preview.id);
      assert.equal(rows.length,1);assert.equal(rows[0].url,preview.url);assert.match(rows[0].alt,/^Bản đọc thử /);
    }
    assert.equal(new Set(db.prepare("SELECT url FROM product_media WHERE kind='sample'").all().map(row=>row.url)).size,13);
    assert.deepEqual(db.prepare('SELECT * FROM order_items WHERE order_id=?').get(receipt.id),snapshot);
    assert.equal(db.prepare('SELECT total_vnd FROM orders WHERE id=?').get(receipt.id).total_vnd,305000);
    assert.equal(db.prepare("SELECT price_vnd FROM products WHERE id='toan-6-tap-1'").get().price_vnd,305000);
    db.prepare("UPDATE product_media SET url=? WHERE product_id='toan-6-tap-1' AND kind='sample'").run('/assets/later-admin-sample.pdf');
    db.exec(migration);seed(db,{reference:false});
    assert.equal(db.prepare("SELECT url FROM product_media WHERE product_id='toan-6-tap-1' AND kind='sample'").get().url,'/assets/later-admin-sample.pdf');
    assert.equal(db.prepare('SELECT count(*) n FROM schema_versions WHERE version=7').get().n,1);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  } finally {db.close();}
});

test('Four primary maths books upgrade an existing D1 catalog once and preserve edits and order snapshots',async()=>{
 const d1=new D1({reference:false}),db=d1.db;
 try{
  db.exec("PRAGMA foreign_keys=ON; DELETE FROM product_media WHERE product_id LIKE 'sieu-nhan-tap-%'; DELETE FROM products WHERE id LIKE 'sieu-nhan-tap-%';");
  db.prepare("INSERT INTO orders(id,request_key,request_hash,parent_name,phone,grade,address,subtotal_vnd,shipping_vnd,total_vnd) VALUES('before-new-books','before-new-books','hash','Parent','0912345678',6,'Address',299000,0,299000)").run();
  db.prepare("INSERT INTO order_items(order_id,product_id,title,unit_price_vnd,quantity) VALUES('before-new-books','toan-6-tap-1','Historical title',299000,1)").run();
  const before=db.prepare("SELECT * FROM order_items WHERE order_id='before-new-books'").get();
  db.prepare("UPDATE products SET price_vnd=315000 WHERE id='toan-6-tap-1'").run();
  const migration=readFileSync('database/migrations/009-primary-maths-books.sql','utf8');db.exec(migration);
  assert.equal(db.prepare('SELECT count(*) n FROM products WHERE active=1').get().n,13);
  for(let n=1;n<=4;n++){
   const id='sieu-nhan-tap-'+n,p=db.prepare('SELECT * FROM products WHERE id=?').get(id);
   assert.equal(p.price_vnd,299000);assert.equal(p.category,'thi-vao-6');assert.ok(p.title.endsWith('Tập '+n));
   assert.equal(db.prepare('SELECT count(*) n FROM product_media WHERE product_id=?').get(id).n,2);
  }
  db.prepare("UPDATE products SET price_vnd=319000,active=0 WHERE id='sieu-nhan-tap-4'").run();
  db.exec(migration);seed(db,{reference:false});
  assert.equal(db.prepare("SELECT price_vnd FROM products WHERE id='sieu-nhan-tap-4'").get().price_vnd,319000);
  assert.equal(db.prepare("SELECT active FROM products WHERE id='sieu-nhan-tap-4'").get().active,0);
  assert.equal(db.prepare("SELECT price_vnd FROM products WHERE id='toan-6-tap-1'").get().price_vnd,315000);
  assert.deepEqual(db.prepare("SELECT * FROM order_items WHERE order_id='before-new-books'").get(),before);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  const payload={name:'Parent',phone:'0912345678',grade:5,address:'Address',items:[{product_id:'sieu-nhan-tap-3',quantity:1}],consent:true};
  const response=await worker.fetch(new Request('https://books.pages.dev/api/orders',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':'new-primary-book-request-123456'},body:JSON.stringify(payload)}),{DB:d1});
  assert.equal(response.status,400);assert.match((await response.json()).error,/liên hệ/);
 }finally{db.close();}
});

test('Reference migration preserves old snapshots, retires individual volumes and is idempotent',()=>{
 const d1=new D1({reference:false}),db=d1.db;
 try{
  for(const version of ['004-catalog-corrections.sql','006-retire-geometry-book.sql','007-book-previews.sql','009-primary-maths-books.sql'])db.exec(readFileSync('database/migrations/'+version,'utf8'));
  db.exec("INSERT INTO orders(id,request_key,request_hash,parent_name,phone,grade,address,subtotal_vnd,shipping_vnd,total_vnd) VALUES('legacy','legacy-ref-request','hash','Parent','0912345678',6,'Address',299000,0,299000);INSERT INTO order_items(order_id,product_id,title,unit_price_vnd,quantity) VALUES('legacy','toan-6-tap-1','Historical individual volume',299000,1)");
  const before=db.prepare("SELECT * FROM order_items WHERE order_id='legacy'").get(),migration=readFileSync('database/migrations/010-reference-catalog.sql','utf8');
  db.exec(migration);assert.equal(db.prepare('SELECT count(*) n FROM products WHERE active=1').get().n,21);
  assert.equal(db.prepare("SELECT sum(active) n FROM products WHERE id LIKE 'toan-%-tap-%'").get().n,0);
  assert.deepEqual(db.prepare("SELECT * FROM order_items WHERE order_id='legacy'").get(),before);
  db.exec("UPDATE products SET price_vnd=280000 WHERE id='phan-dang-6-bo-2-tap';UPDATE faqs SET answer='Later admin answer' WHERE id='solutions'");
  db.exec(migration);seed(db);
  assert.equal(db.prepare("SELECT price_vnd FROM products WHERE id='phan-dang-6-bo-2-tap'").get().price_vnd,280000);
  assert.equal(db.prepare("SELECT answer FROM faqs WHERE id='solutions'").get().answer,'Later admin answer');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{db.close();}
});
test('Reference prices, enquiry-only items, expired offers and preorder shipping are enforced by D1',async()=>{
 const {catalogProduct,referenceCatalog}=await import('../reference-catalog.mjs'),d1=new D1();
 const person={name:'Parent',phone:'0912345678',grade:6,address:'Address'};
 const req=items=>worker.fetch(new Request('https://books.pages.dev/api/orders',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({...person,items})}),{DB:d1});
 try{
  for(const id of ['sieu-nhan-tap-1','phan-dang-9-bo-2-tap','tai-lieu-t5combo','toan-6-tap-1'])assert.equal((await req([{product_id:id,quantity:1}])).status,400,'must not accept '+id);
  const bundle=referenceCatalog.find(p=>p.id==='phan-dang-6-bo-2-tap'),row={id:bundle.id,price_vnd:269000};
  assert.equal(catalogProduct(row,Date.parse('2026-11-05')).price_vnd,269000);
  assert.equal(catalogProduct(row,Date.parse('2026-12-01')).price_vnd,299000);
  assert.equal(catalogProduct({...row,price_vnd:280000},Date.parse('2026-12-01')).price_vnd,280000);
  const policy=JSON.parse(d1.db.prepare("SELECT value_json FROM site_content WHERE key='sales_policy'").get().value_json);policy.shipping_vnd=25000;d1.db.prepare("UPDATE site_content SET value_json=? WHERE key='sales_policy'").run(JSON.stringify(policy));
  const free=await req([{product_id:'70-de-vao-6',quantity:2}]);assert.equal(free.status,201);const receipt=await free.json();assert.equal(receipt.shipping_vnd,0);assert.equal(receipt.total_vnd,498000);
  const mixed=await req([{product_id:'70-de-vao-6',quantity:1},{product_id:bundle.id,quantity:1}]);assert.equal(mixed.status,201);assert.equal((await mixed.json()).total_vnd,543000);
 }finally{d1.db.close();}
});
