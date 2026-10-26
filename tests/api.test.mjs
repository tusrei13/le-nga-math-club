import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { hashPassword } from '../passwords.mjs';

let child, directory, base;
const token='test-only-admin-token-with-at-least-32-characters';
const person={name:'Nguyễn Thị An',phone:'0989066885',grade:6,note:'Con cần ôn hình học.'};
const order={...person,address:'02 Geleximco, Hà Nội',items:[{product_id:'toan-6-tap-1',quantity:2},{product_id:'70-de-vao-6',quantity:1}],total_vnd:1};
const adminHeaders={Authorization:`Bearer ${token}`};
async function api(path,method='GET',data,headers={}) {
  const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...headers},body:data===undefined?undefined:JSON.stringify(data)});
  return {status:response.status,data:await response.json()};
}
before(async()=>{
  directory=await mkdtemp(join(tmpdir(),'le-nga-db-test-'));
  child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:'0',DATABASE_PATH:join(directory,'test.sqlite'),ADMIN_API_TOKEN:token},stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error('Server startup timed out')),10000);
    let output='',errors='';
    child.stderr.on('data',chunk=>{errors+=chunk;});
    child.stdout.on('data',chunk=>{
      output+=chunk; const match=output.match(/0\.0\.0\.0:(\d+)/);
      if(match) {base=`http://127.0.0.1:${match[1]}`;clearTimeout(timeout);resolve();}
    });
    child.once('exit',code=>{clearTimeout(timeout);reject(new Error(`Server exited: ${code} ${errors}`));});
  });
});
after(async()=>{
  if(child && child.exitCode===null) {const exited=new Promise(resolve=>child.once('exit',resolve));child.kill();await exited;}
  if(directory) await rm(directory,{recursive:true,force:true});
});
test('Danh mục chứa đúng 10 sách, giá và 10 ảnh bìa truy cập được',async()=>{
  const result=await api('/api/landing'); assert.equal(result.status,200); assert.equal(result.data.products.length,10);
  assert.equal(result.data.faqs.length,3);assert.equal(result.data.gifts.length,0);
  assert.equal(result.data.content.sales_policy.gifts_with_order,false);
  for(const product of result.data.products) {
    assert.equal(product.price_vnd,299000);
    const cover=product.media.find(m=>m.kind==='cover');assert.ok(cover);
    const image=await fetch(base+cover.url);assert.equal(image.status,200);assert.match(image.headers.get('content-type'),/^image\//);await image.arrayBuffer();
  }
});
test('Đơn lưu giá 299k và snapshot; không tự thêm quà, gửi lại không tạo đơn mới',async()=>{
  const headers={'Idempotency-Key':randomUUID()};
  const first=await api('/api/orders','POST',order,headers);assert.equal(first.status,201);assert.equal(first.data.total_vnd,897000);
  const replay=await api('/api/orders','POST',order,headers);assert.equal(replay.status,200);assert.equal(replay.data.id,first.data.id);
  const conflict=await api('/api/orders','POST',{...order,note:'Khác'},headers);assert.equal(conflict.status,409);
  const list=await api('/api/admin/orders','GET',undefined,adminHeaders);assert.equal(list.data.total,1);
  assert.equal(list.data.data[0].items.length,2);assert.equal(list.data.data[0].gifts.length,0);assert.equal(list.data.data[0].parent_name,person.name);
  const update=await api('/api/admin/products/toan-6-tap-1','PATCH',{price_vnd:129000},adminHeaders);assert.equal(update.status,200);
  const after=await api('/api/admin/orders','GET',undefined,adminHeaders);assert.equal(after.data.data[0].items.find(i=>i.product_id==='toan-6-tap-1').unit_price_vnd,299000);
  assert.equal((await api('/api/orders','POST',order,headers)).data.total_vnd,897000);
  await api('/api/admin/products/toan-6-tap-1','PATCH',{price_vnd:299000},adminHeaders);
});
test('Dữ liệu không hợp lệ bị từ chối, giao dịch lỗi không lưu nửa đơn',async()=>{
  for(const payload of [
    {...order,phone:'123'}, {...order,grade:10}, {...order,address:''}, {...order,items:[]},
    {...order,items:[{product_id:'toan-6-tap-1',quantity:0}]},
    {...order,items:[{product_id:'toan-6-tap-1',quantity:1.5}]},
    {...order,items:[{product_id:'toan-6-tap-1',quantity:1},{product_id:'not-a-book',quantity:1}]},
    {...order,items:[{product_id:'toan-6-tap-1',quantity:1},{product_id:'toan-6-tap-1',quantity:1}]}
  ]) assert.equal((await api('/api/orders','POST',payload,{'Idempotency-Key':randomUUID()})).status,400);
  const rows=await api('/api/admin/orders','GET',undefined,adminHeaders);assert.equal(rows.data.total,1);
  assert.equal((await api('/api/orders','POST',order)).status,400);
  const badJson=await fetch(base+'/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:'{bad'});assert.equal(badJson.status,400);
});
test('Tư vấn không cần địa chỉ, chuẩn hóa +84 và chống gửi trùng',async()=>{
  const headers={'Idempotency-Key':randomUUID()}; const payload={...person,phone:'+84 989 066 885'};
  const first=await api('/api/consultations','POST',payload,headers);assert.equal(first.status,201);
  const replay=await api('/api/consultations','POST',payload,headers);assert.equal(replay.data.id,first.data.id);
  const rows=await api('/api/admin/consultations','GET',undefined,adminHeaders);assert.equal(rows.data.total,1);assert.equal(rows.data.data[0].phone,'0989066885');
});
test('Thông tin phụ huynh và file database không thể đọc công khai',async()=>{
  for(const path of ['/api/admin/orders','/api/admin/consultations','/api/admin/products']) assert.equal((await api(path)).status,401);
  for(const path of ['/data/landing.sqlite','/database/schema.sql','/.env','/server.mjs','/api.mjs','/assets/..%5c..%5cserver.mjs']) {
    const response=await fetch(base+path);assert.equal(response.status,404);
  }
  const crossSite=await api('/api/orders','POST',order,{'Idempotency-Key':randomUUID(),Origin:'https://another-site.example'});assert.equal(crossSite.status,403);
});
test('Trạng thái theo quy trình và lịch sử thay đổi được lưu',async()=>{
  const list=await api('/api/admin/orders','GET',undefined,adminHeaders);const id=list.data.data[0].id;
  assert.equal((await api(`/api/admin/orders/${id}/status`,'PATCH',{status:'completed'},adminHeaders)).status,400);
  for(const status of ['confirmed','shipping','completed']) assert.equal((await api(`/api/admin/orders/${id}/status`,'PATCH',{status},adminHeaders)).data.status,status);
  assert.equal((await api(`/api/admin/orders/${id}/status`,'PATCH',{status:'pending'},adminHeaders)).status,400);
  const db=new DatabaseSync(join(directory,'test.sqlite'));
  assert.equal(db.prepare('SELECT count(*) AS n FROM request_history WHERE order_id=?').get(id).n,4);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');db.close();
});
test('Nội dung quản trị cập nhật được, ẩn nội dung và tính phí từ chính sách trong database',async()=>{
  assert.equal((await api('/api/admin/content')).status,401);
  assert.equal((await api('/api/admin/content','GET',undefined,adminHeaders)).data.faqs.length,3);
  assert.equal((await api('/api/admin/faqs/foundation','PATCH',{answer:'Nội dung thử nghiệm từ database.'},adminHeaders)).status,200);
  assert.equal((await api('/api/landing')).data.faqs[0].answer,'Nội dung thử nghiệm từ database.');
  assert.equal((await api('/api/admin/testimonials/parent-5','PATCH',{published:false},adminHeaders)).status,200);
  assert.equal((await api('/api/landing')).data.testimonials.length,0);
  assert.equal((await api('/api/admin/content/sales_policy','PATCH',{shipping_vnd:25000,gifts_with_order:false},adminHeaders)).status,200);
  assert.equal((await api('/api/admin/content/contact','PATCH',{facebook:'javascript:alert(1)'},adminHeaders)).status,400);
  const result=await api('/api/orders','POST',order,{'Idempotency-Key':randomUUID()});assert.equal(result.data.total_vnd,922000);
  const rows=await api('/api/admin/orders','GET',undefined,adminHeaders);assert.equal(rows.data.data.find(row=>row.id===result.data.id).gifts.length,0);
  assert.equal((await api('/api/admin/products/toan-6-tap-1','PATCH',{cover_url:'/assets/books/Phan%20dang%20toan%20lop6%20t1.png'},adminHeaders)).status,200);
  assert.equal((await api('/api/admin/products/toan-6-tap-1','PATCH',{active:false},adminHeaders)).status,200);
  assert.equal((await api('/api/orders','POST',order,{'Idempotency-Key':randomUUID()})).status,400);
  assert.equal((await api('/api/products')).data.products.length,9);
});
test('Khởi tạo lại giữ nguyên dữ liệu đã chỉnh sửa và các đơn đã lưu',async()=>{
  execFileSync(process.execPath,['database/init.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,DATABASE_PATH:join(directory,'test.sqlite')},stdio:'pipe'});
  const result=await api('/api/admin/content','GET',undefined,adminHeaders);
  assert.equal(result.data.content.sales_policy.shipping_vnd,25000);
  assert.equal(result.data.faqs[0].answer,'Nội dung thử nghiệm từ database.');
  assert.equal((await api('/api/admin/orders','GET',undefined,adminHeaders)).data.total,2);
  assert.equal((await api('/api/products')).data.products.length,9);
});
const loginPassword='Test-only password for admin 2026';
let sessionCookie, csrfToken;
async function login(password=loginPassword, username='admin') {
  const response=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({username,password})});
  return {status:response.status,cookie:response.headers.get('set-cookie'),data:await response.json()};
}
test('Tạo tài khoản riêng, đăng nhập đúng/sai và không trả thông tin mật khẩu',async()=>{
  assert.equal((await api('/api/auth/session')).data.setup_required,true);
  const db=new DatabaseSync(join(directory,'test.sqlite'));
  db.prepare('INSERT INTO admin_users(id,username,password_hash) VALUES(?,?,?)').run('test-admin','admin',await hashPassword(loginPassword));db.close();
  assert.equal((await login('incorrect password')).status,401);
  assert.equal((await login(loginPassword,'unknown-user')).status,401);
  const result=await login();assert.equal(result.status,200);assert.equal(result.data.username,'admin');
  assert.match(result.cookie,/HttpOnly/);assert.match(result.cookie,/SameSite=Strict/);assert.match(result.cookie,/Path=\//);
  assert.equal(result.data.password_hash,undefined);
  sessionCookie=result.cookie.split(';')[0];csrfToken=result.data.csrf_token;
  const auth=await api('/api/auth/session','GET',undefined,{Cookie:sessionCookie});assert.equal(auth.data.authenticated,true);
  const privateRows=await api('/api/admin/orders','GET',undefined,{Cookie:sessionCookie});assert.equal(privateRows.status,200);
  const inspect=new DatabaseSync(join(directory,'test.sqlite'));const stored=inspect.prepare('SELECT token_hash FROM admin_sessions').get();
  assert.notEqual(stored.token_hash,sessionCookie.split('=')[1]);inspect.close();
});
test('Session yêu cầu CSRF khi sửa dữ liệu; từ chối nguồn ngoài và trạng thái cũ',async()=>{
  const headers={Cookie:sessionCookie};
  const id=(await api('/api/admin/consultations','GET',undefined,headers)).data.data[0].id;
  assert.equal((await api(`/api/admin/consultations/${id}/status`,'PATCH',{status:'contacted'},headers)).status,403);
  assert.equal((await api(`/api/admin/consultations/${id}/status`,'PATCH',{status:'contacted'},{...headers,'X-CSRF-Token':'invalid'})).status,403);
  assert.equal((await api(`/api/admin/consultations/${id}/status`,'PATCH',{status:'contacted'},{...headers,'X-CSRF-Token':csrfToken,Origin:'https://outside.example'})).status,403);
  const secured={...headers,'X-CSRF-Token':csrfToken,Origin:base};
  assert.equal((await api(`/api/admin/consultations/${id}/status`,'PATCH',{status:'contacted',expected_status:'new'},secured)).status,200);
  assert.equal((await api(`/api/admin/consultations/${id}/status`,'PATCH',{status:'resolved',expected_status:'new'},secured)).status,409);
  const detail=await api(`/api/admin/consultations/${id}`,'GET',undefined,headers);assert.equal(detail.data.history.length,2);assert.deepEqual(detail.data.allowed_statuses,['resolved','cancelled']);
  assert.equal((await api('/api/admin/consultations?status=contacted&q=0989','GET',undefined,headers)).data.total,1);
  assert.equal((await api('/api/admin/consultations?q=%25','GET',undefined,headers)).data.total,0);
  assert.equal((await api('/api/admin/orders?status=invalid','GET',undefined,headers)).status,400);
  const summary=await api('/api/admin/summary','GET',undefined,headers);assert.equal(summary.data.orders.completed,1);
  const page=await fetch(base+'/admin');assert.equal(page.status,200);assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  assert.equal((await fetch(base+'/auth.mjs')).status,404);
  assert.equal((await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://outside.example'},body:JSON.stringify({username:'admin',password:loginPassword})})).status,403);
});
test('Đăng xuất, hết hạn và thu hồi phiên chặn truy cập',async()=>{
  const logout=await fetch(base+'/api/auth/logout',{method:'POST',headers:{Cookie:sessionCookie,'X-CSRF-Token':csrfToken,Origin:base,'Content-Type':'application/json'},body:'{}'});
  assert.equal(logout.status,200);assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);
  assert.equal((await api('/api/admin/orders','GET',undefined,{Cookie:sessionCookie})).status,401);
  const result=await login();const expiredCookie=result.cookie.split(';')[0];
  const db=new DatabaseSync(join(directory,'test.sqlite'));db.prepare('UPDATE admin_sessions SET expires_at=?').run(Date.now()-1);db.close();
  assert.equal((await api('/api/admin/orders','GET',undefined,{Cookie:expiredCookie})).status,401);
  const idle=await login();const idleCookie=idle.cookie.split(';')[0];
  const idleDb=new DatabaseSync(join(directory,'test.sqlite'));idleDb.prepare('UPDATE admin_sessions SET last_seen_at=?').run(Date.now()-31*60*1000);idleDb.close();
  assert.equal((await api('/api/admin/orders','GET',undefined,{Cookie:idleCookie})).status,401);
  const fresh=await login();const activeCookie=fresh.cookie.split(';')[0];
  const reset=new DatabaseSync(join(directory,'test.sqlite'));reset.prepare('DELETE FROM admin_sessions WHERE user_id=?').run('test-admin');reset.close();
  assert.equal((await api('/api/admin/orders','GET',undefined,{Cookie:activeCookie})).status,401);
});
test('Giới hạn thử đăng nhập liên tiếp',async()=>{
  for(let i=0;i<5;i++) assert.equal((await login('wrong password')).status,401);
  assert.equal((await login()).status,429);
});
