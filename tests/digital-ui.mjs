// Browser integration checks using installed Chromium, without npm dependencies.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { hashPassword } from '../passwords.mjs';
const browser = process.env.UI_BROWSER_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(existsSync);
if (!browser) throw new Error('Set UI_BROWSER_PATH to an installed Chromium browser.');
const scratch = await mkdtemp(join(tmpdir(), 'le-nga-ui-'));
const profile = join(scratch, 'browser');
const output = resolve('data');
let server, chromium, socket;
let id = 0;
const requests = new Map();
const browserErrors = [];
const openedWindows = [];
let customerFixture;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(action, label) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try { const result = await action(); if (result) return result; } catch {}
    await sleep(100);
  }
  throw new Error(`Timed out: ${label}`);
}
function cdp(method, params = {}) {
  const requestId = ++id;
  return new Promise((resolve, reject) => {
    requests.set(requestId, { resolve, reject });
    socket.send(JSON.stringify({ id: requestId, method, params }));
  });
}
async function evaluate(expression) {
  const result = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}
async function screenshot(name) {
  await mkdir(output, { recursive: true });
  const result = await cdp('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(output, name), Buffer.from(result.data, 'base64'));
}
try {
  server = spawn(process.execPath, ['tests/digital-server.mjs'], {
    env: { ...process.env, PORT: '0', DATABASE_PATH: join(scratch, 'test.sqlite') },
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverOutput = '';
  server.stdout.on('data', chunk => { serverOutput += chunk; });
  const port = await until(() => serverOutput.match(/0\.0\.0\.0:(\d+)/)?.[1], 'server startup');
  chromium = spawn(browser, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--disable-extensions', '--no-default-browser-check', 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  const debuggingPort = await until(async () => (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0], 'browser startup');
  const pages = await until(async () => { const response = await fetch(`http://127.0.0.1:${debuggingPort}/json/list`); const list = await response.json(); return list.find(p => p.type === 'page'); }, 'browser page');
  socket = new WebSocket(pages.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  socket.addEventListener('message', event => {
    const result = JSON.parse(event.data);
    if (result.id) {
      const request = requests.get(result.id); if (!request) return; requests.delete(result.id);
      if (result.error) request.reject(new Error(result.error.message)); else request.resolve(result.result);
    }
    if (result.method === 'Runtime.exceptionThrown') browserErrors.push(result.params.exceptionDetails.text);
    if (result.method === 'Page.windowOpen') openedWindows.push(result.params);
    if (result.method === 'Fetch.requestPaused' && customerFixture) customerFixture(result.params).catch(error => browserErrors.push(error.message));
  });
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

  const authModule = "let current=null,listener;\nconst token=uid=>btoa('{\"alg\":\"RS256\"}').replaceAll('=','')+'.'+btoa(JSON.stringify({aud:'digital-ui',iss:'https://securetoken.google.com/digital-ui',sub:uid,exp:Math.floor(Date.now()/1000)+3600})).replaceAll('=','')+'.signature';\nexport const getAuth=()=>({currentUser:current});\nexport const onAuthStateChanged=(_,callback)=>{listener=callback;window.__switchDigitalUser=uid=>{current=uid?{uid,email:uid+'@example.test',displayName:'Test '+uid,emailVerified:true,getIdToken:async()=>token(uid)}:null;listener(current);};queueMicrotask(()=>callback(current));};\nexport const signOut=async()=>window.__switchDigitalUser(null);\n";

  const downloads=[];
  customerFixture=async({requestId,request:paused})=>{
    if(paused.url.startsWith('https://www.gstatic.com/firebasejs/')){
      const body=paused.url.endsWith('/firebase-auth.js')?authModule:'export const initializeApp=config=>config;';
      await cdp('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/javascript'},{name:'Access-Control-Allow-Origin',value:'*'}],body:Buffer.from(body).toString('base64')});return;
    }
    if(paused.url.startsWith('https://qyyhdfmlvmuqqcihoejg.supabase.co/')){
      downloads.push(paused.url);
      await cdp('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'application/pdf'},{name:'Content-Disposition',value:'attachment; filename="ui-test.pdf"'}],body:Buffer.from('%PDF-1.4\n% UI test only\n').toString('base64')});return;
    }
    await cdp('Fetch.continueRequest',{requestId});
  };
  await cdp('Fetch.enable',{patterns:[{urlPattern:'https://www.gstatic.com/firebasejs/*'},{urlPattern:'https://qyyhdfmlvmuqqcihoejg.supabase.co/*'}]});
  await cdp('Browser.setDownloadBehavior',{behavior:'deny'});
  const navigate=async path=>{
    await cdp('Page.navigate',{url:'http://127.0.0.1:'+port+path});
    await until(()=>evaluate(path==='/admin'?"Boolean(document.querySelector('#login-view'))":"document.querySelectorAll('.digital-product').length===14 && Boolean(window.__switchDigitalUser)"),'page '+path);
  };
  const readRow=(sql,...params)=>{const db=new DatabaseSync(join(scratch,'test.sqlite'));try{return db.prepare(sql).get(...params);}finally{db.close();}};
  await navigate('/');
  assert.equal(await evaluate("document.querySelectorAll('.digital-cover').length"),14);
  const viewportProblems=[];
  for(const [width,height] of [[320,568],[375,844],[768,1024],[1024,768],[1440,1000],[1920,1080]]){
    await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<1100});
    await evaluate("document.querySelector('#tai-lieu-so').scrollIntoView({behavior:'instant'})");await sleep(120);
    const overflow=await evaluate("(()=>{const all=[...document.querySelectorAll('.digital-product,.digital-store-heading,.digital-store-controls')];return {page:document.documentElement.scrollWidth>innerWidth,offscreen:all.filter(e=>{const r=e.getBoundingClientRect();return r.left<-.5||r.right>innerWidth+.5}).map(e=>e.className)};})()");
    if(overflow.page||overflow.offscreen.length)viewportProblems.push({width,...overflow});
    if([375,768,1440].includes(width))await screenshot('digital-catalog-'+width+'.png');
  }
  assert.deepEqual(viewportProblems,[]);
  await evaluate("document.querySelector('[data-digital-grade]').parentElement.children[2].click()");
  assert.equal(await evaluate("document.querySelectorAll('.digital-product').length"),2);

  const adminPassword='Digital UI admin only 2026';
  const adminDb=new DatabaseSync(join(scratch,'test.sqlite'));adminDb.prepare('INSERT INTO admin_users(id,username,password_hash) VALUES(?,?,?)').run('digital-ui-admin','admin',await hashPassword(adminPassword));adminDb.close();
  await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await navigate('/admin');
  await until(()=>evaluate("!document.querySelector('#login-view').hidden"),'admin login form');
  await evaluate("document.querySelector('#login-username').value='admin';document.querySelector('#login-password').value="+JSON.stringify(adminPassword)+";document.querySelector('#login-form').requestSubmit()");
  await until(()=>evaluate("!document.querySelector('#dashboard-view').hidden"),'admin session');
  await evaluate("document.querySelector('[data-inbox=\"digital-orders\"]').click();document.querySelector('#digital-management').open=true");
  await until(()=>evaluate("document.querySelectorAll('.digital-admin-product').length===14"),'management forms');
  await evaluate("(()=>{const f=document.querySelector('#digital-management-content>form');window.settingsForm=f;const inputs=f.querySelectorAll('input:not([type=checkbox])');inputs[0].value='TEST BANK';inputs[1].value='TEST123456';inputs[2].value='TEST ONLY';f.querySelector('input[type=checkbox]').checked=true;f.requestSubmit();})()");
  await until(()=>readRow('SELECT accept_orders FROM digital_settings WHERE id=1').accept_orders===1,'payment setup saved');
  await until(()=>evaluate("document.querySelector('#digital-management-content>form')!==window.settingsForm && document.querySelectorAll('.digital-admin-product').length===14"),'settings refreshed');
  await evaluate("(()=>{const d=[...document.querySelectorAll('.digital-admin-product')].find(e=>e.querySelector('summary').textContent.includes('Tổng'));d.open=true;d.querySelectorAll('input[type=checkbox]')[1].checked=false;d.querySelector('form').requestSubmit();})()");
  await until(()=>readRow("SELECT is_draft FROM digital_products WHERE id='g4-tong-hieu'").is_draft===0,'product publication and private file verification');
  await until(()=>evaluate("document.querySelectorAll('.digital-admin-product').length===14"),'catalog refresh');
  await screenshot('digital-admin-management.png');

  await navigate('/');
  const productSelector='[data-digital-product="g4-tong-hieu"]';
  await evaluate("document.querySelector("+JSON.stringify(productSelector)+").click()");
  assert.equal(await evaluate("document.querySelector('#customer-dialog').open"),true);
  await evaluate("window.__switchDigitalUser('alice')");
  await until(()=>evaluate("window.customerSession.id==='alice'"),'customer login');
  await evaluate("document.querySelector('#customer-close').click();document.querySelector("+JSON.stringify(productSelector)+").click()");
  assert.equal(await evaluate("document.querySelector('#digital-checkout').open"),true);
  await cdp('Emulation.setDeviceMetricsOverride',{width:375,height:844,deviceScaleFactor:1,mobile:true});
  await evaluate("(()=>{const f=document.querySelector('#digital-order-form');f.elements.name.value='Test Parent';f.elements.phone.value='0989066885';f.elements.consent.checked=true;})()");
  assert.equal(await evaluate("document.querySelector('#digital-checkout').scrollWidth<=document.querySelector('#digital-checkout').clientWidth"),true);
  await screenshot('digital-checkout-mobile.png');
  await evaluate("document.querySelector('#digital-order-form').requestSubmit()");
  await until(()=>evaluate("!document.querySelector('#digital-checkout').open && !document.querySelector('#customer-digital-view').hidden && document.querySelector('.digital-payment-details')?.textContent.includes('TEST BANK')"),'order and payment instructions');
  await screenshot('digital-pending-mobile.png');
  assert.equal(await evaluate("document.querySelectorAll('[data-digital-file]').length"),0);
  const order=readRow("SELECT * FROM digital_orders WHERE customer_id='digital-ui:alice'");
  assert.equal(order.amount_vnd,39000);
  await evaluate("window.__switchDigitalUser('bob');window.customerSession.open('digital')");
  await until(()=>evaluate("Boolean(document.querySelector('.digital-library-empty'))"),'other customer has no access');
  assert.equal(await evaluate("document.querySelector('#customer-digital-orders').textContent.includes("+JSON.stringify(order.id)+")"),false);

  await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await navigate('/admin');
  await until(()=>evaluate("!document.querySelector('#dashboard-view').hidden"),'admin restored');
  await evaluate("document.querySelector('[data-inbox=\"digital-orders\"]').click()");
  await until(()=>evaluate("document.querySelectorAll('.request-card').length===1"),'digital inbox');
  await evaluate("document.querySelector('.detail-button').click()");
  await until(()=>evaluate("!document.querySelector('#status-form').hidden && !document.querySelector('#digital-payment-confirm').hidden"),'digital payment approval');
  await evaluate("document.querySelector('#status-form').requestSubmit()");
  assert.equal(readRow('SELECT status FROM digital_orders WHERE id=?',order.id).status,'pending');
  await evaluate("document.querySelector('#digital-payment-verified').checked=true;document.querySelector('#status-form').requestSubmit()");
  await until(()=>readRow('SELECT status FROM digital_orders WHERE id=?',order.id).status==='paid','payment approved');
  await until(()=>evaluate("document.querySelector('#detail-message').textContent==='Đã cập nhật trạng thái.'"),'approval reflected');
  await screenshot('digital-admin-approved.png');

  await navigate('/');
  await evaluate("window.__switchDigitalUser('alice');window.customerSession.open('digital')");
  await until(()=>evaluate("document.querySelectorAll('[data-digital-file]').length===2"),'paid library');
  await cdp('Emulation.setDeviceMetricsOverride',{width:375,height:844,deviceScaleFactor:1,mobile:true});
  await sleep(280);
  assert.equal(await evaluate("document.querySelector('#customer-dialog').scrollWidth<=document.querySelector('#customer-dialog').clientWidth"),true);
  assert.equal(await evaluate("document.querySelectorAll('.customer-account-tabs [data-customer-section]').length"),3);
  assert.equal(await evaluate("document.querySelector('.customer-account-tabs [data-customer-section=\"digital\"]').getAttribute('aria-pressed')"),'true');
  await screenshot('digital-paid-mobile.png');
  await evaluate("document.querySelector('[data-digital-file]').click()");
  await until(()=>downloads.length===1,'authorized PDF download');
  assert.ok(downloads[0].includes('/paid-documents/lop-4/chuyen-de-tong-hieu/'));

  await navigate('/admin');await until(()=>evaluate("!document.querySelector('#dashboard-view').hidden"),'admin for revocation');
  await evaluate("document.querySelector('[data-inbox=\"digital-orders\"]').click()");
  await until(()=>evaluate("document.querySelector('.request-card')"),'paid order in inbox');
  await evaluate("document.querySelector('.detail-button').click()");
  await until(()=>evaluate("document.querySelector('#next-status').value==='revoked'"),'revocation action');
  await evaluate("document.querySelector('#digital-action-note').value='Test refund';document.querySelector('#status-form').requestSubmit()");
  await until(()=>readRow('SELECT status FROM digital_orders WHERE id=?',order.id).status==='revoked','access revoked');
  await navigate('/');await evaluate("window.__switchDigitalUser('alice');window.customerSession.open('digital')");
  await until(()=>evaluate("Boolean(document.querySelector('.digital-order-status')?.textContent.includes('thu hồi'))"),'revocation in library');
  assert.equal(await evaluate("document.querySelectorAll('[data-digital-file]').length"),0);
  assert.deepEqual(browserErrors,[]);
  console.log('Digital UI passed: draft catalog, six responsive sizes, login, management, publication, checkout, manual payment, owner-only library, download and revocation. No real upstream or payment was used.');

} finally {
  if (socket?.readyState === WebSocket.OPEN) { try { await cdp('Browser.close'); } catch {} socket.close(); }
  for (const process of [chromium, server]) if (process && process.exitCode === null) {
    const exited = new Promise(resolve => process.once('exit', resolve)); process.kill(); await Promise.race([exited, sleep(2000)]);
  }
  // Delete only the uniquely created test directory within the OS temp root.
  const tempRoot = resolve(tmpdir()) + sep;
  if (!resolve(scratch).startsWith(tempRoot) || !scratch.includes('le-nga-ui-')) throw new Error('Invalid test cleanup path');
  await rm(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
