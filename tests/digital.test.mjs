import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {sqliteD1} from '../database/d1-adapter.mjs';
import {seed} from '../database/seed.mjs';
import worker from '../cloudflare/worker.mjs';
import {validObjectKey} from '../digital-api.mjs';

const project='digital-test';
const envBase={FIREBASE_API_KEY:'firebase-test',FIREBASE_PROJECT_ID:project,FIREBASE_AUTH_DOMAIN:project+'.firebaseapp.com',SUPABASE_URL:'https://qyyhdfmlvmuqqcihoejg.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_only-for-automated-testing-123456789'};
const jwt=uid=>Buffer.from('{"alg":"RS256"}').toString('base64url')+'.'+Buffer.from(JSON.stringify({aud:project,iss:'https://securetoken.google.com/'+project,sub:uid,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.signature';
function fixture(){
  const db=new DatabaseSync(':memory:');
  for(const file of ['database/schema.sql','database/admin-schema.sql','database/customer-schema.sql','cloudflare/edge-schema.sql','database/migrations/008-digital-documents.sql'])db.exec(readFileSync(file,'utf8'));
  seed(db);
  const password='a'.repeat(64);db.prepare('INSERT INTO admin_users(id,username,password_hash) VALUES(?,?,?)').run('admin-digital','admin','token-sha256:'+createHash('sha256').update(password).digest('hex'));
  const env={...envBase,DB:sqliteD1(db)},originalFetch=globalThis.fetch,signs=[];
  let onSign,signResult;
  globalThis.fetch=async(url,options)=>{
    if(String(url).startsWith('https://identitytoolkit.googleapis.com/')){
      const token=JSON.parse(options.body).idToken,uid=JSON.parse(Buffer.from(token.split('.')[1],'base64url')).sub;
      return Response.json({users:[{localId:uid,email:uid+'@example.test',displayName:'Test '+uid}]});
    }
    if(String(url).startsWith(envBase.SUPABASE_URL+'/storage/v1/object/sign/paid-documents/')){
      signs.push({url:String(url),options});
      if(onSign)await onSign();
      if(signResult)return signResult();
      return Response.json({signedURL:new URL(url).pathname.replace('/storage/v1','')+'?token=test-only-signed-token'});
    }
    throw new Error('Unexpected external request');
  };
  const req=(path,{method='GET',data,uid,headers={}}={})=>worker.fetch(new Request('https://books.test'+path,{method,headers:{'Content-Type':'application/json',...(uid?{Authorization:'Bearer '+jwt(uid)}:{}),...headers},body:data===undefined?undefined:JSON.stringify(data)}),env);
  const admin=async()=>{const response=await req('/api/auth/login',{method:'POST',data:{username:'admin',password}});assert.equal(response.status,200);const session=await response.json();return {Cookie:response.headers.get('Set-Cookie').split(';')[0],'X-CSRF-Token':session.csrf_token};};
  const products=async headers=>(await(await req('/api/admin/digital-products',{headers})).json()).products;
  const publish=async(headers,id='g4-tong-hieu')=>{
    const p=(await products(headers)).find(p=>p.id===id);
    const response=await req('/api/admin/digital-products/'+id,{method:'PATCH',headers,data:{...p,expected_version:p.version,is_draft:false}});
    assert.equal(response.status,200,await response.text());
    return (await products(headers)).find(p=>p.id===id);
  };
  const enable=async headers=>{
    const s=await(await req('/api/admin/digital-settings',{headers})).json();
    const response=await req('/api/admin/digital-settings',{method:'PATCH',headers,data:{...s,expected_version:s.version,bank_name:'TEST BANK',account_number:'TEST123456',account_holder:'TEST ONLY',instructions:'Automated test configuration.',accept_orders:true}});
    assert.equal(response.status,200,await response.text());
  };
  const orderInput=p=>({product_id:p.id,expected_price_vnd:p.price_vnd,expected_version:p.version,name:'Test Parent',phone:'0989066885',consent:true,customer_id:project+':bob',amount_vnd:1});
  const order=async(p,uid='alice',key=crypto.randomUUID())=>{
    const response=await req('/api/digital/orders',{method:'POST',uid,headers:{'Idempotency-Key':key},data:orderInput(p)});
    assert.equal(response.status,201,await response.clone().text());return response.json();
  };
  const status=async(headers,row,next,extra={})=>{
    const current=db.prepare('SELECT version,status FROM digital_orders WHERE id=?').get(row.id);
    return req('/api/admin/digital-orders/'+row.id+'/status',{method:'PATCH',headers,data:{status:next,expected_status:current.status,expected_version:current.version,payment_verified:true,...extra}});
  };
  return {db,env,req,admin,products,publish,enable,orderInput,order,status,signs,setOnSign(fn){onSign=fn;},setSignResult(fn){signResult=fn;},close(){globalThis.fetch=originalFetch;db.close();}};
}

test('Digital migration is retryable, preserves edits and excludes reading-only PDFs from sales',async()=>{
  const f=fixture();try{
    assert.equal(f.db.prepare('SELECT count(*) n FROM digital_products').get().n,14);
    assert.equal(f.db.prepare('SELECT count(*) n FROM digital_files').get().n,25);
    assert.equal(f.db.prepare('SELECT count(*) n FROM digital_products WHERE is_draft=1').get().n,14);
    assert.equal(f.db.prepare("SELECT count(*) n FROM digital_files WHERE object_key LIKE '%BanDocThu%'").get().n,0);
    const admin=await f.admin(),p=await f.publish(admin);await f.enable(admin);const order=await f.order(p);
    f.db.prepare('UPDATE digital_products SET price_vnd=59000 WHERE id=?').run(p.id);
    f.db.exec(readFileSync('database/migrations/008-digital-documents.sql','utf8'));
    assert.equal(f.db.prepare('SELECT price_vnd FROM digital_products WHERE id=?').get(p.id).price_vnd,59000);
    assert.equal(f.db.prepare('SELECT amount_vnd FROM digital_orders WHERE id=?').get(order.id).amount_vnd,39000);
    assert.equal(f.db.prepare('SELECT count(*) n FROM digital_order_history').get().n,1);
    assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{f.close();}
});

test('Public catalog hides private keys; anonymous users and draft checkout fail closed',async()=>{
  const f=fixture();try{
    const response=await f.req('/api/digital/products'),data=await response.json();
    assert.equal(response.status,200);assert.equal(data.products.length,14);assert.equal(data.checkout_enabled,false);
    const raw=JSON.stringify(data);for(const forbidden of ['object_key','paid-documents','sb_secret_','customer_id','request_hash'])assert.equal(raw.includes(forbidden),false);
    assert.equal((await f.req('/api/admin/digital-products')).status,401);
    assert.equal((await f.req('/api/customer/digital-orders')).status,401);
    assert.equal((await f.req('/api/digital/orders',{method:'POST',data:{}})).status,401);
    const p=data.products[0];
    assert.equal((await f.req('/api/digital/orders',{method:'POST',uid:'alice',headers:{'Idempotency-Key':crypto.randomUUID()},data:f.orderInput(p)})).status,409);
    assert.equal((await f.req('/api/digital/orders',{method:'POST',uid:'alice',headers:{Origin:'https://evil.test'},data:{}})).status,403);
    const preview=await worker.fetch(new Request('https://preview.books.pages.dev/api/customer/digital-orders',{headers:{Authorization:'Bearer '+jwt('alice')}}),f.env);
    assert.equal(preview.status,403);
    const previewCatalog=await worker.fetch(new Request('https://preview.books.pages.dev/api/digital/products'),f.env);
    assert.equal(previewCatalog.status,200);
    assert.equal((await previewCatalog.json()).products.length,14);
  }finally{f.close();}
});

test('Admin publication requires storage, validates filenames and protects configuration with CSRF and versions',async()=>{
  const f=fixture();try{
    const admin=await f.admin(),p=(await f.products(admin))[0],payload={...p,expected_version:p.version,is_draft:false};
    assert.equal((await f.req('/api/admin/digital-products/'+p.id,{method:'PATCH',headers:{Cookie:admin.Cookie},data:payload})).status,403);
    delete f.env.SUPABASE_SECRET_KEY;
    assert.equal((await f.req('/api/admin/digital-products/'+p.id,{method:'PATCH',headers:admin,data:payload})).status,503);
    f.env.SUPABASE_SECRET_KEY=envBase.SUPABASE_SECRET_KEY;
    const badFiles=p.files.map((file,i)=>({...file,object_key:i?'lop-3/../secret.pdf':file.object_key}));
    assert.equal((await f.req('/api/admin/digital-products/'+p.id,{method:'PATCH',headers:admin,data:{...payload,files:badFiles}})).status,400);
    assert.equal((await f.req('/api/admin/digital-products/'+p.id,{method:'PATCH',headers:admin,data:{...payload,price_vnd:1}})).status,400);
    const s=await(await f.req('/api/admin/digital-settings',{headers:admin})).json();
    assert.equal((await f.req('/api/admin/digital-settings',{method:'PATCH',headers:admin,data:{...s,expected_version:s.version,accept_orders:true}})).status,400);
    await f.publish(admin,p.id);await f.enable(admin);
    assert.equal((await f.req('/api/admin/digital-products/'+p.id,{method:'PATCH',headers:admin,data:payload})).status,409);
    assert.equal((await f.req('/api/admin/digital-settings',{method:'PATCH',headers:admin,data:{...s,expected_version:s.version,accept_orders:false}})).status,409);
    assert.equal((await(await f.req('/api/digital/products')).json()).checkout_enabled,true);
  }finally{f.close();}
});

test('Digital purchases use server prices and owners; replay is scoped to the verified customer',async()=>{
  const f=fixture();try{
    const admin=await f.admin(),p=await f.publish(admin);await f.enable(admin);
    const payload=f.orderInput(p),key=crypto.randomUUID();
    assert.equal((await f.req('/api/digital/orders',{method:'POST',uid:'alice',headers:{'Idempotency-Key':crypto.randomUUID()},data:{...payload,expected_price_vnd:1}})).status,409);
    const order=await f.order(p,'alice',key);
    assert.equal(order.amount_vnd,39000);assert.equal(order.email,undefined);assert.equal(order.customer_id,undefined);
    const stored=f.db.prepare('SELECT * FROM digital_orders WHERE id=?').get(order.id);
    assert.equal(stored.customer_id,project+':alice');assert.equal(stored.email,'alice@example.test');
    assert.equal((await f.req('/api/digital/orders',{method:'POST',uid:'alice',headers:{'Idempotency-Key':key},data:payload})).status,200);
    assert.equal((await f.req('/api/digital/orders',{method:'POST',uid:'alice',headers:{'Idempotency-Key':key},data:{...payload,name:'Different'}})).status,409);
    assert.equal((await f.req('/api/digital/orders',{method:'POST',uid:'alice',headers:{'Idempotency-Key':crypto.randomUUID()},data:payload})).status,409);
    await f.order(p,'bob',key);
    const alice=await(await f.req('/api/customer/digital-orders',{uid:'alice'})).json();
    const bob=await(await f.req('/api/customer/digital-orders',{uid:'bob'})).json();
    assert.equal(alice.orders.length,1);assert.equal(bob.orders.length,1);assert.notEqual(alice.orders[0].id,bob.orders[0].id);
    assert.equal(alice.orders[0].files,undefined);
    const list=await(await f.req('/api/admin/digital-orders?q=alice',{headers:admin})).json();assert.equal(list.total,1);
    const raw=JSON.stringify(alice);assert.equal(raw.includes('request_hash'),false);assert.equal(raw.includes('object_key'),false);
  }finally{f.close();}
});

test('Only paid owners receive short-lived download links; refunds revoke access and admin approval is explicit',async()=>{
  const f=fixture();try{
    const admin=await f.admin(),p=await f.publish(admin);await f.enable(admin);const order=await f.order(p);
    const download='/api/customer/digital-orders/'+order.id+'/files/'+p.files[0].id+'/download';
    assert.equal((await f.req(download,{method:'POST',uid:'alice',data:{}})).status,404);
    assert.equal((await f.status(admin,order,'paid',{payment_verified:false})).status,400);
    assert.equal((await f.status(admin,order,'paid')).status,200);
    const before=f.signs.length;
    assert.equal((await f.req(download,{method:'POST',uid:'bob',data:{}})).status,404);assert.equal(f.signs.length,before);
    assert.equal((await f.req(download,{method:'POST',data:{}})).status,401);
    assert.equal((await f.req(download.replace(p.files[0].id,'g9-duong-tron-file-1'),{method:'POST',uid:'alice',data:{}})).status,404);
    const response=await f.req(download,{method:'POST',uid:'alice',data:{}});assert.equal(response.status,200);
    const link=await response.json();assert.equal(link.expires_in,60);assert.ok(link.url.startsWith(envBase.SUPABASE_URL+'/storage/v1/object/sign/paid-documents/'));
    const sign=f.signs.at(-1);assert.equal(JSON.parse(sign.options.body).expiresIn,60);assert.equal(sign.options.headers.apikey,envBase.SUPABASE_SECRET_KEY);assert.equal(sign.options.headers.Authorization,undefined);assert.equal(sign.options.redirect,'error');
    assert.equal(JSON.stringify(link).includes(envBase.SUPABASE_SECRET_KEY),false);
    const library=await(await f.req('/api/customer/digital-orders',{uid:'alice'})).json();assert.equal(library.orders[0].files.length,2);
    assert.equal((await f.status(admin,order,'revoked',{note:'Test refund'})).status,200);
    assert.equal((await f.req(download,{method:'POST',uid:'alice',data:{}})).status,404);
    const history=f.db.prepare('SELECT actor,to_status FROM digital_order_history WHERE order_id=? ORDER BY id').all(order.id);assert.equal(history.length,3);assert.equal(history[1].actor,'admin');
  }finally{f.close();}
});

test('Storage signing fails closed for poisoned URLs, unavailable storage and revocation while signing',async()=>{
  const f=fixture();try{
    const admin=await f.admin(),p=await f.publish(admin);await f.enable(admin);const order=await f.order(p);await f.status(admin,order,'paid');
    const route='/api/customer/digital-orders/'+order.id+'/files/'+p.files[0].id+'/download';
    f.setSignResult(()=>Response.json({signedURL:'https://evil.test/file.pdf?token=bad'}));
    assert.equal((await f.req(route,{method:'POST',uid:'alice',data:{}})).status,503);
    f.setSignResult(()=>Response.json({error:envBase.SUPABASE_SECRET_KEY},{status:500}));
    const failed=await f.req(route,{method:'POST',uid:'alice',data:{}});assert.equal(failed.status,503);assert.equal((await failed.text()).includes(envBase.SUPABASE_SECRET_KEY),false);
    f.setSignResult(undefined);
    f.env.SUPABASE_URL='http://127.0.0.1/';const before=f.signs.length;
    assert.equal((await f.req(route,{method:'POST',uid:'alice',data:{}})).status,503);assert.equal(f.signs.length,before);
    f.env.SUPABASE_URL=envBase.SUPABASE_URL;
    f.setOnSign(()=>{f.db.prepare("UPDATE digital_orders SET status='revoked' WHERE id=?").run(order.id);});
    assert.equal((await f.req(route,{method:'POST',uid:'alice',data:{}})).status,403);
  }finally{f.close();}
});

test('Concurrent admin publication cannot overwrite file paths after losing a product version race',async()=>{
  const f=fixture();try{
    const admin=await f.admin(),p=(await f.products(admin)).find(p=>p.id==='g4-tong-hieu'),oldKeys=p.files.map(file=>file.object_key);
    let changed=false;
    f.setOnSign(()=>{if(!changed){changed=true;f.db.prepare('UPDATE digital_products SET version=version+1 WHERE id=?').run(p.id);}});
    const changedFiles=p.files.map(file=>({...file,object_key:file.object_key.replace('.pdf','-new.pdf')}));
    const response=await f.req('/api/admin/digital-products/'+p.id,{method:'PATCH',headers:admin,data:{...p,expected_version:p.version,is_draft:false,files:changedFiles}});
    assert.equal(response.status,409);
    assert.deepEqual(f.db.prepare('SELECT object_key FROM digital_files WHERE product_id=? ORDER BY id').all(p.id).map(f=>f.object_key),oldKeys);
  }finally{f.close();}
});

test('Storage path validation rejects traversal and Unicode; legacy service keys are supported without accepting anon keys',async()=>{
  for(const bad of ['../secret.pdf','lop-4/../../file.pdf','lop-4/file.txt','lop-4/Toán.pdf','lop-4//file.pdf','https://evil.test/a.pdf','lop-4/./a.pdf'])assert.equal(validObjectKey(bad),false,bad);
  assert.equal(validObjectKey('lop-4/chuyen-de/Toan4_GV.pdf'),true);
  const f=fixture();try{
    const admin=await f.admin();
    delete f.env.SUPABASE_SECRET_KEY;
    f.env.SUPABASE_SERVICE_ROLE_KEY='e30.'+Buffer.from('{"role":"anon"}').toString('base64url')+'.signature';
    assert.equal((await f.req('/api/admin/digital-products/g4-tong-hieu',{method:'PATCH',headers:admin,data:{...(await f.products(admin)).find(p=>p.id==='g4-tong-hieu'),expected_version:1,is_draft:false}})).status,503);
    f.env.SUPABASE_SERVICE_ROLE_KEY='e30.'+Buffer.from('{"role":"service_role"}').toString('base64url')+'.signature';
    await f.publish(admin);
    assert.equal(f.signs.at(-1).options.headers.Authorization,'Bearer '+f.env.SUPABASE_SERVICE_ROLE_KEY);
  }finally{f.close();}
});
