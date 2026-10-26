export class CustomerError extends Error { constructor(status,message){super(message);this.status=status;} }
export function firebaseConfig(env) {
  const {FIREBASE_API_KEY:apiKey,FIREBASE_PROJECT_ID:projectId,FIREBASE_AUTH_DOMAIN:authDomain}=env;
  const enabled=Boolean(apiKey&&projectId&&authDomain);
  return {enabled,...(enabled?{apiKey,projectId,authDomain}: {})};
}
export async function customer(request,env,required=true) {
  const authorization=request.headers instanceof Headers?request.headers.get('Authorization'):request.headers.authorization;
  if(!authorization&&!required)return null;
  const config=firebaseConfig(env);
  if(!config.enabled)throw new CustomerError(503,'Đăng nhập khách hàng chưa được cấu hình.');
  const token=authorization?.startsWith('Bearer ')?authorization.slice(7):'';
  if(token.length>10000||!/^[-\w]+\.[-\w]+\.[-\w]+$/.test(token))throw new CustomerError(401,'Vui lòng đăng nhập lại.');
  let claims;try{claims=JSON.parse(atob(token.split('.')[1].replaceAll('-','+').replaceAll('_','/')));if(!claims||typeof claims!=='object'||Array.isArray(claims))throw new Error();}catch{throw new CustomerError(401,'Phiên đăng nhập không hợp lệ.');}
  if(claims.aud!==config.projectId||claims.iss!==`https://securetoken.google.com/${config.projectId}`||typeof claims.sub!=='string'||!claims.sub||!Number.isFinite(claims.exp)||claims.exp<=Date.now()/1000)
    throw new CustomerError(401,'Phiên đăng nhập không hợp lệ.');
  // Firebase verifies the signature and checks disabled/deleted users. Never trust a client UID.
  let response,result;
  try {response=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(config.apiKey)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:token}),signal:AbortSignal.timeout(10000),redirect:'error'});result=await response.json();}
  catch {throw new CustomerError(503,'Không kết nối được dịch vụ đăng nhập.');}
  if(response.status===429||response.status>=500)throw new CustomerError(503,'Dịch vụ đăng nhập tạm thời không khả dụng.');
  const user=result?.users?.[0];
  if(!response.ok||!user?.localId||user.localId!==claims.sub||user.disabled)throw new CustomerError(401,'Phiên đăng nhập không hợp lệ.');
  const validSince=Number(user.validSince||0);
  if(!Number.isFinite(validSince)||validSince<0)throw new CustomerError(503,'Không xác thực được trạng thái phiên đăng nhập.');
  if(validSince>0&&(!Number.isFinite(claims.auth_time)||claims.auth_time<validSince))throw new CustomerError(401,'Phiên đăng nhập đã bị thu hồi. Vui lòng đăng nhập lại.');
  return {id:`${config.projectId}:${user.localId}`,name:user.displayName||'',email:user.email||'',email_verified:user.emailVerified===true};
}
