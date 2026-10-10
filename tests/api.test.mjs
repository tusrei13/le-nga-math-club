import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

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
  assert.equal(result.data.faqs.length,3);assert.equal(result.data.gifts.length,3);
  for(const product of result.data.products) {
    assert.ok(Number.isInteger(product.price_vnd) && product.price_vnd>0);
    const cover=product.media.find(m=>m.kind==='cover');assert.ok(cover);
    const image=await fetch(base+cover.url);assert.equal(image.status,200);assert.match(image.headers.get('content-type'),/^image\//);await image.arrayBuffer();
  }
});
test('Đơn lưu đúng giá phía server, snapshot và quà tặng; gửi lại không tạo đơn mới',async()=>{
  const headers={'Idempotency-Key':randomUUID()};
  const first=await api('/api/orders','POST',order,headers);assert.equal(first.status,201);assert.equal(first.data.total_vnd,417000);
  const replay=await api('/api/orders','POST',order,headers);assert.equal(replay.status,200);assert.equal(replay.data.id,first.data.id);
  const conflict=await api('/api/orders','POST',{...order,note:'Khác'},headers);assert.equal(conflict.status,409);
  const list=await api('/api/admin/orders','GET',undefined,adminHeaders);assert.equal(list.data.total,1);
  assert.equal(list.data.data[0].items.length,2);assert.equal(list.data.data[0].gifts.length,3);assert.equal(list.data.data[0].parent_name,person.name);
  const update=await api('/api/admin/products/toan-6-tap-1','PATCH',{price_vnd:129000},adminHeaders);assert.equal(update.status,200);
  const after=await api('/api/admin/orders','GET',undefined,adminHeaders);assert.equal(after.data.data[0].items.find(i=>i.product_id==='toan-6-tap-1').unit_price_vnd,119000);
  assert.equal((await api('/api/orders','POST',order,headers)).data.total_vnd,417000);
  await api('/api/admin/products/toan-6-tap-1','PATCH',{price_vnd:119000},adminHeaders);
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
  assert.equal((await api('/api/landing')).data.testimonials.length,1);
  assert.equal((await api('/api/admin/content/sales_policy','PATCH',{shipping_vnd:25000,gifts_with_order:false},adminHeaders)).status,200);
  assert.equal((await api('/api/admin/content/contact','PATCH',{facebook:'javascript:alert(1)'},adminHeaders)).status,400);
  const result=await api('/api/orders','POST',order,{'Idempotency-Key':randomUUID()});assert.equal(result.data.total_vnd,442000);
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
