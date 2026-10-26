import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {readJson,policies} from '../security.mjs';
import {sqliteD1} from '../database/d1-adapter.mjs';
import {seed} from '../database/seed.mjs';
import worker from '../cloudflare/worker.mjs';
import stemWorker from '../stem-maths/worker.mjs';

function fixture(){
  const db=new DatabaseSync(':memory:');
  for(const file of ['database/schema.sql','database/admin-schema.sql','database/customer-schema.sql','database/migrations/005-stem-maths.sql'])db.exec(readFileSync(file,'utf8'));
  seed(db);
  const password='test-only-'+randomUUID(),digest=createHash('sha256').update(password).digest('hex');
  db.prepare('INSERT INTO admin_users(id,username,password_hash) VALUES(?,?,?)').run('security-admin','admin','token-sha256:'+digest);
  const env={DB:sqliteD1(db),ASSETS:{fetch:async()=>new Response('<!doctype html><title>Admin</title>',{headers:{'Content-Type':'text/html'}})}};
  const req=(path,{method='GET',data,headers={},stem=false}={})=>(stem?stemWorker:worker).fetch(new Request('https://site.test'+path,{method,headers:{'Content-Type':'application/json',...headers},body:data===undefined?undefined:JSON.stringify(data)}),env);
  const login=async(headers={})=>{
    const response=await req('/api/auth/login',{method:'POST',data:{username:'admin',password},headers});
    assert.equal(response.status,200);
    return {cookie:response.headers.get('Set-Cookie').split(';')[0],auth:await response.json()};
  };
  return {db,env,req,login,password};
}

test('JSON readers reject deceptive media types, compression, invalid UTF-8 and oversized streams',async()=>{
  const request=(body,headers={})=>new Request('https://site.test',{method:'POST',headers:{'Content-Type':'application/json',...headers},body,duplex:'half'});
  assert.deepEqual(await readJson(request('{"ok":true}',{'Content-Type':'Application/JSON; charset=utf-8'})),{ok:true});
  for(const [body,headers,status] of [
    ['{}',{'Content-Type':'application/jsonp'},415],['{}',{'Content-Encoding':'gzip'},415],
    ['{}',{'Content-Length':'32769'},413],['{}',{'Content-Length':'bad'},400],
    ['[]',{},400],['null',{},400],['{"broken"',{},400],[Uint8Array.of(0xff),{},400]
  ])await assert.rejects(readJson(request(body,headers)),error=>error.status===status);
  let cancelled=false;
  const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(32769));},cancel(){cancelled=true;}});
  await assert.rejects(readJson(request(stream)),error=>error.status===413);assert.equal(cancelled,true);
});

test('Slow JSON streams time out and are cancelled without holding the worker open',async()=>{
  let cancelled=false;
  const stream=new ReadableStream({cancel(){cancelled=true;}});
  const request=new Request('https://site.test',{method:'POST',headers:{'Content-Type':'application/json'},body:stream,duplex:'half'});
  await assert.rejects(readJson(request,{timeoutMs:20}),error=>error.status===408);
  assert.equal(cancelled,true);
});

test('Admin login is limited per account across changing IPs and normalizes case and spaces',async()=>{
  const {db,req,password}=fixture();try{
    db.prepare('INSERT INTO edge_rate_limits(key,count,expires_at) VALUES(?,?,?)').run('expired-attempt',100,Date.now()-1);
    for(let index=0;index<30;index++){
      const response=await req('/api/auth/login',{method:'POST',data:{username:index%2?' ADMIN ':'Admin',password:'wrong'},headers:{'CF-Connecting-IP':`192.0.2.${index+1}`}});
      assert.equal(response.status,401);
    }
    const blocked=await req('/api/auth/login',{method:'POST',data:{username:'admin',password},headers:{'CF-Connecting-IP':'198.51.100.1'}});
    assert.equal(blocked.status,429);assert.equal(blocked.headers.get('Retry-After'),'900');
    assert.equal(db.prepare('SELECT 1 FROM edge_rate_limits WHERE key=?').get('expired-attempt'),undefined);
    assert.ok(db.prepare('SELECT key FROM edge_rate_limits').all().every(row=>/^[a-f0-9]{64}$/.test(row.key)));
  }finally{db.close();}
});

test('Reauthentication rotates the presented admin session; old cookies and forged CSRF cannot write',async()=>{
  const {db,req,login}=fixture();try{
    const first=await login(),second=await login({Cookie:first.cookie});
    assert.notEqual(first.cookie,second.cookie);assert.notEqual(first.auth.csrf_token,second.auth.csrf_token);
    assert.equal((await req('/api/admin/summary',{headers:{Cookie:first.cookie}})).status,401);
    assert.equal((await req('/api/admin/summary',{headers:{Cookie:second.cookie}})).status,200);
    for(const headers of [
      {Cookie:second.cookie,'X-CSRF-Token':first.auth.csrf_token},
      {Cookie:second.cookie,'X-CSRF-Token':second.auth.csrf_token,Origin:'https://other.site.test','Sec-Fetch-Site':'same-site'},
      {Cookie:second.cookie,'X-CSRF-Token':second.auth.csrf_token,Origin:'null'}
    ])assert.equal((await req('/api/auth/logout',{method:'POST',data:{},headers})).status,403);
    assert.equal((await req('/api/admin/summary',{headers:{Cookie:second.cookie}})).status,200);
  }finally{db.close();}
});

test('Pages applies security headers to dynamic responses, failures, health checks and admin HTML',async()=>{
  const {db,req}=fixture();try{
    for(const stem of [false,true])for(const path of ['/healthz','/api/does-not-exist','/api/admin/stem-enquiries']){
      const response=await req(path,{stem});
      assert.equal(response.headers.get('X-Frame-Options'),'DENY');
      assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');
      assert.equal(response.headers.get('Cross-Origin-Resource-Policy'),'same-origin');
      assert.equal(response.headers.get('Cache-Control'),'no-store');
      assert.match(response.headers.get('Strict-Transport-Security'),/max-age=/);
      assert.equal(response.headers.get('Content-Security-Policy'),policies.api);
      assert.equal(response.headers.get('Access-Control-Allow-Origin'),null);
    }
    const html=await req('/admin');assert.equal(html.headers.get('Content-Security-Policy'),policies.admin);
    assert.equal(html.headers.get('Cache-Control'),'no-store');
    assert.doesNotMatch(html.headers.get('Content-Security-Policy'),/unsafe-inline|unsafe-eval/);
  }finally{db.close();}
});

test('Parent input stays data, SQL search stays bound and API responses hide internal replay material',async()=>{
  const {db,req,login}=fixture();try{
    const data={name:'An <img src=x onerror=alert(1)>',phone:'0989066885',grade:6,level:'basic',specialist_goal:false,consent:true,note:"'); DROP TABLE admin_users;--"};
    const created=await req('/api/stem/enquiries',{method:'POST',data,headers:{'Idempotency-Key':randomUUID()}});
    assert.equal(created.status,201);const receipt=await created.json();assert.equal(receipt.parent_name,undefined);
    const session=await login(),headers={Cookie:session.cookie};
    const detail=await(await req('/api/admin/stem-enquiries/'+receipt.id,{headers})).json();
    assert.equal(detail.parent_name,data.name);assert.equal(detail.note,data.note);
    assert.equal(detail.request_key,undefined);assert.equal(detail.request_hash,undefined);
    const search=await(await req('/api/admin/stem-enquiries?q='+encodeURIComponent("' OR 1=1 --"),{headers})).json();
    assert.equal(search.total,0);assert.equal(db.prepare('SELECT count(*) AS n FROM admin_users').get().n,1);
    const order=await req('/api/orders',{method:'POST',data:{name:'Parent',phone:'0989066885',grade:6,address:'Hà Nội',items:[{product_id:'toan-6-tap-1',quantity:1}]},headers:{'Idempotency-Key':randomUUID()}});
    assert.equal(order.status,201);const id=(await order.json()).id;
    const list=await(await req('/api/admin/orders',{headers})).json();
    const ticket=await(await req('/api/admin/orders/'+id,{headers})).json();
    for(const row of [list.data[0],ticket]){assert.equal(row.request_key,undefined);assert.equal(row.request_hash,undefined);}
  }finally{db.close();}
});
test('Pages preview URLs cannot write real enquiries, log in as admin or read private APIs',async()=>{
  const {db,env}=fixture();try{
    for(const [site,handler] of [['le-nga-books',worker],['stem-maths-co-nga',stemWorker]]){
      for(const prefix of ['a1b2c3d4','feature-branch']){
        const origin=`https://${prefix}.${site}.pages.dev`;
        for(const [path,method] of [['/api/stem/enquiries','POST'],['/api/orders','POST'],['/api/auth/login','POST'],['/api/auth/session','GET'],['/api/admin/stem-enquiries','GET'],['/api/customer/orders','GET']]){
          const response=await handler.fetch(new Request(origin+path,{method,headers:{'Content-Type':'application/json'},body:method==='POST'?'{}':undefined}),env);
          assert.equal(response.status,403);
        }
        assert.equal((await handler.fetch(new Request(origin+'/api/stem/programs'),env)).status,200);
      }
      assert.equal((await handler.fetch(new Request(`https://${site}.pages.dev/api/stem/programs`),env)).status,200);
    }
    assert.equal(db.prepare('SELECT count(*) AS n FROM stem_enquiries').get().n,0);
    assert.equal(db.prepare('SELECT count(*) AS n FROM orders').get().n,0);
  }finally{db.close();}
});
