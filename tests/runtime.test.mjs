import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter, clientAddress } from '../runtime.mjs';
test('Rate limits expire and cannot be reset by changing an untrusted forwarded header',()=>{
  const limit=createRateLimiter({limit:2,windowMs:1000});
  assert.equal(limit('a',0),0);assert.equal(limit('a',1),0);assert.equal(limit('a',2),1);assert.equal(limit('b',2),0);assert.equal(limit('a',1000),0);
  const old=process.env.TRUST_PROXY;delete process.env.TRUST_PROXY;
  const req={headers:{'x-forwarded-for':'1.2.3.4, 5.6.7.8'},socket:{remoteAddress:'127.0.0.1'}};
  assert.equal(clientAddress(req),'127.0.0.1');process.env.TRUST_PROXY='1';assert.equal(clientAddress(req),'5.6.7.8');
  if(old===undefined)delete process.env.TRUST_PROXY;else process.env.TRUST_PROXY=old;
});
