import { createHash,randomUUID } from 'node:crypto';
export class StemError extends Error {constructor(status,message){super(message);this.status=status;}}
const check=(value,message,status=400)=>{if(!value)throw new StemError(status,message);};
export const stemStates={new:['contacted','cancelled'],contacted:['advising','enrolled','cancelled'],advising:['enrolled','cancelled'],enrolled:[],cancelled:[]};
const levels=['consolidation','basic','advanced','olympiad'];
const hash=value=>createHash('sha256').update(value).digest('hex');
const query=(db,sql,...args)=>db.prepare(sql).bind(...args);
const first=(db,sql,...args)=>query(db,sql,...args).first();
const all=async(db,sql,...args)=>(await query(db,sql,...args).all()).results;
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY'}});
function text(value,label,max,required=true){check(typeof value==='string'||(!required&&value==null),`${label} không hợp lệ.`);const result=(value||'').trim();check(result.length<=max&&(!required||result.length>0),`${label} không hợp lệ.`);return result;}
async function readBody(request){
  check(request.headers.get('Content-Type')?.startsWith('application/json'),'Yêu cầu phải dùng JSON.',415);
  const origin=request.headers.get('Origin');
  check(request.headers.get('Sec-Fetch-Site')!=='cross-site'&&(!origin||origin===new URL(request.url).origin),'Nguồn yêu cầu không hợp lệ.',403);
  const reader=request.body?.getReader();check(reader,'Thiếu dữ liệu.');let size=0;const chunks=[];
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>32768){await reader.cancel();throw new StemError(413,'Nội dung quá dài.');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  let result;try{result=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new StemError(400,'Dữ liệu không hợp lệ.');}
  check(result&&typeof result==='object'&&!Array.isArray(result),'Dữ liệu không hợp lệ.');return result;
}
export async function stemSummary(db){
  if(!await first(db,"SELECT name FROM sqlite_master WHERE type='table' AND name='stem_enquiries'"))return {};
  return Object.fromEntries((await all(db,'SELECT status,count(*) AS count FROM stem_enquiries GROUP BY status')).map(row=>[row.status,row.count]));
}
export async function handleStemApi(request,db,admin){
  check(db,'Dịch vụ chưa sẵn sàng. Vui lòng liên hệ CLB.',503);
  const url=new URL(request.url),path=url.pathname,method=request.method;
  if(!await first(db,"SELECT name FROM sqlite_master WHERE type='table' AND name='stem_programs'"))throw new StemError(503,'Chương trình chưa sẵn sàng. Vui lòng liên hệ CLB.');
  if(path==='/api/stem/programs'&&method==='GET')return json({programs:await all(db,'SELECT id,grade,level,title,description FROM stem_programs WHERE active=1 ORDER BY grade,id')});
  if(path==='/api/stem/enquiries'&&method==='POST'){
    const input=await readBody(request),key=request.headers.get('Idempotency-Key');
    check(/^[a-zA-Z0-9-]{16,100}$/.test(key||''),'Thiếu mã xác nhận yêu cầu.');
    const now=Date.now(),bucket=Math.floor(now/900000),rateKey=hash(`stem:${request.headers.get('CF-Connecting-IP')||'local'}:${bucket}`);
    const attempts=await first(db,'INSERT INTO edge_rate_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count',rateKey,(bucket+1)*900000);
    check(attempts.count<=20,'Bạn đã gửi nhiều yêu cầu. Vui lòng thử lại sau 15 phút.',429);
    check(!input.website,'Không thể gửi yêu cầu.');check(input.consent===true,'Vui lòng đồng ý để CLB liên hệ tư vấn.');
    const name=text(input.name,'Họ tên phụ huynh',120),phone=text(input.phone,'Số điện thoại',30).replace(/[\s().-]/g,'').replace(/^\+84/,'0').replace(/^84(?=\d{9}$)/,'0');
    check(/^0[35789]\d{8}$/.test(phone),'Số điện thoại không hợp lệ.');
    const grade=Number(input.grade);check(Number.isInteger(grade)&&grade>=3&&grade<=9,'Chọn lớp từ 3 đến 9.');
    check(levels.includes(input.level),'Chọn nhu cầu học.');
    check(typeof input.specialist_goal==='boolean','Mục tiêu học không hợp lệ.');
    check(!input.specialist_goal||grade>=6,'Định hướng thi chuyên dành cho lớp 6–9.');
    const note=text(input.note,'Ghi chú',2000,false);
    const normalized={name,phone,grade,level:input.level,specialist_goal:input.specialist_goal,note,consent:true};
    const digest=hash(JSON.stringify(normalized));
    const receipt=row=>({id:row.id,status:row.status,created_at:row.created_at});
    const existing=await first(db,'SELECT id,status,created_at,request_hash FROM stem_enquiries WHERE request_key=?',key);
    if(existing){check(existing.request_hash===digest,'Mã yêu cầu đã dùng cho nội dung khác.',409);return json(receipt(existing));}
    const program=await first(db,'SELECT id,title FROM stem_programs WHERE grade=? AND level=? AND active=1',grade,input.level);check(program,'Chương trình chưa nhận tư vấn.');
    const id='STEM-'+randomUUID();
    try{await db.batch([
      query(db,'DELETE FROM edge_rate_limits WHERE expires_at<=?',now),
      query(db,'INSERT INTO stem_enquiries(id,request_key,request_hash,parent_name,phone,grade,program_id,program_title,level,specialist_goal,consent,note) VALUES(?,?,?,?,?,?,?,?,?,?,1,?)',id,key,digest,name,phone,grade,program.id,program.title,input.level,Number(input.specialist_goal),note),
      query(db,"INSERT INTO stem_enquiry_history(enquiry_id,to_status) VALUES(?,'new')",id)
    ]);}catch(error){const replay=await first(db,'SELECT id,status,created_at,request_hash FROM stem_enquiries WHERE request_key=?',key);if(!replay)throw error;check(replay.request_hash===digest,'Mã yêu cầu đã dùng cho nội dung khác.',409);return json(receipt(replay));}
    return json(receipt(await first(db,'SELECT id,status,created_at FROM stem_enquiries WHERE id=?',id)),201);
  }
  const match=path.match(/^\/api\/admin\/stem-enquiries(?:\/([^/]+)(?:\/(status|notes))?)?$/);
  if(match){
    check(admin,'Vui lòng đăng nhập quản trị.',401);const [,id,action]=match;
    if(!id&&method==='GET'){
      const limit=Number(url.searchParams.get('limit')||20),offset=Number(url.searchParams.get('offset')||0),status=url.searchParams.get('status')||'',q=text(url.searchParams.get('q'),'Từ khóa',120,false);
      check(Number.isInteger(limit)&&limit>=1&&limit<=100&&Number.isSafeInteger(offset)&&offset>=0,'Phân trang không hợp lệ.');check(!status||Object.hasOwn(stemStates,status),'Trạng thái không hợp lệ.');
      const where="WHERE (?='' OR status=?) AND (?='' OR instr(lower(parent_name),lower(?))>0 OR instr(phone,?)>0 OR instr(id,?)>0)",args=[status,status,q,q,q,q];
      const count=await first(db,`SELECT count(*) AS total FROM stem_enquiries ${where}`,...args);
      return json({data:await all(db,`SELECT id,parent_name,phone,grade,program_title,level,specialist_goal,note,status,created_at,updated_at FROM stem_enquiries ${where} ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`,...args,limit,offset),total:count.total});
    }
    const row=await first(db,'SELECT * FROM stem_enquiries WHERE id=?',id);check(row,'Không tìm thấy yêu cầu.',404);
    if(!action&&method==='GET'){delete row.request_hash;delete row.request_key;row.allowed_statuses=stemStates[row.status];row.history=await all(db,'SELECT from_status,to_status,event_type,actor,created_at FROM stem_enquiry_history WHERE enquiry_id=? ORDER BY id',id);return json(row);}
    if(action==='status'&&method==='PATCH'){
      const input=await readBody(request);check(input.expected_status===row.status,'Trạng thái đã thay đổi. Mở lại phiếu.',409);check(stemStates[row.status].includes(input.status),'Không thể chuyển trạng thái.');
      const result=await db.batch([
        query(db,'INSERT INTO stem_enquiry_history(enquiry_id,from_status,to_status,actor) SELECT id,status,?,? FROM stem_enquiries WHERE id=? AND status=?',input.status,admin.username||'admin',id,row.status),
        query(db,'UPDATE stem_enquiries SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status=?',input.status,id,row.status)
      ]);check(result[1].meta.changes===1,'Trạng thái đã thay đổi. Mở lại phiếu.',409);return json({id,status:input.status});
    }
    if(action==='notes'&&method==='PATCH'){
      const input=await readBody(request),note=text(input.staff_note,'Ghi chú nội bộ',2000,false);check(input.expected_note===row.staff_note,'Ghi chú đã thay đổi. Mở lại phiếu.',409);
      const result=await db.batch([
        query(db,"INSERT INTO stem_enquiry_history(enquiry_id,from_status,to_status,event_type,actor) SELECT id,status,status,'note',? FROM stem_enquiries WHERE id=? AND staff_note=?",admin.username||'admin',id,row.staff_note),
        query(db,'UPDATE stem_enquiries SET staff_note=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND staff_note=?',note,id,row.staff_note)
      ]);check(result[1].meta.changes===1,'Ghi chú đã thay đổi. Mở lại phiếu.',409);return json({id,staff_note:note});
    }
  }
  throw new StemError(404,'API không tồn tại.');
}
