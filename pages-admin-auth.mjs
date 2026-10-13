import { createHash, timingSafeEqual } from 'node:crypto';
import { CustomerError, firebaseConfig } from './customer-auth.mjs';
const prefix='firebase-auth:';
function validConfig(env) {
  const config=firebaseConfig(env);
  if(!config.enabled)throw new CustomerError(503,'Chưa cấu hình Firebase cho tài khoản quản trị.');
  return config;
}
async function firebaseRequest(config,method,email,password) {
  let response,result;
  try {
    response=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${method}?key=${encodeURIComponent(config.apiKey)}`,{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true}),signal:AbortSignal.timeout(15000)
    });
    result=await response.json();
  }catch{throw new CustomerError(503,'Không kết nối được Firebase. Vui lòng thử lại.');}
  return {ok:response.ok,status:response.status,data:result,code:result.error?.message?.split(' : ')[0]};
}
export async function provisionPagesAdmin(email,password,env) {
  const config=validConfig(env);
  let result=await firebaseRequest(config,'signUp',email,password);
  if(!result.ok&&result.code==='EMAIL_EXISTS') {
    result=await firebaseRequest(config,'signInWithPassword',email,password);
    if(!result.ok)throw new CustomerError(400,'Email đã có tài khoản Firebase. Nhập mật khẩu hiện tại của email này, hoặc đặt lại mật khẩu qua Firebase rồi chạy lại.');
  }
  if(!result.ok||!result.data.localId) {
    const messages={OPERATION_NOT_ALLOWED:'Hãy bật Email/Password trong Firebase Authentication.',WEAK_PASSWORD:'Mật khẩu chưa đạt chính sách Firebase.',INVALID_EMAIL:'Email không hợp lệ.',TOO_MANY_ATTEMPTS_TRY_LATER:'Firebase đang giới hạn thử lại. Hãy chờ rồi chạy lại.'};
    throw new CustomerError(400,messages[result.code]||'Không thể tạo tài khoản Firebase. Kiểm tra API key và chính sách mật khẩu.');
  }
  return prefix+JSON.stringify({uid:result.data.localId,email:result.data.email||email,projectId:config.projectId});
}
export async function verifyPagesAdmin(encoded,password,env) {
  if(typeof encoded!=='string'||typeof password!=='string')return false;
  if(encoded.startsWith('token-sha256:')) {
    const expected=Buffer.from(encoded.slice(13)),actual=Buffer.from(createHash('sha256').update(password).digest('hex'));
    return expected.length===actual.length&&timingSafeEqual(expected,actual);
  }
  if(!encoded.startsWith(prefix))return false;
  let reference;try{reference=JSON.parse(encoded.slice(prefix.length));}catch{return false;}
  const config=validConfig(env);
  if(reference.projectId!==config.projectId||typeof reference.email!=='string'||typeof reference.uid!=='string'||!reference.uid)return false;
  const result=await firebaseRequest(config,'signInWithPassword',reference.email,password);
  if(!result.ok&&['TOO_MANY_ATTEMPTS_TRY_LATER','QUOTA_EXCEEDED'].includes(result.code))throw new CustomerError(429,'Firebase đang giới hạn đăng nhập. Vui lòng thử lại sau.');
  if(result.status>=500)throw new CustomerError(503,'Dịch vụ đăng nhập tạm thời không khả dụng.');
  return result.ok&&result.data.localId===reference.uid;
}
