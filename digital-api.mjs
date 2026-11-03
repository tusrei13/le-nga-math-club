import {createHash,randomUUID} from 'node:crypto';
import {customer} from './customer-auth.mjs';
import {readJson,SecurityError} from './security.mjs';
import {edgeRateLimit} from './edge-rate-limit.mjs';

export class DigitalError extends Error {constructor(status,message){super(message);this.status=status;}}
const check=(value,message,status=400)=>{if(!value)throw new DigitalError(status,message);};
const q=(db,sql,...args)=>db.prepare(sql).bind(...args);
const first=(db,sql,...args)=>q(db,sql,...args).first();
const all=async(db,sql,...args)=>(await q(db,sql,...args).all()).results;
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const text=(value,label,max,required=true)=>{
  check(typeof value==='string'||(!required&&value==null),label+' không hợp lệ.');
  const result=(value||'').trim();check(result.length<=max&&(!required||result.length>0),label+' không hợp lệ.');return result;
};
function origin(request){
  const supplied=request.headers.get('Origin');
  check(request.headers.get('Sec-Fetch-Site')!=='cross-site'&&(!supplied||supplied===new URL(request.url).origin),'Nguồn yêu cầu không hợp lệ.',403);
}
const body=request=>{origin(request);return readJson(request);};
const states={pending:['paid','cancelled'],paid:['revoked'],cancelled:[],revoked:[]};
const publicProduct=p=>({id:p.id,title:p.title,grade:p.grade,description:p.description,price_vnd:p.price_vnd,is_draft:Boolean(p.is_draft),version:p.version,file_count:p.file_count});
const receipt=r=>({id:r.id,product_id:r.product_id,title:r.title,amount_vnd:r.amount_vnd,status:r.status,created_at:r.created_at});
const settings=db=>first(db,'SELECT * FROM digital_settings WHERE id=1');
function storageConfig(env){
  let url;
  try{url=new URL(env.SUPABASE_URL||'https://qyyhdfmlvmuqqcihoejg.supabase.co');}catch{throw new DigitalError(503,'Kho tài liệu chưa được cấu hình.');}
  check(url.protocol==='https:'&&/^[a-z0-9]+\.supabase\.co$/.test(url.hostname)&&!url.port&&!url.username&&!url.password&&url.pathname==='/'&&!url.search&&!url.hash,'Kho tài liệu chưa được cấu hình.',503);
  const key=env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY;
  check(typeof key==='string'&&key.length>30&&key.length<10000,'Kho tài liệu chưa được kết nối. Vui lòng liên hệ CLB.',503);
  if(!key.startsWith('sb_secret_')){
    let claims;try{claims=JSON.parse(atob(key.split('.')[1].replaceAll('-','+').replaceAll('_','/')));}catch{}
    check(claims?.role==='service_role','Khóa kho tài liệu không hợp lệ.',503);
  }
  return {url,key};
}
function storageReady(env){try{storageConfig(env);return true;}catch{return false;}}
export function validObjectKey(key){
  return typeof key==='string'&&key.length>0&&key.length<=800&&/^lop-[3-9]\//.test(key)&&/\.pdf$/i.test(key)
    &&/^[A-Za-z0-9_/!.*'() &$=@;:+,?-]+$/.test(key)&&!key.split('/').some(part=>!part||part==='.'||part==='..');
}
async function signFile(env,file){
  check(validObjectKey(file.object_key),'Đường dẫn tài liệu chưa hợp lệ.',503);
  const {url,key}=storageConfig(env),encoded=file.object_key.split('/').map(encodeURIComponent).join('/');
  const endpoint=url.origin+'/storage/v1/object/sign/paid-documents/'+encoded;
  const headers={'Content-Type':'application/json',apikey:key};
  if(!key.startsWith('sb_secret_'))headers.Authorization='Bearer '+key;
  let result,response;
  try{
    response=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({expiresIn:60}),signal:AbortSignal.timeout(10000),redirect:'error'});
    result=await response.json();
  }catch{throw new DigitalError(503,'Chưa kết nối được kho tài liệu. Vui lòng thử lại.');}
  check(response.ok&&typeof result.signedURL==='string','Chưa lấy được tài liệu. Vui lòng liên hệ CLB.',503);
  let signed;try{signed=new URL(result.signedURL.startsWith('/object/')?'/storage/v1'+result.signedURL:result.signedURL,url.origin);}catch{}
  check(signed?.origin===url.origin&&signed.pathname==='/storage/v1/object/sign/paid-documents/'+encoded&&signed.searchParams.has('token'),'Phản hồi kho tài liệu không hợp lệ.',503);
  signed.searchParams.set('download',file.object_key.split('/').at(-1));
  return signed.href;
}
const paymentConfigured=s=>Boolean(s.bank_name&&s.account_number&&s.account_holder);
const paymentPublic=s=>({bank_name:s.bank_name,account_number:s.account_number,account_holder:s.account_holder,instructions:s.instructions,enabled:Boolean(s.accept_orders)&&paymentConfigured(s)});
export async function digitalSummary(db){
  if(!await first(db,"SELECT name FROM sqlite_master WHERE type='table' AND name='digital_orders'"))return {};
  return Object.fromEntries((await all(db,'SELECT status,count(*) AS count FROM digital_orders GROUP BY status')).map(r=>[r.status,r.count]));
}
async function adminProducts(db){
  const products=await all(db,'SELECT p.*,(SELECT count(*) FROM digital_files f WHERE f.product_id=p.id) AS file_count FROM digital_products p ORDER BY grade,sort_order,id');
  const files=await all(db,'SELECT id,product_id,label,object_key FROM digital_files ORDER BY sort_order,id');
  return products.map(p=>({...p,active:Boolean(p.active),is_draft:Boolean(p.is_draft),files:files.filter(f=>f.product_id===p.id)}));
}
export async function handleDigitalApi(request,db,env,admin){
  check(db,'Dịch vụ tài liệu chưa sẵn sàng.',503);
  const url=new URL(request.url),path=url.pathname,method=request.method;
  check(await first(db,"SELECT name FROM sqlite_master WHERE type='table' AND name='digital_products'"),'Danh mục tài liệu đang được chuẩn bị.',503);
  if(path==='/api/digital/products'&&method==='GET'){
    const s=await settings(db),products=await all(db,'SELECT p.*,(SELECT count(*) FROM digital_files f WHERE f.product_id=p.id) AS file_count FROM digital_products p WHERE active=1 ORDER BY grade,sort_order,id');
    return json({products:products.map(publicProduct),checkout_enabled:Boolean(s.accept_orders)&&paymentConfigured(s)&&storageReady(env)});
  }
  if(path.startsWith('/api/admin/digital-')){
    check(admin,'Vui lòng đăng nhập quản trị.',401);
    if(path==='/api/admin/digital-settings'){
      const s=await settings(db);
      if(method==='GET')return json({...s,accept_orders:Boolean(s.accept_orders),storage_configured:storageReady(env)});
      if(method==='PATCH'){
        const input=await body(request);check(Number.isInteger(input.expected_version)&&input.expected_version===s.version,'Cấu hình đã thay đổi. Vui lòng tải lại.',409);
        check(typeof input.accept_orders==='boolean','Trạng thái mở bán không hợp lệ.');
        const next={bank_name:text(input.bank_name,'Ngân hàng',100,false),account_number:text(input.account_number,'Số tài khoản',34,false),account_holder:text(input.account_holder,'Chủ tài khoản',120,false),instructions:text(input.instructions,'Hướng dẫn',1000,false)};
        check(!next.account_number||/^[A-Za-z0-9 -]+$/.test(next.account_number),'Số tài khoản không hợp lệ.');
        if(input.accept_orders){check(paymentConfigured(next),'Điền đầy đủ thông tin nhận chuyển khoản trước khi mở bán.');check(storageReady(env),'Cần kết nối kho tài liệu trước khi mở bán.',503);}
        const result=await q(db,'UPDATE digital_settings SET bank_name=?,account_number=?,account_holder=?,instructions=?,accept_orders=?,version=version+1 WHERE id=1 AND version=?',next.bank_name,next.account_number,next.account_holder,next.instructions,Number(input.accept_orders),s.version).run();
        check(result.meta.changes===1,'Cấu hình đã thay đổi. Vui lòng tải lại.',409);return json({saved:true});
      }
    }
    if(path==='/api/admin/digital-products'&&method==='GET')return json({products:await adminProducts(db)});
    const productMatch=path.match(/^\/api\/admin\/digital-products\/([a-z0-9-]+)$/);
    if(productMatch&&method==='PATCH'){
      const input=await body(request),p=await first(db,'SELECT * FROM digital_products WHERE id=?',productMatch[1]);check(p,'Không tìm thấy tài liệu.',404);
      check(Number.isInteger(input.expected_version)&&input.expected_version===p.version,'Tài liệu đã thay đổi. Vui lòng tải lại.',409);
      const title=text(input.title,'Tên tài liệu',200),description=text(input.description,'Mô tả',2000);
      check(Number.isSafeInteger(input.price_vnd)&&input.price_vnd>=1000&&input.price_vnd<=100000000,'Giá bán phải từ 1.000 đến 100.000.000đ.');
      check(typeof input.active==='boolean'&&typeof input.is_draft==='boolean','Trạng thái tài liệu không hợp lệ.');
      const files=await all(db,'SELECT id,label,object_key FROM digital_files WHERE product_id=? ORDER BY id',p.id);
      check(Array.isArray(input.files)&&input.files.length===files.length,'Danh sách file không hợp lệ.');
      const seen=new Set(),updates=input.files.map(file=>{
        check(file&&files.some(f=>f.id===file.id)&&!seen.has(file.id),'File không hợp lệ.');seen.add(file.id);
        check(validObjectKey(file.object_key)&&file.object_key.startsWith('lop-'+p.grade+'/'),'Đường dẫn PDF phải đúng lớp, không dấu và nằm trong bucket.');
        return {id:file.id,label:text(file.label,'Tên file',120),object_key:file.object_key};
      });
      check(new Set(updates.map(f=>f.object_key)).size===updates.length,'Các file trong bộ không được trùng.');
      if(!input.is_draft)for(const file of updates)await signFile(env,file);
      const editToken=randomUUID();
      const result=await db.batch([
        q(db,'UPDATE digital_products SET title=?,description=?,price_vnd=?,active=?,is_draft=?,edit_token=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND version=?',title,description,input.price_vnd,Number(input.active),Number(input.is_draft),editToken,p.id,p.version),
        ...updates.map(file=>q(db,'UPDATE digital_files SET label=?,object_key=? WHERE id=? AND product_id=? AND EXISTS(SELECT 1 FROM digital_products WHERE id=? AND edit_token=?)',file.label,file.object_key,file.id,p.id,p.id,editToken))
      ]);
      check(result[0].meta.changes===1,'Tài liệu đã thay đổi. Vui lòng tải lại.',409);return json({saved:true});
    }
    const match=path.match(/^\/api\/admin\/digital-orders(?:\/([A-Za-z0-9-]+)(?:\/(status))?)?$/);
    if(match){
      const [,id,action]=match;
      if(!id&&method==='GET'){
        const limit=Number(url.searchParams.get('limit')||20),offset=Number(url.searchParams.get('offset')||0),status=url.searchParams.get('status')||'',search=text(url.searchParams.get('q'),'Từ khóa',120,false);
        check(Number.isInteger(limit)&&limit>=1&&limit<=100&&Number.isSafeInteger(offset)&&offset>=0,'Phân trang không hợp lệ.');check(!status||Object.hasOwn(states,status),'Trạng thái không hợp lệ.');
        const where="WHERE (?='' OR status=?) AND (?='' OR instr(lower(parent_name),lower(?))>0 OR instr(phone,?)>0 OR instr(lower(email),lower(?))>0 OR instr(id,?)>0)",args=[status,status,search,search,search,search,search];
        const count=await first(db,'SELECT count(*) AS total FROM digital_orders '+where,...args);
        const rows=await all(db,'SELECT id,product_id,title,grade,parent_name,email,phone,amount_vnd,status,version,created_at,updated_at FROM digital_orders '+where+' ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?',...args,limit,offset);
        return json({data:rows,total:count.total});
      }
      const row=await first(db,'SELECT * FROM digital_orders WHERE id=?',id);check(row,'Không tìm thấy đơn tài liệu.',404);
      if(!action&&method==='GET'){
        delete row.request_key;delete row.request_hash;delete row.customer_id;
        row.allowed_statuses=states[row.status];row.history=await all(db,'SELECT from_status,to_status,actor,note,created_at FROM digital_order_history WHERE order_id=? ORDER BY id',id);return json(row);
      }
      if(action==='status'&&method==='PATCH'){
        const input=await body(request);check(input.expected_status===row.status&&input.expected_version===row.version,'Đơn đã thay đổi. Vui lòng mở lại.',409);
        check(states[row.status].includes(input.status),'Không thể chuyển trạng thái.');
        if(input.status==='paid')check(input.payment_verified===true,'Chỉ xác nhận sau khi đã kiểm tra tiền thực nhận.');
        const note=text(input.note,'Ghi chú xử lý',1000,false),actor=admin.username||'admin';
        const result=await db.batch([
          q(db,'INSERT INTO digital_order_history(order_id,from_status,to_status,actor,note) SELECT id,status,?,?,? FROM digital_orders WHERE id=? AND version=? AND status=?',input.status,actor,note,id,row.version,row.status),
          q(db,'UPDATE digital_orders SET status=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND version=? AND status=?',input.status,id,row.version,row.status)
        ]);
        check(result[1].meta.changes===1,'Đơn đã thay đổi. Vui lòng mở lại.',409);return json({id,status:input.status});
      }
    }
  }
  if(path==='/api/digital/orders'&&method==='POST'){
    const input=await body(request);
    await edgeRateLimit(db,'digital-order-ip',request.headers.get('CF-Connecting-IP')||'local',40);
    const user=await customer(request,env);check(user.email,'Tài khoản cần có email để mua tài liệu.');
    await edgeRateLimit(db,'digital-order-account',user.id,15);
    const key=request.headers.get('Idempotency-Key');check(/^[A-Za-z0-9-]{16,100}$/.test(key||''),'Thiếu mã xác nhận đơn.');
    const productId=text(input.product_id,'Tài liệu',100),name=text(input.name,'Họ tên',120);
    const phone=text(input.phone,'Số điện thoại',30).replace(/[\s().-]/g,'').replace(/^\+84/,'0').replace(/^84(?=\d{9}$)/,'0');
    check(/^0[35789]\d{8}$/.test(phone),'Số điện thoại không hợp lệ.');check(input.consent===true,'Vui lòng đồng ý để CLB xử lý đơn.');
    const normalized={productId,name,phone,price:input.expected_price_vnd,version:input.expected_version},hash=digest(normalized);
    const previous=await first(db,'SELECT * FROM digital_orders WHERE customer_id=? AND request_key=?',user.id,key);
    if(previous){check(previous.request_hash===hash,'Mã gửi đã dùng cho nội dung khác.',409);return json(receipt(previous));}
    const p=await first(db,'SELECT * FROM digital_products WHERE id=? AND active=1 AND is_draft=0',productId);check(p,'Tài liệu này chưa mở bán.',409);
    const s=await settings(db);check(s.accept_orders&&paymentConfigured(s)&&storageReady(env),'CLB đang chuẩn bị mở bán tài liệu. Vui lòng quay lại sau.',503);
    check(input.expected_price_vnd===p.price_vnd&&input.expected_version===p.version,'Giá hoặc nội dung đã thay đổi. Vui lòng tải lại danh mục.',409);
    check(!await first(db,"SELECT id FROM digital_orders WHERE customer_id=? AND product_id=? AND status IN ('pending','paid')",user.id,p.id),'Bạn đã có đơn chờ xác nhận hoặc đã mua bộ này. Xem Tài liệu của tôi.',409);
    const id='TL-'+randomUUID();
    let result;
    try{result=await db.batch([
      q(db,"INSERT INTO digital_orders(id,customer_id,product_id,title,grade,parent_name,email,phone,amount_vnd,request_key,request_hash) SELECT ?,?,id,title,grade,?,?,?,?,?,? FROM digital_products WHERE id=? AND version=? AND active=1 AND is_draft=0 AND EXISTS(SELECT 1 FROM digital_settings WHERE id=1 AND version=? AND accept_orders=1)",id,user.id,name,user.email,phone,p.price_vnd,key,hash,p.id,p.version,s.version),
      q(db,"INSERT INTO digital_order_history(order_id,to_status,actor) SELECT id,'pending','customer' FROM digital_orders WHERE id=?",id)
    ]);}catch(error){
      const replay=await first(db,'SELECT * FROM digital_orders WHERE customer_id=? AND request_key=?',user.id,key);
      if(replay){check(replay.request_hash===hash,'Mã gửi đã dùng cho nội dung khác.',409);return json(receipt(replay));}
      if(await first(db,"SELECT id FROM digital_orders WHERE customer_id=? AND product_id=? AND status IN ('pending','paid')",user.id,p.id))throw new DigitalError(409,'Bạn đã có đơn cho tài liệu này. Xem Tài liệu của tôi.');
      throw error;
    }
    check(result[0].meta.changes===1,'Tài liệu đã thay đổi. Vui lòng thử lại.',409);
    return json(receipt(await first(db,'SELECT * FROM digital_orders WHERE id=?',id)),201);
  }
  if(path.startsWith('/api/customer/digital-orders')){
    origin(request);
    await edgeRateLimit(db,'digital-access-ip',request.headers.get('CF-Connecting-IP')||'local',150);
    const user=await customer(request,env);
    if(path==='/api/customer/digital-orders'&&method==='GET'){
      const rows=await all(db,'SELECT id,product_id,title,grade,amount_vnd,status,created_at FROM digital_orders WHERE customer_id=? ORDER BY created_at DESC,id DESC LIMIT 100',user.id);
      for(const row of rows)if(row.status==='paid')row.files=await all(db,'SELECT id,label FROM digital_files WHERE product_id=? ORDER BY sort_order,id',row.product_id);
      return json({orders:rows,payment:paymentPublic(await settings(db))});
    }
    const download=path.match(/^\/api\/customer\/digital-orders\/([A-Za-z0-9-]+)\/files\/([a-z0-9-]+)\/download$/);
    if(download&&method==='POST'){
      await body(request);await edgeRateLimit(db,'digital-download-account',user.id,40);
      const file=await first(db,"SELECT f.id,f.label,f.object_key FROM digital_files f JOIN digital_orders o ON o.product_id=f.product_id WHERE o.id=? AND o.customer_id=? AND o.status='paid' AND f.id=?",download[1],user.id,download[2]);
      check(file,'Bạn chưa có quyền tải tài liệu này.',404);
      const signed=await signFile(env,file);
      check(await first(db,"SELECT id FROM digital_orders WHERE id=? AND customer_id=? AND status='paid'",download[1],user.id),'Quyền tải đã được cập nhật. Vui lòng tải lại danh sách.',403);
      return json({url:signed,expires_in:60});
    }
  }
  throw new DigitalError(404,'API không tồn tại.');
}
