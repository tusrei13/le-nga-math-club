import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash,randomBytes } from 'node:crypto';
import { provisionPagesAdmin,verifyPagesAdmin } from '../pages-admin-auth.mjs';
const env={FIREBASE_API_KEY:'public-test-key',FIREBASE_PROJECT_ID:'test-project',FIREBASE_AUTH_DOMAIN:'test-project.firebaseapp.com'};
test('Custom admin password is verified by Firebase; SQL reference has no password',async()=>{
  const original=globalThis.fetch;const password=' A long test passphrase ';let received;
  try{
    globalThis.fetch=async(url,options)=>{received=JSON.parse(options.body);assert.match(url,/accounts:signUp/);return new Response(JSON.stringify({localId:'admin-uid',email:'owner@example.test'}));};
    const reference=await provisionPagesAdmin('owner@example.test',password,env);
    assert.equal(received.password,password);assert.equal(reference.includes(password),false);assert.ok(reference.startsWith('firebase-auth:'));
    globalThis.fetch=async(url,options)=>{assert.match(url,/accounts:signInWithPassword/);const input=JSON.parse(options.body);return input.password===password?new Response('{"localId":"admin-uid"}'):new Response('{"error":{"message":"INVALID_LOGIN_CREDENTIALS"}}',{status:400});};
    assert.equal(await verifyPagesAdmin(reference,password,env),true);
    assert.equal(await verifyPagesAdmin(reference,'wrong password',env),false);
    assert.equal(await verifyPagesAdmin(reference,password,{...env,FIREBASE_PROJECT_ID:'another-project'}),false);
    globalThis.fetch=async()=>new Response('{"localId":"another-uid"}');assert.equal(await verifyPagesAdmin(reference,password,env),false);
  }finally{globalThis.fetch=original;}
});
test('Existing Firebase account must be authenticated before an admin reference is prepared',async()=>{
  const original=globalThis.fetch;let count=0;
  try{
    globalThis.fetch=async()=>{count++;return count===1?new Response('{"error":{"message":"EMAIL_EXISTS"}}',{status:400}):new Response('{"localId":"existing-uid","email":"owner@example.test"}');};
    assert.match(await provisionPagesAdmin('owner@example.test','Existing long password',env),/existing-uid/);
    globalThis.fetch=async(url)=>new Response(JSON.stringify({error:{message:url.includes('signUp')?'EMAIL_EXISTS':'INVALID_PASSWORD'}}),{status:400});
    await assert.rejects(provisionPagesAdmin('owner@example.test','Wrong long password',env),/mật khẩu hiện tại/);
    globalThis.fetch=async()=>new Response('{"error":{"message":"OPERATION_NOT_ALLOWED"}}',{status:400});
    await assert.rejects(provisionPagesAdmin('owner@example.test','Existing long password',env),/Email\/Password/);
  }finally{globalThis.fetch=original;}
});
test('Legacy random keys remain valid without weakening custom passwords',async()=>{
  const password=randomBytes(32).toString('hex');const encoded='token-sha256:'+createHash('sha256').update(password).digest('hex');
  assert.equal(await verifyPagesAdmin(encoded,password,{}),true);assert.equal(await verifyPagesAdmin(encoded,'wrong',{}),false);
  assert.equal(await verifyPagesAdmin('unknown-format','anything',{}),false);
});
