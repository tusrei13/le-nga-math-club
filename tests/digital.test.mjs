import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {digitalPreviews} from '../digital-catalog.mjs';
import {handleDigitalApi,digitalSummary} from '../digital-api.mjs';
import {sqliteD1} from '../database/d1-adapter.mjs';
import worker from '../cloudflare/worker.mjs';

const origin='https://books.pages.dev';
const req=(path,method='GET',data,headers={})=>new Request(origin+path,{method,headers:{...(data?{'Content-Type':'application/json'}:{}),...headers},body:data?JSON.stringify(data):undefined});
function fixture(){
 const db=new DatabaseSync(':memory:');
 for(const name of ['database/schema.sql','database/admin-schema.sql','database/customer-schema.sql','cloudflare/edge-schema.sql','database/migrations/008-digital-documents.sql'])db.exec(readFileSync(name,'utf8'));
 return {db,d1:sqliteD1(db)};
}
test('Public catalog maps all 31 actual PDF samples once, including four Toan 3 previews',()=>{
 assert.equal(digitalPreviews.length,17);const urls=digitalPreviews.flatMap(p=>p.files.map(f=>f.url));assert.equal(urls.length,31);assert.equal(new Set(urls).size,31);
 const actual=readdirSync('public/assets/documents/previews',{recursive:true}).filter(f=>String(f).endsWith('.pdf')).map(f=>'/assets/documents/previews/'+String(f).replaceAll('\\','/'));
 assert.deepEqual([...urls].sort(),actual.sort());
 for(const p of digitalPreviews){assert.equal(p.file_count,p.files.length);assert.equal(p.preview_only,true);assert.ok(p.grade>=3&&p.grade<=9);
  for(const f of p.files){assert.match(f.url,/^\/assets\/documents\/previews\/lop-[3-9]\/[A-Za-z0-9_./-]+\.pdf$/);assert.ok(f.url.includes('/lop-'+p.grade+'/'));assert.equal(readFileSync('public'+f.url).subarray(0,5).toString(),'%PDF-');assert.equal(statSync('public'+f.url).size,f.size_bytes);assert.ok(f.size_bytes<25*1024*1024);}
 }
});
test('Catalog works without a digital database or Supabase and exposes no provisional prices',async()=>{
 const response=await handleDigitalApi(req('/api/digital/products'),null,{},undefined),data=await response.json();
 assert.equal(response.status,200);assert.equal(data.mode,'public-previews');assert.equal(data.checkout_enabled,false);assert.equal(data.products.length,17);
 assert.equal(response.headers.get('Cache-Control'),'no-store');
 assert.doesNotMatch(JSON.stringify(data),/price_vnd|supabase|bank_name|signedURL|customer_id|object_key/i);
});
test('Retired checkout and signed download routes fail closed even with stale storage secrets',async()=>{
 const original=globalThis.fetch;globalThis.fetch=()=>{throw Error('Unexpected network request');};
 try{for(const path of ['/api/digital/orders','/api/customer/digital-orders/TL-old/files/old-file/download']){
  await assert.rejects(()=>handleDigitalApi(req(path,'POST',{}),null,{SUPABASE_SECRET_KEY:'stale-key'},undefined),e=>e.status===410);
 }}finally{globalThis.fetch=original;}
});
test('Admin catalog is readonly; worker still enforces login and CSRF on retired settings',async()=>{
 const f=fixture(),password='a'.repeat(64);try{
  f.db.prepare('INSERT INTO admin_users(id,username,password_hash) VALUES(?,?,?)').run('admin','admin','token-sha256:'+createHash('sha256').update(password).digest('hex'));
  const env={DB:f.d1};
  assert.equal((await worker.fetch(req('/api/admin/digital-products'),env)).status,401);
  const login=await worker.fetch(req('/api/auth/login','POST',{username:'admin',password}),env);assert.equal(login.status,200);
  const auth=await login.json(),headers={Cookie:login.headers.get('Set-Cookie').split(';')[0],'X-CSRF-Token':auth.csrf_token};
  const result=await worker.fetch(req('/api/admin/digital-products','GET',undefined,headers),env);
  assert.equal(result.status,200);assert.equal((await result.json()).readonly,true);
  assert.equal((await worker.fetch(req('/api/admin/digital-settings','PATCH',{accept_orders:true},{Cookie:headers.Cookie}),env)).status,403);
  assert.equal((await worker.fetch(req('/api/admin/digital-settings','PATCH',{accept_orders:true},headers),env)).status,410);
  assert.equal((await worker.fetch(req('/api/admin/digital-products/g4-tong-hieu','PATCH',{is_draft:false},headers),env)).status,410);
  const preview=await worker.fetch(new Request('https://preview.books.pages.dev/api/digital/products'),env);assert.equal(preview.status,200);
 }finally{f.db.close();}
});
test('Historical orders are preserved, cannot be marked paid, and can be cancelled or revoked',async()=>{
 const f=fixture(),admin={username:'admin'};try{
  f.db.prepare("INSERT INTO digital_orders(id,customer_id,product_id,title,grade,parent_name,email,phone,amount_vnd,request_key,request_hash) VALUES(?,?,?,?,?,?,?,?,?,?,?)").run('TL-old','old-owner','g4-tong-hieu','Old order',4,'Parent','parent@example.test','0912345678',39000,'old-key-123456789','old-hash');
  const details=await(await handleDigitalApi(req('/api/admin/digital-orders/TL-old'),f.d1,{},admin)).json();assert.deepEqual(details.allowed_statuses,['cancelled']);assert.equal(details.customer_id,undefined);assert.equal(details.request_key,undefined);
  await assert.rejects(()=>handleDigitalApi(req('/api/admin/digital-orders/TL-old/status','PATCH',{expected_version:1,expected_status:'pending',status:'paid',payment_verified:true}),f.d1,{},admin),e=>e.status===400);
  await handleDigitalApi(req('/api/admin/digital-orders/TL-old/status','PATCH',{expected_version:1,expected_status:'pending',status:'cancelled',note:'Reading samples are free'}),f.d1,{},admin);
  assert.equal(f.db.prepare('SELECT count(*) n FROM digital_orders').get().n,1);assert.equal(f.db.prepare('SELECT status FROM digital_orders').get().status,'cancelled');
  assert.deepEqual(await digitalSummary(f.d1),{cancelled:1});
  assert.equal(f.db.prepare('SELECT note FROM digital_order_history').get().note,'Reading samples are free');
 }finally{f.db.close();}
});

test('Historical customer receipts remain isolated by the verified Firebase owner',async()=>{
 const f=fixture(),originalFetch=globalThis.fetch,project='preview-history';
 const env={FIREBASE_API_KEY:'test-only',FIREBASE_PROJECT_ID:project,FIREBASE_AUTH_DOMAIN:project+'.firebaseapp.com'};
 const token=uid=>Buffer.from('{"alg":"RS256"}').toString('base64url')+'.'+Buffer.from(JSON.stringify({aud:project,iss:'https://securetoken.google.com/'+project,sub:uid,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.signature';
 globalThis.fetch=async(url,options)=>{
   assert.ok(String(url).startsWith('https://identitytoolkit.googleapis.com/'),'Only Firebase is consulted');
   const uid=JSON.parse(Buffer.from(JSON.parse(options.body).idToken.split('.')[1],'base64url')).sub;
   return Response.json({users:[{localId:uid,email:uid+'@example.test'}]});
 };
 try{
  f.db.prepare("INSERT INTO digital_orders(id,customer_id,product_id,title,grade,parent_name,email,phone,amount_vnd,request_key,request_hash) VALUES(?,?,?,?,?,?,?,?,?,?,?)").run('TL-alice',project+':alice','g4-tong-hieu','Historical order',4,'Alice','alice@example.test','0912345678',39000,'history-request-key','hash');
  await assert.rejects(()=>handleDigitalApi(req('/api/customer/digital-orders'),f.d1,env),e=>e.status===401);
  const own=await(await handleDigitalApi(req('/api/customer/digital-orders','GET',undefined,{Authorization:'Bearer '+token('alice')}),f.d1,env)).json();
  const other=await(await handleDigitalApi(req('/api/customer/digital-orders','GET',undefined,{Authorization:'Bearer '+token('bob')}),f.d1,env)).json();
  assert.equal(own.orders.length,1);assert.equal(other.orders.length,0);assert.equal(own.payment.enabled,false);
  assert.doesNotMatch(JSON.stringify(own),/object_key|signedURL|bank_name|request_hash|customer_id/);
 }finally{globalThis.fetch=originalFetch;f.db.close();}
});
