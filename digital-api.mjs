import {digitalPreviews} from './digital-catalog.mjs';
import {customer} from './customer-auth.mjs';
import {readJson} from './security.mjs';
import {edgeRateLimit} from './edge-rate-limit.mjs';

export class DigitalError extends Error {constructor(status,message){super(message);this.status=status;}}
const check=(condition,message,status=400)=>{if(!condition)throw new DigitalError(status,message);};
const q=(db,sql,...args)=>db.prepare(sql).bind(...args);
const first=(db,sql,...args)=>q(db,sql,...args).first();
const all=async(db,sql,...args)=>(await q(db,sql,...args).all()).results;
const json=data=>Response.json(data,{headers:{'Cache-Control':'no-store'}});
const closed='Tài liệu hiện là bản đọc thử miễn phí. Website không nhận thanh toán hoặc cấp quyền tải riêng.';
async function hasHistory(db){return Boolean(db&&await first(db,"SELECT name FROM sqlite_master WHERE type='table' AND name='digital_orders'"));}
function sameOrigin(request){const origin=request.headers.get('Origin');check(request.headers.get('Sec-Fetch-Site')!=='cross-site'&&(!origin||origin===new URL(request.url).origin),'Nguồn yêu cầu không hợp lệ.',403);}
export async function digitalSummary(db){
  if(!await hasHistory(db))return {};
  return Object.fromEntries((await all(db,'SELECT status,count(*) AS count FROM digital_orders GROUP BY status')).map(r=>[r.status,r.count]));
}
export async function handleDigitalApi(request,db,env,admin){
  const url=new URL(request.url),path=url.pathname,method=request.method;
  if(path==='/api/digital/products'&&method==='GET')return json({mode:'public-previews',preview_only:true,checkout_enabled:false,products:digitalPreviews});
  // Retired payment and signing routes stay closed even if old secrets or settings remain.
  if(path==='/api/digital/orders'||/^\/api\/customer\/digital-orders\/.+\/download$/.test(path))throw new DigitalError(410,closed);
  if(path.startsWith('/api/admin/digital-')){
    check(admin,'Vui lòng đăng nhập quản trị.',401);
    if(path==='/api/admin/digital-products'&&method==='GET')return json({mode:'public-previews',readonly:true,products:digitalPreviews});
    if(path==='/api/admin/digital-settings'&&method==='GET')return json({mode:'public-previews',readonly:true,accept_orders:false,storage_configured:false});
    if(path.startsWith('/api/admin/digital-products')||path==='/api/admin/digital-settings')throw new DigitalError(410,closed);
    const match=path.match(/^\/api\/admin\/digital-orders(?:\/([A-Za-z0-9-]+)(?:\/(status))?)?$/);
    if(match){
      const [,id,action]=match;
      if(!await hasHistory(db)){if(!id&&method==='GET')return json({data:[],total:0});throw new DigitalError(404,'Không tìm thấy đơn cũ.');}
      if(!id&&method==='GET'){
        const limit=Number(url.searchParams.get('limit')||20),offset=Number(url.searchParams.get('offset')||0),status=url.searchParams.get('status')||'',search=url.searchParams.get('q')||'';
        check(Number.isInteger(limit)&&limit>=1&&limit<=100&&Number.isSafeInteger(offset)&&offset>=0&&search.length<=120,'Phân trang không hợp lệ.');
        check(!status||['pending','paid','cancelled','revoked'].includes(status),'Trạng thái không hợp lệ.');
        const where="WHERE (?='' OR status=?) AND (?='' OR instr(lower(parent_name),lower(?))>0 OR instr(phone,?)>0 OR instr(lower(email),lower(?))>0 OR instr(id,?)>0)",args=[status,status,search,search,search,search,search];
        const count=await first(db,'SELECT count(*) AS total FROM digital_orders '+where,...args);
        return json({data:await all(db,'SELECT id,product_id,title,grade,parent_name,email,phone,amount_vnd,status,version,created_at,updated_at FROM digital_orders '+where+' ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?',...args,limit,offset),total:count.total});
      }
      const row=await first(db,'SELECT * FROM digital_orders WHERE id=?',id);check(row,'Không tìm thấy đơn cũ.',404);
      const allowed=row.status==='pending'?['cancelled']:row.status==='paid'?['revoked']:[];
      if(!action&&method==='GET'){
        delete row.customer_id;delete row.request_key;delete row.request_hash;
        row.allowed_statuses=allowed;row.history=await all(db,'SELECT from_status,to_status,actor,note,created_at FROM digital_order_history WHERE order_id=? ORDER BY id',id);return json(row);
      }
      if(action==='status'&&method==='PATCH'){
        sameOrigin(request);const input=await readJson(request);
        check(input.expected_status===row.status&&input.expected_version===row.version,'Đơn đã thay đổi. Vui lòng mở lại.',409);
        check(allowed.includes(input.status),'Chỉ có thể hủy đơn cũ hoặc thu hồi quyền cũ. Không xác nhận thanh toán mới.');
        check(input.note==null||typeof input.note==='string'&&input.note.length<=1000,'Ghi chú không hợp lệ.');
        const results=await db.batch([
          q(db,'INSERT INTO digital_order_history(order_id,from_status,to_status,actor,note) SELECT id,status,?,?,? FROM digital_orders WHERE id=? AND version=? AND status=?',input.status,admin.username||'admin',input.note||'',id,row.version,row.status),
          q(db,'UPDATE digital_orders SET status=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND version=? AND status=?',input.status,id,row.version,row.status)
        ]);
        check(results[1].meta.changes===1,'Đơn đã thay đổi. Vui lòng mở lại.',409);return json({id,status:input.status});
      }
    }
  }
  if(path==='/api/customer/digital-orders'&&method==='GET'){
    sameOrigin(request);if(db)await edgeRateLimit(db,'digital-history-access',request.headers.get('CF-Connecting-IP')||'local',150);const user=await customer(request,env);
    const rows=await hasHistory(db)?await all(db,'SELECT id,product_id,title,grade,amount_vnd,status,created_at FROM digital_orders WHERE customer_id=? ORDER BY created_at DESC,id DESC LIMIT 100',user.id):[];
    return json({mode:'public-previews',orders:rows,payment:{enabled:false}});
  }
  throw new DigitalError(404,'API không tồn tại.');
}
