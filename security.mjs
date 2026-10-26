// Shared by Node, both Pages workers and their static build headers.
export class SecurityError extends Error {
  constructor(status,message){super(message);this.status=status;}
}
export const policies={
  api:"default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  admin:"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  stem:"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  books:"default-src 'self'; script-src 'self' https://www.gstatic.com https://apis.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com https://*.firebaseapp.com; frame-src https://*.firebaseapp.com https://accounts.google.com; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
};
export function securityHeaders({https=false,policy=policies.api,sensitive=false}={}){
  return {
    'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY',
    'Referrer-Policy':'strict-origin-when-cross-origin',
    'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
    'Cross-Origin-Resource-Policy':'same-origin',
    // Keep Firebase's Google login popup compatible with the books site.
    'Cross-Origin-Opener-Policy':'same-origin-allow-popups',
    'Content-Security-Policy':policy,
    ...(https?{'Strict-Transport-Security':'max-age=15552000'}:{}),
    ...(sensitive?{'Cache-Control':'no-store','Pragma':'no-cache','X-Robots-Tag':'noindex, nofollow'}:{})
  };
}
export function secureResponse(response,request,policy=policies.api){
  const url=new URL(request.url),sensitive=url.pathname.startsWith('/api/')||url.pathname.startsWith('/admin')||url.pathname==='/healthz';
  const headers=new Headers(response.headers);
  for(const [name,value] of Object.entries(securityHeaders({https:url.protocol==='https:',policy,sensitive})))headers.set(name,value);
  if(response.status===429&&!headers.has('Retry-After'))headers.set('Retry-After','900');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
export function staticSecurityHeaders(policy){
  return '/*\n'+Object.entries(securityHeaders({https:true,policy})).map(([name,value])=>`  ${name}: ${value}\n`).join('');
}
export function protectPagesPreview(request){
  const {hostname,pathname}=new URL(request.url);
  const preview=hostname.endsWith('.pages.dev')&&hostname.split('.').length>3;
  const publicRead=['GET','HEAD'].includes(request.method)&&['/api/stem/programs','/api/products','/api/landing','/api/customer/config'].includes(pathname);
  if(preview&&pathname.startsWith('/api/')&&!publicRead)throw new SecurityError(403,'Bản xem thử không nhận dữ liệu thật. Vui lòng dùng website chính thức.');
}
export function isJsonType(value){return typeof value==='string'&&value.split(';',1)[0].trim().toLowerCase()==='application/json';}
export function validateJsonHeaders(headers,maxBytes=32768){
  const get=name=>headers instanceof Headers?headers.get(name):headers[name.toLowerCase()];
  if(!isJsonType(get('Content-Type')))throw new SecurityError(415,'Yêu cầu phải dùng JSON.');
  const encoding=get('Content-Encoding');
  if(encoding&&encoding.toLowerCase()!=='identity')throw new SecurityError(415,'Kiểu mã hóa nội dung không được hỗ trợ.');
  const length=get('Content-Length');
  if(length!=null&&(!/^\d+$/.test(length)||!Number.isSafeInteger(Number(length))))throw new SecurityError(400,'Độ dài nội dung không hợp lệ.');
  if(length!=null&&Number(length)>maxBytes)throw new SecurityError(413,'Nội dung quá lớn.');
}
export async function readJson(request,{maxBytes=32768,timeoutMs=10000}={}){
  validateJsonHeaders(request.headers,maxBytes);
  const reader=request.body?.getReader();
  if(!reader)throw new SecurityError(400,'Thiếu dữ liệu.');
  let expired=false,size=0;const chunks=[];
  const timer=setTimeout(()=>{expired=true;void reader.cancel().catch(()=>{});},timeoutMs);
  try{
    while(true){
      const {value,done}=await reader.read();
      if(expired)throw new SecurityError(408,'Hết thời gian nhận nội dung. Vui lòng thử lại.');
      if(done)break;
      size+=value.length;
      if(size>maxBytes){void reader.cancel().catch(()=>{});throw new SecurityError(413,'Nội dung quá lớn.');}
      chunks.push(value);
    }
    const bytes=new Uint8Array(size);let offset=0;
    for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    let input;
    try{input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
    catch{throw new SecurityError(400,'JSON không hợp lệ.');}
    if(!input||typeof input!=='object'||Array.isArray(input))throw new SecurityError(400,'Dữ liệu không hợp lệ.');
    return input;
  }finally{clearTimeout(timer);reader.releaseLock();}
}
