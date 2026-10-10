import { randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { db, products, landing, transaction } from './database/db.mjs';

class ApiError extends Error { constructor(status,message) { super(message); this.status=status; } }
function check(condition,message) { if (!condition) throw new ApiError(400,message); }
function json(response,status,data) {
  response.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  response.end(JSON.stringify(data));
}
async function body(request) {
  const chunks=[]; let size=0;
  for await (const chunk of request) {
    size+=chunk.length; if(size>32768) throw new ApiError(413,'Nội dung yêu cầu quá lớn.');
    chunks.push(chunk);
  }
  try { const value=JSON.parse(Buffer.concat(chunks).toString('utf8')); check(value && typeof value==='object' && !Array.isArray(value),'Dữ liệu không hợp lệ.'); return value; }
  catch(error) { if(error instanceof ApiError) throw error; throw new ApiError(400,'JSON không hợp lệ.'); }
}
function string(value,label,max=200,required=true) {
  check(typeof value==='string' || (!required && value==null),`${label} không hợp lệ.`);
  const result=(value || '').trim();
  check((!required || result.length>0) && result.length<=max,`${label} phải có ${required?'1':'0'}–${max} ký tự.`);
  return result;
}
function contact(input) {
  const phone=string(input.phone,'Số điện thoại',30).replace(/[\s().-]/g,'').replace(/^\+84/,'0').replace(/^84(?=\d{9}$)/,'0');
  check(/^0[35789]\d{8}$/.test(phone),'Vui lòng nhập số điện thoại di động Việt Nam hợp lệ.');
  const grade=Number(input.grade); check(Number.isInteger(grade) && grade>=2 && grade<=9,'Lớp phải từ 2 đến 9.');
  return {name:string(input.name,'Họ tên',120),phone,grade,note:string(input.note,'Ghi chú',2000,false)};
}
function key(request) { const value=request.headers['idempotency-key']; check(typeof value==='string' && /^[a-zA-Z0-9-]{16,100}$/.test(value),'Thiếu hoặc sai Idempotency-Key.'); return value; }
function hash(input) { return createHash('sha256').update(JSON.stringify(input)).digest('hex'); }
function receipt(row) { return {id:row.id,status:row.status,...('total_vnd' in row?{subtotal_vnd:row.subtotal_vnd,shipping_vnd:row.shipping_vnd,total_vnd:row.total_vnd,payment_method:row.payment_method}:{})}; }
function previous(table,requestKey,digest) {
  const row=db.prepare(`SELECT * FROM ${table} WHERE request_key=?`).get(requestKey);
  if(row && row.request_hash!==digest) throw new ApiError(409,'Mã gửi đã được sử dụng cho nội dung khác.');
  return row;
}
function admin(request) {
  const token=process.env.ADMIN_API_TOKEN;
  if(!token || token.length<32) throw new ApiError(503,'API quản trị chưa được cấu hình.');
  const actual=Buffer.from(request.headers.authorization || ''); const expected=Buffer.from(`Bearer ${token}`);
  if(actual.length!==expected.length || !timingSafeEqual(actual,expected)) throw new ApiError(401,'Không có quyền quản trị.');
}
function mediaUrl(value) {
  if(typeof value!=='string' || value.length>2000) return false;
  try {
    if(value.startsWith('/assets/')) { const decoded=decodeURIComponent(value); return !/[\\\u0000-\u001f]/.test(decoded) && !decoded.split('/').includes('..'); }
    return new URL(value).protocol==='https:';
  } catch {return false;}
}
const contentTables={
  faqs:['question','answer','active','sort_order'],
  gifts:['title','description','resource_url','active','sort_order'],
  testimonials:['quote','display_name','context','is_composite','published','sort_order'],
  achievements:['metric','title','description','is_composite','published','sort_order']
};
const transitions={orders:{pending:['confirmed','cancelled'],confirmed:['shipping','cancelled'],shipping:['completed'],completed:[],cancelled:[]},consultations:{new:['contacted','cancelled'],contacted:['resolved','cancelled'],resolved:[],cancelled:[]}};
export async function handleApi(request,response,url) {
  try {
    const path=url.pathname, method=request.method;
    if(path==='/api/landing' && method==='GET') return json(response,200,landing());
    if(path==='/api/products' && method==='GET') return json(response,200,{products:products()});
    if(['/api/orders','/api/consultations'].includes(path) && method==='POST') {
      if(request.headers.origin && ![`http://${request.headers.host}`,`https://${request.headers.host}`].includes(request.headers.origin)) throw new ApiError(403,'Nguồn gửi không hợp lệ.');
      const input=await body(request), person=contact(input), requestKey=key(request);
      if(path==='/api/consultations') {
        const digest=hash(person);
        const result=transaction(()=>{
          const existing=previous('consultations',requestKey,digest); if(existing) return {row:existing,replay:true};
          const id=`TV-${randomUUID()}`;
          db.prepare('INSERT INTO consultations(id,request_key,request_hash,parent_name,phone,grade,note) VALUES(?,?,?,?,?,?,?)').run(id,requestKey,digest,person.name,person.phone,person.grade,person.note);
          db.prepare("INSERT INTO request_history(consultation_id,to_status) VALUES(?,'new')").run(id);
          return {row:db.prepare('SELECT * FROM consultations WHERE id=?').get(id)};
        });
        return json(response,result.replay?200:201,receipt(result.row));
      }
      const address=string(input.address,'Địa chỉ',500);
      check(Array.isArray(input.items) && input.items.length>0 && input.items.length<=10,'Vui lòng chọn từ 1 đến 10 đầu sách.');
      const seen=new Set();
      const items=input.items.map(item=>{
        check(item && typeof item.product_id==='string' && !seen.has(item.product_id),'Sách trùng hoặc không hợp lệ.'); seen.add(item.product_id);
        check(Number.isInteger(item.quantity) && item.quantity>=1 && item.quantity<=20,'Số lượng mỗi cuốn phải từ 1 đến 20.');
        return {product_id:item.product_id,quantity:item.quantity};
      }).sort((a,b)=>a.product_id.localeCompare(b.product_id));
      const digest=hash({...person,address,items});
      const result=transaction(()=>{
        const existing=previous('orders',requestKey,digest); if(existing) return {row:existing,replay:true};
        const resolved=items.map(item=>{
          const product=db.prepare('SELECT * FROM products WHERE id=? AND active=1').get(item.product_id);
          check(product,`Sách ${item.product_id} hiện không có trong danh mục.`); return {...item,product};
        });
        const subtotal=resolved.reduce((sum,item)=>sum+item.product.price_vnd*item.quantity,0);
        const policy=JSON.parse(db.prepare("SELECT value_json FROM site_content WHERE key='sales_policy'").get().value_json), shipping=policy.shipping_vnd;
        check(Number.isSafeInteger(shipping) && shipping>=0 && Number.isSafeInteger(subtotal+shipping),'Chính sách giá không hợp lệ.');
        const id=`DH-${randomUUID()}`;
        db.prepare('INSERT INTO orders(id,request_key,request_hash,parent_name,phone,grade,address,note,subtotal_vnd,shipping_vnd,total_vnd) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,requestKey,digest,person.name,person.phone,person.grade,address,person.note,subtotal,shipping,subtotal+shipping);
        const insert=db.prepare('INSERT INTO order_items(order_id,product_id,title,unit_price_vnd,quantity) VALUES(?,?,?,?,?)');
        for(const item of resolved) insert.run(id,item.product_id,item.product.title,item.product.price_vnd,item.quantity);
        if(policy.gifts_with_order) db.prepare('INSERT INTO order_gifts(order_id,gift_id,title) SELECT ?,id,title FROM gifts WHERE active=1').run(id);
        db.prepare("INSERT INTO request_history(order_id,to_status) VALUES(?,'pending')").run(id);
        return {row:db.prepare('SELECT * FROM orders WHERE id=?').get(id)};
      });
      return json(response,result.replay?200:201,receipt(result.row));
    }
    if(path.startsWith('/api/admin/')) {
      admin(request);
      if(path==='/api/admin/content' && method==='GET') {
        const result={content:landing().content};
        for(const table of Object.keys(contentTables)) result[table]=db.prepare(`SELECT * FROM ${table} ORDER BY sort_order`).all();
        return json(response,200,result);
      }
      const contentMatch=path.match(/^\/api\/admin\/content\/([a-z_]+)$/);
      if(contentMatch && method==='PATCH') {
        const row=db.prepare('SELECT value_json FROM site_content WHERE key=?').get(contentMatch[1]);
        if(!row) throw new ApiError(404,'Không tìm thấy nội dung.');
        const changes=await body(request),current=JSON.parse(row.value_json);
        for(const [field,value] of Object.entries(changes)) {
          check(Object.hasOwn(current,field) && typeof value===typeof current[field],`Trường ${field} không hợp lệ.`);
          if(typeof value==='string') {string(value,field,2000); if(field.endsWith('_url') || ['facebook','youtube'].includes(field)) check(mediaUrl(value),'Đường dẫn không hợp lệ.');}
          if(typeof value==='number') check(Number.isSafeInteger(value) && value>=0 && value<=100000000,'Giá trị số không hợp lệ.');
          if(field==='payment_method') check(value==='cod','Hiện chỉ hỗ trợ COD.');
        }
        const updated={...current,...changes};
        db.prepare('UPDATE site_content SET value_json=?,updated_at=CURRENT_TIMESTAMP WHERE key=?').run(JSON.stringify(updated),contentMatch[1]);
        return json(response,200,updated);
      }
      const collectionMatch=path.match(/^\/api\/admin\/(faqs|gifts|testimonials|achievements)\/([a-z0-9-]+)$/);
      if(collectionMatch && method==='PATCH') {
        const [,table,id]=collectionMatch,changes=await body(request);
        const row=db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id);
        if(!row) throw new ApiError(404,'Không tìm thấy nội dung.');
        const entries=Object.entries(changes);check(entries.length>0,'Chưa có trường cập nhật.');
        for(const [field,value] of entries) {
          check(contentTables[table].includes(field),`Trường ${field} không hợp lệ.`);
          if(['active','published','is_composite'].includes(field)) check(typeof value==='boolean',`${field} phải là boolean.`);
          else if(field==='sort_order') check(Number.isInteger(value) && value>=0 && value<=10000,'Thứ tự không hợp lệ.');
          else if(field==='resource_url') check(value===null || mediaUrl(value),'Đường dẫn không hợp lệ.');
          else string(value,field,2000);
        }
        db.prepare(`UPDATE ${table} SET ${entries.map(([field])=>`${field}=?`).join(',')} WHERE id=?`).run(...entries.map(([,value])=>typeof value==='boolean'?Number(value):value),id);
        return json(response,200,db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id));
      }
      if(path==='/api/admin/products' && method==='GET') return json(response,200,{products:products(true)});
      const match=path.match(/^\/api\/admin\/products\/([a-z0-9-]+)$/);
      if(match && method==='PATCH') {
        const input=await body(request), current=db.prepare('SELECT * FROM products WHERE id=?').get(match[1]);
        if(!current) throw new ApiError(404,'Không tìm thấy sách.');
        const price=input.price_vnd ?? current.price_vnd;
        check(Number.isSafeInteger(price) && price>0 && price<=100000000,'Giá phải là số nguyên VND từ 1 đến 100.000.000.');
        check(input.active===undefined || typeof input.active==='boolean','active phải là boolean.');
        for(const kind of ['cover','sample']) if(input[`${kind}_url`]!==undefined && input[`${kind}_url`]!==null) {
          const value=input[`${kind}_url`];
          check(mediaUrl(value),`Đường dẫn ${kind} phải là /assets/... hoặc URL HTTPS.`);
        }
        transaction(()=>{
          db.prepare('UPDATE products SET title=?,description=?,price_vnd=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(input.title===undefined?current.title:string(input.title,'Tên sách',200),input.description===undefined?current.description:string(input.description,'Mô tả',2000),price,input.active===undefined?current.active:Number(input.active),current.id);
          for(const kind of ['cover','sample']) if(input[`${kind}_url`]!==undefined) {
            if(input[`${kind}_url`]===null) db.prepare('DELETE FROM product_media WHERE product_id=? AND kind=?').run(current.id,kind);
            else db.prepare('INSERT INTO product_media(product_id,kind,url,alt) VALUES(?,?,?,?) ON CONFLICT(product_id,kind) DO UPDATE SET url=excluded.url,alt=excluded.alt').run(current.id,kind,input[`${kind}_url`],input.title || current.title);
          }
        });
        return json(response,200,products(true).find(p=>p.id===current.id));
      }
      for(const table of ['orders','consultations']) {
        if(path===`/api/admin/${table}` && method==='GET') {
          const limit=Math.min(100,Math.max(1,Number(url.searchParams.get('limit'))||25)),offset=Math.max(0,Number(url.searchParams.get('offset'))||0);
          check(Number.isInteger(limit) && Number.isInteger(offset),'Phân trang không hợp lệ.');
          const rows=db.prepare(`SELECT * FROM ${table} ORDER BY created_at DESC,id LIMIT ? OFFSET ?`).all(limit,offset).map(row=>{
            delete row.request_key; delete row.request_hash;
            if(table==='orders') {row.items=db.prepare('SELECT product_id,title,unit_price_vnd,quantity FROM order_items WHERE order_id=?').all(row.id); row.gifts=db.prepare('SELECT gift_id,title FROM order_gifts WHERE order_id=?').all(row.id);}
            return row;
          });
          return json(response,200,{data:rows,total:db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n,limit,offset});
        }
        const statusMatch=path.match(new RegExp(`^/api/admin/${table}/([A-Za-z0-9-]+)/status$`));
        if(statusMatch && method==='PATCH') {
          const input=await body(request);
          const row=transaction(()=>{
            const current=db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(statusMatch[1]);
            if(!current) throw new ApiError(404,'Không tìm thấy yêu cầu.');
            if(input.status===current.status) return current;
            check(transitions[table][current.status].includes(input.status),'Chuyển trạng thái không hợp lệ.');
            db.prepare(`UPDATE ${table} SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(input.status,current.id);
            db.prepare(`INSERT INTO request_history(${table==='orders'?'order_id':'consultation_id'},from_status,to_status) VALUES(?,?,?)`).run(current.id,current.status,input.status);
            return db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(current.id);
          });
          return json(response,200,receipt(row));
        }
      }
    }
    throw new ApiError(404,'API không tồn tại.');
  } catch(error) {
    if(!(error instanceof ApiError)) console.error(error);
    json(response,error.status || 500,{error:error.status?error.message:'Không thể xử lý yêu cầu. Vui lòng thử lại.'});
  }
}
