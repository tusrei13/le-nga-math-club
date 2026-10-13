import { test } from 'node:test';
import assert from 'node:assert/strict';
import { customer,firebaseConfig } from '../customer-auth.mjs';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { seed } from '../database/seed.mjs';
import worker from '../cloudflare/worker.mjs';
const envConfig={FIREBASE_API_KEY:'public-key',FIREBASE_PROJECT_ID:'test-project',FIREBASE_AUTH_DOMAIN:'test-project.firebaseapp.com'};
const jwt=uid=>`${Buffer.from('{"alg":"RS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({aud:'test-project',iss:'https://securetoken.google.com/test-project',sub:uid,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.signature`;
test('Customer verification requires a configured project and Firebase-verified identity',async()=>{
  assert.deepEqual(firebaseConfig({}),{enabled:false});
  assert.equal(await customer(new Request('https://site.test'),{},false),null);
  await assert.rejects(customer(new Request('https://site.test',{headers:{Authorization:'Bearer fake'}}),{}),e=>e.status===503);
  await assert.rejects(customer(new Request('https://site.test',{headers:{Authorization:'Bearer fake'}}),envConfig),e=>e.status===401);
  const original=globalThis.fetch;
  try{
    globalThis.fetch=async()=>new Response(JSON.stringify({users:[{localId:'alice',email:'alice@test.com',emailVerified:true}]}));
    const req=new Request('https://site.test',{headers:{Authorization:`Bearer ${jwt('alice')}`}});
    assert.equal((await customer(req,envConfig)).id,'test-project:alice');
    await assert.rejects(customer(new Request('https://site.test',{headers:{Authorization:`Bearer ${jwt('bob')}`}}),envConfig),e=>e.status===401);
    globalThis.fetch=async()=>new Response('{"error":{"message":"INVALID_ID_TOKEN"}}',{status:400});
    await assert.rejects(customer(req,envConfig),e=>e.status===401);
  }finally{globalThis.fetch=original;}
});
test('D1 customer orders isolate owners and ignore a forged client customer_id',async()=>{
  const db=new DatabaseSync(':memory:');for(const file of ['database/schema.sql','database/admin-schema.sql','database/customer-schema.sql','cloudflare/edge-schema.sql'])db.exec(readFileSync(file,'utf8'));seed(db);
  const DB={prepare(sql){return{bind(...args){return{first:async()=>db.prepare(sql).get(...args)||null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>({meta:{changes:db.prepare(sql).run(...args).changes}})};}};},async batch(stmts){db.exec('BEGIN');try{const rows=[];for(const s of stmts)rows.push(await s.run());db.exec('COMMIT');return rows;}catch(e){db.exec('ROLLBACK');throw e;}}};
  const original=globalThis.fetch;
  globalThis.fetch=async(_url,options)=>{const uid=JSON.parse(Buffer.from(JSON.parse(options.body).idToken.split('.')[1],'base64url')).sub;return new Response(JSON.stringify({users:[{localId:uid,email:uid+'@test.com'}]}));};
  const env={...envConfig,DB};
  const req=(path,method='GET',data,uid)=>worker.fetch(new Request('https://site.test'+path,{method,headers:{'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID(),...(uid?{Authorization:`Bearer ${jwt(uid)}`}:{})},body:data?JSON.stringify(data):undefined}),env);
  try{
    const payload={name:'Parent',phone:'0989066885',grade:6,address:'Hà Nội',customer_id:'test-project:bob',items:[{product_id:'toan-6-tap-1',quantity:1}]};
    assert.equal((await req('/api/orders','POST',payload,'alice')).status,201);
    assert.equal((await req('/api/orders','POST',payload)).status,201);
    const alice=await(await req('/api/customer/orders','GET',undefined,'alice')).json();const bob=await(await req('/api/customer/orders','GET',undefined,'bob')).json();
    assert.equal(alice.orders.length,1);assert.equal(bob.orders.length,0);
    assert.equal(alice.orders[0].items[0].title,'Phân dạng Toán 6 tập 1');
    assert.equal((await req('/api/customer/orders')).status,401);
    assert.equal((await req('/api/admin/orders','GET',undefined,'alice')).status,401);
    assert.equal(db.prepare('SELECT count(*) n FROM customer_orders').get().n,1);
  }finally{globalThis.fetch=original;db.close();}
});
