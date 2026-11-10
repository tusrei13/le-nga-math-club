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
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
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

  const mediaRequests=[];
  socket.addEventListener('message',e=>{const r=JSON.parse(e.data);if(r.method==='Network.requestWillBeSent'&&r.params.request.url.endsWith('.mp4'))mediaRequests.push(r.params.request.url);});
  await cdp('Network.enable');
  await cdp('Page.navigate',{url:'http://127.0.0.1:'+port+'/'});
  await until(()=>evaluate("document.querySelectorAll('.book-card').length===9 && document.querySelectorAll('[data-product-quantity]').length===4 && document.querySelectorAll('#digital-catalog .digital-product').length===6"),'new catalog renders');
  assert.equal(mediaRequests.length,0,'no initial video traffic');
  assert.equal(await evaluate("document.querySelector('#hero-book-count').textContent"),'21');
  assert.equal(await evaluate("document.querySelector('[data-assistant-phone]').getAttribute('href')"),'tel:0365473632','assistant must not be replaced by main number');
  assert.equal(await evaluate("document.querySelector('.book-card[data-product-id=sieu-nhan-tap-1] .product-price').textContent"),'Liên hệ');
  assert.equal(await evaluate("document.querySelector('.book-card[data-product-id=phan-dang-6-bo-2-tap] .product-price').textContent"),'269.000đ/bộ');

  await evaluate("document.querySelector('[data-paper-filter=\"6\"]').click()");
  assert.equal(await evaluate("document.querySelectorAll('.book-card:not([hidden])').length"),1);
  await evaluate("document.querySelector('[data-paper-filter=all]').click();var catalogSearchInput=document.querySelector('#catalog-search');catalogSearchInput.value='toan 3';catalogSearchInput.dispatchEvent(new Event('input',{bubbles:true}))");
  assert.equal(await evaluate("document.querySelectorAll('.book-card:not([hidden])').length"),0);
  assert.match(await evaluate("document.querySelector('#digital-result-count').textContent"),/10 tài liệu/);
  await evaluate("var catalogSearchInput=document.querySelector('#catalog-search');catalogSearchInput.value='';catalogSearchInput.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[data-digital-grade=\"5\"]').click()");
  assert.equal(await evaluate("document.querySelectorAll('[data-order-product]').length"),3);
  await evaluate("document.querySelector('[data-digital-grade=\"\"]').click();document.querySelector('[data-digital-preview=tai-lieu-t3tuan]').click()");
  assert.equal(await evaluate("document.querySelector('#digital-preview-dialog').open"),true);
  assert.equal(await evaluate("document.querySelectorAll('#digital-preview-files a').length"),4);
  await evaluate("document.querySelector('#digital-preview-close').click()");
  await evaluate("document.querySelector('#catalog-preview-close').click();document.querySelector('[data-catalog-preview=phan-dang-6-bo-2-tap]').click()");
  assert.equal(await evaluate("document.querySelectorAll('#catalog-preview-files a').length"),3);
  await evaluate("document.querySelector('#catalog-preview-close').click()");

  const viewports=[[320,568],[375,812],[768,1024],[820,1180],[1024,768],[1440,1000],[1920,1080]];
  for(const [width,height] of viewports){
    await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<1400});
    for(const section of ['#gioi-thieu','#gioi-thieu-70-de','#bo-sach','#digital-catalog','#tai-lieu-so','#tac-gia','#dat-sach','.site-footer']){
      await evaluate("document.querySelector("+JSON.stringify(section)+").scrollIntoView({behavior:'instant',block:'start'})");await sleep(100);
      const bounds=await evaluate("({inner:innerWidth,width:document.documentElement.scrollWidth})");
      assert.equal(bounds.inner,width,JSON.stringify({section,...bounds}));assert.ok(bounds.width<=width,JSON.stringify({section,...bounds}));
      if([375,1440].includes(width)&&['#digital-catalog','#bo-sach','#tac-gia'].includes(section))await screenshot('reference-'+section.slice(1)+'-'+width+'.png');
    }
  }
  await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await evaluate("document.querySelector('#digital-pagination').scrollIntoView({behavior:'instant',block:'center'})");const before=await evaluate('scrollY');
  await evaluate("document.querySelector('#digital-pagination button:last-child').click()");await sleep(150);
  assert.ok(Math.abs((await evaluate('scrollY'))-before)<3,'document pagination must not scroll');
  await evaluate("document.querySelector('[data-paper-filter=all]').click();document.querySelector('.book-card[data-product-id=phan-dang-6-bo-2-tap] button.text-link').click();document.querySelector('[data-book-group=primary]').click();document.querySelector('[data-product-quantity=\"70-de-vao-6\"]').value=1;document.querySelector('[data-product-quantity=\"70-de-vao-6\"]').dispatchEvent(new Event('input',{bubbles:true}))");
  assert.equal(await evaluate("document.querySelector('#order-total').textContent"),'518.000đ');
  await evaluate("document.querySelector('#order-next').click();document.querySelector('#field-name').value='Phụ huynh thử';document.querySelector('#field-phone').value='0912345678';document.querySelector('#field-grade').value='Lớp 6';document.querySelector('#field-address').value='Geleximco, Hà Nội';document.querySelector('#order-form').requestSubmit()");
  await until(()=>evaluate("document.querySelector('#form-status').textContent.includes('Đã lưu đơn')"),'new bundle and preorder order saved');
  assert.equal(await evaluate("document.querySelector('#order-total').textContent"),'0đ');
  for(const key of ['70','5']){
    const point=await evaluate("(()=>{const b=document.querySelector('[data-reference-video=\""+key+"\"]');b.scrollIntoView({behavior:'instant',block:'center'});const r=b.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()");
    await cdp('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
    await until(()=>evaluate("document.querySelector('[data-reference-player=\""+key+"\"]').readyState>=2"),'reference video '+key);
    await evaluate("document.querySelector('[data-reference-player=\""+key+"\"]').pause()");
  }
  // The retired standalone STEM URL lands on the class zone of the main page.
  await cdp('Page.navigate',{url:'http://127.0.0.1:'+port+'/stem/'});
  await until(()=>evaluate("location.pathname==='/'&&location.hash==='#lop-hoc'&&!!document.querySelector('#lop-hoc')"),'STEM redirect to class zone');
  for(const [width,height] of [[375,812],[768,1024],[1440,1000]]){
    await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<1400});await evaluate("document.querySelector('#lop-hoc').scrollIntoView({behavior:'instant'})");
    assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth"),true,'class zone '+width);
    if(width===375)await screenshot('reference-class-zone-375.png');
  }
  assert.deepEqual(browserErrors,[]);
  console.log('Reference UI passed: 21 products, 9 paper entries, 4 orderable products; search, filters, preview selectors, non-scrolling pagination, both new videos, new bundle checkout and 7 responsive sizes; class zone layout and the /stem redirect. Screenshots in data/.');
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
