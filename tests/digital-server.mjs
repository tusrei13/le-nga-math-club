// Test-only server. Refuse to run against a real project database.
import {tmpdir} from 'node:os';
import {resolve,sep} from 'node:path';
const database=process.env.DATABASE_PATH;
if(!database||!resolve(database).startsWith(resolve(tmpdir())+sep)||!database.includes('le-nga-ui-'))throw new Error('Digital UI fixtures require an isolated temporary database');
Object.assign(process.env,{FIREBASE_API_KEY:'ui-test-key',FIREBASE_PROJECT_ID:'digital-ui',FIREBASE_AUTH_DOMAIN:'digital-ui.firebaseapp.com',SUPABASE_SECRET_KEY:'sb_secret_ui-tests-only-never-a-real-key-123456'});
globalThis.fetch=async(url,options)=>{
  if(String(url).startsWith('https://identitytoolkit.googleapis.com/')){
    const token=JSON.parse(options.body).idToken,uid=JSON.parse(Buffer.from(token.split('.')[1],'base64url')).sub;
    return Response.json({users:[{localId:uid,email:uid+'@example.test'}]});
  }
  if(String(url).startsWith('https://qyyhdfmlvmuqqcihoejg.supabase.co/storage/v1/object/sign/paid-documents/')){
    return Response.json({signedURL:new URL(url).pathname.replace('/storage/v1','')+'?token=ui-test-token'});
  }
  throw new Error('Real upstream network access is disabled in digital UI tests');
};
await import('../server.mjs');
