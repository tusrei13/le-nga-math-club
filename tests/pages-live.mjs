import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const base=process.env.PAGES_TEST_URL||'http://127.0.0.1:8788';
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw new Error('Only localhost is allowed for this fixture test.');
const execute=sql=>execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','le-nga-books','--local','--command',sql],{stdio:'pipe'});
const user='test_'+randomBytes(8).toString('hex'),userId=randomUUID(),password=randomBytes(32).toString('hex');
execute(`INSERT INTO admin_users(id,username,password_hash) VALUES('${userId}','${user}','token-sha256:${createHash('sha256').update(password).digest('hex')}');`);
let cookie,auth,orderId,consultId;
async function request(path,method='GET',data,headers={}){return fetch(base+path,{method,headers:{'Content-Type':'application/json',...headers},body:data?JSON.stringify(data):undefined});}
try{
  assert.equal((await request('/admin')).status,200);
  assert.equal((await request('/api/admin/orders')).status,401);
  const login=await request('/api/auth/login','POST',{username:user,password});assert.equal(login.status,200);auth=await login.json();cookie=login.headers.get('Set-Cookie').split(';')[0];
  const headers={Cookie:cookie,'X-CSRF-Token':auth.csrf_token};
  const payload={name:'Pages fixture',phone:'0989066885',grade:6,address:'Test address',items:[{product_id:'toan-6-tap-1',quantity:2}],total_vnd:1};
  const key={'Idempotency-Key':randomUUID()};const created=await request('/api/orders','POST',payload,key);assert.equal(created.status,201);const order=await created.json();orderId=order.id;assert.equal(order.total_vnd,238000);assert.equal((await request('/api/orders','POST',payload,key)).status,200);
  assert.equal((await request(`/api/admin/orders/${orderId}/status`,'PATCH',{status:'confirmed',expected_status:'pending'},headers)).status,200);
  const detail=await (await request(`/api/admin/orders/${orderId}`,'GET',undefined,headers)).json();assert.equal(detail.items.length,1);assert.equal(detail.history.length,2);
  assert.equal((await request(`/api/admin/orders?q=${orderId}`,'GET',undefined,headers)).status,200);
  const consultation=await request('/api/consultations','POST',{name:'Pages fixture',phone:'0989066885',grade:5},{'Idempotency-Key':randomUUID()});assert.equal(consultation.status,201);consultId=(await consultation.json()).id;
  assert.equal((await request('/api/auth/logout','POST',{},headers)).status,200);assert.equal((await request('/api/admin/orders','GET',undefined,headers)).status,401);
  assert.equal((await request('/server.mjs')).status,404);
  console.log('Actual Cloudflare runtime checks passed: clean admin URL, D1 order pricing, retries, consultations, login, CSRF-protected updates, history, logout and private source isolation.');
}finally{
  const sql=[];
  if(orderId)sql.push(`DELETE FROM order_items WHERE order_id='${orderId}';DELETE FROM order_gifts WHERE order_id='${orderId}';DELETE FROM request_history WHERE order_id='${orderId}';DELETE FROM orders WHERE id='${orderId}';`);
  if(consultId)sql.push(`DELETE FROM request_history WHERE consultation_id='${consultId}';DELETE FROM consultations WHERE id='${consultId}';`);
  sql.push(`DELETE FROM admin_sessions WHERE user_id='${userId}';DELETE FROM admin_users WHERE id='${userId}';`);execute(sql.join('\n'));
}
