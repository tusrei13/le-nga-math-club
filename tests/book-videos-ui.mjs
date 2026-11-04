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

  const mediaRequests=[];
  socket.addEventListener('message',event=>{
    const eventData=JSON.parse(event.data);
    if(eventData.method==='Network.requestWillBeSent'&&new URL(eventData.params.request.url).pathname.endsWith('.mp4'))mediaRequests.push(eventData.params.request.url);
  });
  await cdp('Network.enable');
  await cdp('Page.navigate',{url:'http://127.0.0.1:'+port+'/'});
  await until(()=>evaluate("document.querySelectorAll('.book-card').length===13 && document.querySelectorAll('.book-video-action').length===3"),'catalog and video actions');
  await evaluate("document.querySelector('#primary-series-overview').scrollIntoView({behavior:'instant',block:'center'})");
  await sleep(500);
  assert.equal(mediaRequests.length,0,'MP4 must not load before user interaction');
  assert.equal(await evaluate("document.querySelector('#book-video-player').getAttribute('src')"),null);
  assert.deepEqual(await evaluate("[...document.querySelectorAll('.book-video-action')].map(b=>b.dataset.bookVideo)"),['sieu-nhan-tap-1','sieu-nhan-tap-3','sieu-nhan-tap-4']);
  assert.equal(await evaluate("document.querySelectorAll('#primary-series-overview').length===1 && document.querySelector('#primary-series-overview').nextElementSibling.dataset.productId==='sieu-nhan-tap-1'"),true);
  await evaluate("window.dispatchEvent(new Event('books:rendered'))");
  assert.equal(await evaluate("document.querySelectorAll('.book-video-action').length"),3,'rerenders cannot duplicate actions');

  const viewports=[[320,720],[375,812],[768,1024],[1024,768],[1440,1000],[667,375]];
  for(const [width,height] of viewports){
    await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<1100});
    await evaluate("document.querySelector('#primary-series-overview').scrollIntoView({behavior:'instant',block:'start'})");
    await sleep(100);
    const overview=await evaluate("(()=>{const r=document.querySelector('#primary-series-overview').getBoundingClientRect();return {inner:innerWidth,width:document.documentElement.scrollWidth,left:r.left,right:r.right};})()");
    assert.equal(overview.inner,width,JSON.stringify(overview));
    assert.ok(overview.width<=width&&overview.left>=0&&overview.right<=width,JSON.stringify(overview));
    assert.equal(await evaluate("[...document.querySelectorAll('.book-card-actions button')].every(b=>b.getBoundingClientRect().height>=44)"),true,'touch targets '+width);
    if([375,1440].includes(width)){
      const clip=await evaluate("(()=>{const r=document.querySelector('#primary-series-overview').getBoundingClientRect();return {x:r.left+scrollX,y:r.top+scrollY,width:r.width,height:r.height,scale:1};})()");
      const capture=await cdp('Page.captureScreenshot',{format:'png',clip,captureBeyondViewport:true});
      await mkdir(output,{recursive:true});await writeFile(join(output,'book-video-overview-'+width+'.png'),Buffer.from(capture.data,'base64'));
    }
    const point=await evaluate("(()=>{const b=document.querySelector('[data-book-video=series]');b.scrollIntoView({behavior:'instant',block:'center'});const r=b.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()");
    await cdp('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});
    await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
    await until(()=>evaluate("document.querySelector('#book-video-player').readyState>=2"),'overview ready '+width);
    await until(()=>evaluate("!document.querySelector('#book-video-player').paused && document.querySelector('#book-video-player').currentTime>.1"),'user click starts overview '+width);
    const bounds=await evaluate("(()=>{const d=document.querySelector('#book-video-dialog'),r=d.getBoundingClientRect(),v=document.querySelector('#book-video-player');return {open:d.open,left:r.left,right:r.right,top:r.top,bottom:r.bottom,inner:innerWidth,height:innerHeight,overflow:d.scrollWidth>d.clientWidth,ratio:v.videoWidth/v.videoHeight};})()");
    assert.ok(bounds.open&&bounds.left>=0&&bounds.right<=width&&bounds.top>=0&&bounds.bottom<=height&&!bounds.overflow,JSON.stringify(bounds));
    assert.equal(bounds.ratio,1080/1920);
    if([375,1440].includes(width))await screenshot('book-video-player-'+width+'.png');
    await evaluate("document.querySelector('#book-video-close').click()");
    await until(()=>evaluate("!document.querySelector('#book-video-dialog').open && !document.body.classList.contains('book-video-open')"),'dialog close');
    assert.equal(await evaluate("document.querySelector('#book-video-player').paused && !document.querySelector('#book-video-player').hasAttribute('src')"),true,'release video after close');
    assert.equal(await evaluate("document.activeElement.dataset.bookVideo"),'series','restore opening button focus');
  }

  await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  for(const volume of [1,3,4]){
    await evaluate("document.querySelector('[data-book-video=sieu-nhan-tap-"+volume+"]').click();document.querySelector('#book-video-player').muted=true");
    await until(()=>evaluate("document.querySelector('#book-video-player').readyState>=2"),'volume '+volume+' metadata');
    assert.ok((await evaluate("document.querySelector('#book-video-player').currentSrc")).endsWith('/tap-'+volume+'.mp4'));
    assert.ok((await evaluate("document.querySelector('#book-video-title').textContent")).startsWith('Tập '+volume));
    await evaluate("document.querySelector('#book-video-player').play()");
    await until(()=>evaluate("document.querySelector('#book-video-player').currentTime>.25"),'volume '+volume+' playing');
    await evaluate("document.querySelector('#book-video-player').currentTime=10");
    await until(()=>evaluate("!document.querySelector('#book-video-player').seeking && document.querySelector('#book-video-player').currentTime>=10"),'volume '+volume+' seeking');
    await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await until(()=>evaluate("!document.querySelector('#book-video-dialog').open && !document.querySelector('#book-video-player').hasAttribute('src')"),'Escape releases video');
  }
  assert.equal(await evaluate("[...document.querySelectorAll('[data-product-quantity]')].every(i=>i.value==='0')"),true,'watching videos must not change cart');
  assert.deepEqual(browserErrors,[]);
  console.log('Book video browser checks passed: no initial MP4 requests; correct overview and 3 individual videos; play, seek, close/Escape, focus and unchanged cart; 6 phone/tablet/desktop viewports. Screenshots in data/.');
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
