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
  server = spawn(process.execPath, ['server.mjs'], {
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

  await cdp('Page.navigate',{url:'http://127.0.0.1:'+port+'/'});
  await until(()=>evaluate("document.querySelectorAll('.digital-product').length===6"),'public reading catalog');
  const data=await(await fetch('http://127.0.0.1:'+port+'/api/digital/products')).json();
  assert.equal(data.products.length,17);assert.equal(data.checkout_enabled,false);
  assert.equal(await evaluate("document.querySelector('#digital-checkout')"),null);
  assert.equal(await evaluate("document.querySelector('[data-customer-section=digital]')"),null);
  assert.equal(await evaluate("document.querySelector('#digital-sale-note').textContent"),'Đọc thử miễn phí');
  assert.equal(await evaluate("document.querySelector('.digital-product').textContent.includes('Giá')"),false);
  const titles=new Set(await evaluate("[...document.querySelectorAll('.digital-product h3')].map(e=>e.textContent)"));
  for(const page of [2,3]){
    await evaluate("document.querySelectorAll('#digital-pagination button')["+page+"].click()");
    assert.equal(await evaluate("document.querySelectorAll('.digital-product').length"),page===2?6:5);
    for(const title of await evaluate("[...document.querySelectorAll('.digital-product h3')].map(e=>e.textContent)")){assert.equal(titles.has(title),false);titles.add(title);}
  }
  assert.equal(titles.size,17);
  assert.equal(await evaluate("document.querySelector('#digital-page-summary').textContent"),'Hiển thị 13–17 trong 17 bộ tài liệu');
  await evaluate("document.querySelectorAll('[data-digital-grade]')[1].click()");
  assert.equal(await evaluate("document.querySelectorAll('.digital-product').length"),3);
  assert.equal(await evaluate("document.querySelector('#digital-pagination').hidden"),true);
  await evaluate("document.querySelector('[data-digital-preview=g3-quyen-1-4-preview]').click()");
  assert.equal(await evaluate("document.querySelector('#digital-preview-dialog').open"),true);
  assert.equal(await evaluate("document.querySelectorAll('#digital-preview-files a').length"),4);
  const dialogLinks=await evaluate("[...document.querySelectorAll('#digital-preview-files a')].map(a=>({href:a.href,target:a.target,rel:a.rel}))");
  for(let i=0;i<4;i++){assert.ok(dialogLinks[i].href.endsWith('Toan3_Q'+(i+1)+'_BanDocThu.pdf'));assert.equal(dialogLinks[i].target,'_blank');assert.ok(dialogLinks[i].rel.includes('noopener'));}
  await evaluate("document.querySelector('#digital-preview-close').click()");
  assert.equal(await evaluate("document.querySelector('#customer-dialog').open"),false,'reading previews never requires login');
  await evaluate("document.querySelector('[data-digital-grade]').click()");
  for(const [width,height] of [[320,568],[375,844],[768,1024],[1024,768],[1440,1000],[1920,1080]]){
    await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<1100});
    await evaluate("document.querySelector('#tai-lieu-so').scrollIntoView({behavior:'instant'})");await sleep(100);
    assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth"),true,'catalog overflow '+width);
    if([375,768,1440].includes(width))await screenshot('digital-public-'+width+'.png');
    await evaluate("document.querySelector('[data-digital-preview=g3-8-de-giua-hk1]').click()");
    const fits=await evaluate("(()=>{const r=document.querySelector('#digital-preview-dialog').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;})()");
    assert.equal(fits,true,'preview picker fits '+width);
    if(width===375)await screenshot('digital-public-picker-mobile.png');
    await evaluate("document.querySelector('#digital-preview-close').click()");
  }
  // Every public PDF is served without a login cookie and preserves the original bytes.
  for(const p of data.products)for(const file of p.files){
    const response=await fetch('http://127.0.0.1:'+port+file.url);
    assert.equal(response.status,200,file.url);assert.match(response.headers.get('Content-Type'),/^application\/pdf/);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()),await readFile(resolve('public'+file.url)));
  }
  assert.equal((await fetch('http://127.0.0.1:'+port+'/api/digital/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,410);

  const adminPassword='Public preview UI test only 2026';
  const adminDb=new DatabaseSync(join(scratch,'test.sqlite'));
  adminDb.prepare('INSERT INTO admin_users(id,username,password_hash) VALUES(?,?,?)').run('preview-admin','admin',await hashPassword(adminPassword));adminDb.close();
  await cdp('Page.navigate',{url:'http://127.0.0.1:'+port+'/admin'});
  await until(()=>evaluate("Boolean(document.querySelector('#login-view')&&!document.querySelector('#login-view').hidden)"),'admin login form');
  await evaluate("document.querySelector('#login-username').value='admin';document.querySelector('#login-password').value="+JSON.stringify(adminPassword)+";document.querySelector('#login-form').requestSubmit()");
  await until(()=>evaluate("!document.querySelector('#dashboard-view').hidden"),'admin session');
  await evaluate("document.querySelector('[data-inbox=\"digital-orders\"]').click();document.querySelector('#digital-management').open=true");
  await until(()=>evaluate("document.querySelectorAll('.digital-admin-product').length===17"),'readonly public preview management');
  assert.equal(await evaluate("document.querySelector('#digital-management-content form')"),null);
  assert.equal(await evaluate("document.querySelector('#digital-management-content').textContent.includes('Supabase')"),false);
  assert.equal(await evaluate("document.querySelectorAll('#digital-management-content a').length"),31);

  assert.deepEqual(browserErrors,[]);
  console.log('Public digital UI passed: 17 groups, 31 original PDFs without login, 6-item pagination, class filters, multi-file picker, and 6 responsive sizes.');

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
