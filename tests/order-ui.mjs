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
    if (result.method === 'Fetch.requestPaused' && customerFixture) customerFixture(result.params).catch(error => browserErrors.push(error.message));
  });
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${port}/#dat-sach` });
  await until(() => evaluate(`document.querySelectorAll('[data-product-quantity]').length === 10 && document.querySelector('#hero-book-price').textContent.includes('299')`), 'loaded catalog');
  await sleep(300);
  assert.equal(await evaluate(`/freeship|đổi trả miễn phí|lời giải chi tiết 100%/i.test(document.body.innerText)`),false);
  assert.equal(await evaluate(`document.querySelector('#qua-tang').hidden && document.querySelector('#shipping-label').textContent.includes('xác nhận riêng')`),true);
  assert.equal(await evaluate(`document.querySelectorAll('.book-option:not([hidden])').length`), 2);
  assert.equal(await evaluate(`document.querySelector('#order-contact-fields').hidden`), true);
  await evaluate(`document.querySelector('#order-next').click()`);
  assert.equal(await evaluate(`document.querySelector('#items-error').hidden`), false);
  await evaluate(`document.querySelector('[data-picker-group="6"] [data-quantity-increase]').click(); document.querySelector('[data-book-group="7"]').click(); document.querySelector('[data-picker-group="7"] [data-quantity-increase]').click()`);
  assert.equal(await evaluate(`document.querySelector('#order-total').textContent`), '598.000đ');
  assert.equal(await evaluate(`document.querySelector('#selected-book-count').textContent`), '2 cuốn');
  await evaluate(`document.querySelector('#order-panel').scrollIntoView({behavior:'instant',block:'start'})`);
  await screenshot('order-desktop.png');
  const desktopHeight = await evaluate(`Math.round(document.querySelector('#order-panel').getBoundingClientRect().height)`);
  assert.ok(desktopHeight < 850, `Desktop ticket is too tall: ${desktopHeight}`);
  await evaluate(`document.querySelector('#order-next').click()`);
  assert.equal(await evaluate(`document.querySelector('#order-contact-fields').hidden`), false);
  assert.equal(await evaluate(`document.activeElement.id`), 'field-name');
  await evaluate(`document.querySelector('#order-back').click(); document.querySelector('[data-book-group="6"]').click()`);
  assert.equal(await evaluate(`document.querySelector('[data-product-quantity="toan-6-tap-1"]').value`), '1');
  await evaluate(`document.querySelector('[data-book-group="entrance"]').click()`);
  assert.equal(await evaluate(`document.querySelectorAll('.book-option:not([hidden])').length`), 2);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await evaluate(`document.querySelector('#order-panel').scrollIntoView({behavior:'instant',block:'start'})`);
  await sleep(150);
  assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth`), true);
  await screenshot('order-mobile.png');
  await evaluate(`document.querySelector('#order-next').click(); document.querySelector('#field-name').value='Nguyễn Thị An'; document.querySelector('#field-phone').value='0989066885'; document.querySelector('#field-grade').value='Lớp 6'; document.querySelector('#field-address').value='02 Geleximco, Hà Nội'; document.querySelector('#order-form').requestSubmit()`);
  await until(() => evaluate(`document.querySelector('#form-status').textContent.includes('Đã lưu đơn')`), 'order save');
  assert.equal(await evaluate(`document.querySelector('#order-total').textContent`), '0đ');
  assert.equal(await evaluate(`document.querySelector('#order-contact-fields').hidden`), true);
  await evaluate(`document.querySelector('[name="request_mode"][value="consult"]').click()`);
  assert.equal(await evaluate(`document.querySelector('#book-selection').hidden && document.querySelector('#order-receipt').hidden && !document.querySelector('#order-contact-fields').hidden && document.querySelector('#field-address').disabled`), true);
  await evaluate(`document.querySelector('#field-name').value='Nguyễn Thị An'; document.querySelector('#field-phone').value='0989066885'; document.querySelector('#field-grade').value='Lớp 5'; document.querySelector('#order-form').requestSubmit()`);
  await until(() => evaluate(`document.querySelector('#form-status').textContent.includes('Đã lưu yêu cầu tư vấn')`), 'consultation save');
  await evaluate(`document.querySelector('#customer-entry').click()`);
  await until(()=>evaluate(`document.querySelector('#customer-dialog').open`),'customer sign-in dialog');
  assert.equal(await evaluate(`document.querySelector('#customer-google').textContent`),'Tiếp tục với Google');
  await evaluate(`document.querySelector('[data-customer-mode="register"]').click()`);
  assert.equal(await evaluate(`document.querySelector('#customer-name').required && document.querySelector('#customer-confirm').required && document.querySelector('#customer-password').minLength===12`),true);
  assert.equal(await evaluate(`document.querySelector('#customer-dialog').scrollWidth <= document.querySelector('#customer-dialog').clientWidth`),true);
  await screenshot('customer-register-mobile.png');
  await evaluate(`document.querySelector('#customer-google').click()`);
  await until(()=>evaluate(`document.querySelector('#customer-status').textContent.includes('chưa sẵn sàng')`),'unconfigured customer authentication');
  await evaluate(`document.querySelector('#customer-close').click()`);
  // Isolated Firebase fixtures exercise signed-in UI without creating real users.
  const avatarBody=(await readFile('public/assets/logo.png')).toString('base64');
  const authModule=`
    const user={uid:'ui-parent',displayName:'Tu Le',email:'parent@example.test',emailVerified:true,providerData:[{providerId:'google.com',photoURL:'https://lh3.googleusercontent.com/ui-avatar'}],getIdToken:()=>Promise.resolve('fixture-token')};
    let listener;export const getAuth=()=>({currentUser:user});
    export const onAuthStateChanged=(_,callback)=>{listener=callback;queueMicrotask(()=>callback(user));};
    export const updateProfile=async(current,changes)=>{if(window.profileFailure)throw {code:'auth/network-request-failed'};Object.assign(current,changes);};
    export const signOut=async()=>listener(null);
  `;
  customerFixture=async({requestId,request})=>{
    const path=new URL(request.url).pathname;
    let body,type='text/javascript',responseCode=200;
    if(path==='/api/customer/config'){type='application/json';body=JSON.stringify({enabled:true,apiKey:'fixture',projectId:'fixture',authDomain:'fixture.firebaseapp.com'});}
    else if(path.endsWith('/firebase-app.js'))body='export const initializeApp=config=>config;';
    else if(path.endsWith('/firebase-auth.js'))body=authModule;
    else if(path==='/api/customer/orders'){type='application/json';body=JSON.stringify({orders:[]});}
    else if(path==='/ui-avatar'){await cdp('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'image/png'}],body:avatarBody});return;}
    else {await cdp('Fetch.continueRequest',{requestId});return;}
    await cdp('Fetch.fulfillRequest',{requestId,responseCode,responseHeaders:[{name:'Content-Type',value:type},{name:'Access-Control-Allow-Origin',value:'*'}],body:Buffer.from(body).toString('base64')});
  };
  await cdp('Fetch.enable',{patterns:[{urlPattern:'*/api/customer/config'},{urlPattern:'*/api/customer/orders'},{urlPattern:'https://www.gstatic.com/firebasejs/*'},{urlPattern:'https://lh3.googleusercontent.com/ui-avatar'}]});
  await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await cdp('Page.navigate',{url:`http://127.0.0.1:${port}/`});
  await until(()=>evaluate(`document.querySelector('#customer-entry-label')?.textContent==='Tu Le' && document.querySelector('#customer-avatar img')?.hidden===false`),'Google profile avatar');
  assert.equal(await evaluate(`document.querySelector('#customer-chevron')`),null);
  await evaluate(`document.querySelector('#customer-entry').click()`);
  await until(()=>evaluate(`!document.querySelector('#customer-menu').hidden`),'parent menu');
  await screenshot('customer-member-menu.png');
  await evaluate(`document.querySelector('#customer-menu [data-customer-section="profile"]').click()`);
  await until(()=>evaluate(`document.querySelector('#customer-dialog').open && !document.querySelector('#customer-profile-view').hidden`),'parent profile');
  assert.equal(await evaluate(`document.querySelector('#customer-title').textContent`),'Tu Le');
  assert.equal(await evaluate(`document.querySelector('#customer-profile-form').hidden`),true);
  await screenshot('customer-member-profile-desktop.png');
  await evaluate(`document.querySelector('#customer-profile-edit').click();document.querySelector('#customer-profile-name').value='Tên chưa lưu';document.querySelector('#customer-profile-cancel').click()`);
  assert.equal(await evaluate(`document.querySelector('#customer-profile-display-name').textContent`),'Tu Le');
  await evaluate(`document.querySelector('#customer-profile-edit').click();document.querySelector('#customer-profile-name').value='Lê Đình Tú';document.querySelector('#customer-profile-form').requestSubmit()`);
  await until(()=>evaluate(`document.querySelector('#customer-status').textContent==='Đã lưu thông tin của bạn.' && document.querySelector('#customer-profile-form').hidden`),'save parent name');
  assert.equal(await evaluate(`document.querySelector('#customer-title').textContent`),'Lê Đình Tú');
  await evaluate(`window.profileFailure=true;document.querySelector('#customer-profile-edit').click();document.querySelector('#customer-profile-name').value='Tên lỗi';document.querySelector('#customer-profile-form').requestSubmit()`);
  await until(()=>evaluate(`document.querySelector('#customer-status').textContent.includes('Không kết nối')`),'profile error feedback');
  assert.equal(await evaluate(`document.querySelector('#customer-profile-form').hidden`),false);
  await evaluate(`document.querySelector('#customer-profile-cancel').click()`);
  await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  assert.equal(await evaluate(`document.querySelector('#customer-dialog').scrollWidth<=390`),true);
  await screenshot('customer-member-profile-mobile.png');
  await evaluate(`document.querySelector('#customer-dialog [data-customer-section="orders"]').click()`);
  await until(()=>evaluate(`document.querySelector('.customer-empty-books img')?.naturalWidth>0`),'empty bookshelf');
  await screenshot('customer-member-orders-mobile.png');
  await evaluate(`document.querySelector('#customer-close').click();document.querySelector('.menu-toggle').click();document.querySelector('#customer-entry').click();document.querySelector('#customer-menu-logout').click()`);
  await until(()=>evaluate(`document.querySelector('#customer-entry-label').textContent==='Đăng nhập'`),'parent logout');
  assert.equal(await evaluate(`document.querySelector('#customer-avatar').children.length`),0);
  await cdp('Fetch.disable');customerFixture=undefined;
  await cdp('Emulation.setDeviceMetricsOverride', { width:1440, height:1000, deviceScaleFactor:1, mobile:false });
  await cdp('Page.navigate', {url:`http://127.0.0.1:${port}/admin`});
  await until(()=>evaluate(`document.querySelector('#login-view') && !document.querySelector('#login-view').hidden`),'admin login');
  assert.equal(await evaluate(`document.querySelector('#setup-hint').hidden`),false);
  const adminPassword='Test-only admin password 2026';
  const adminDb=new DatabaseSync(join(scratch,'test.sqlite'));
  adminDb.prepare('INSERT INTO admin_users(id,username,password_hash) VALUES(?,?,?)').run('ui-admin','admin',await hashPassword(adminPassword));
  adminDb.close();
  await cdp('Page.reload');
  await until(()=>evaluate(`document.querySelector('#login-view') && !document.querySelector('#login-view').hidden`),'login reload');
  await screenshot('admin-login.png');
  await evaluate(`document.querySelector('#login-username').value='admin'; document.querySelector('#login-password').value='wrong password'; document.querySelector('#login-form').requestSubmit()`);
  await until(()=>evaluate(`document.querySelector('#login-message').textContent.includes('không đúng')`),'wrong password');
  await evaluate(`document.querySelector('#login-password').value=${JSON.stringify(adminPassword)}; document.querySelector('#login-form').requestSubmit()`);
  await until(()=>evaluate(`!document.querySelector('#dashboard-view').hidden && document.querySelectorAll('#request-list .request-card').length===1`),'admin dashboard');
  assert.equal(await evaluate(`document.querySelector('#summary-pending').textContent`),'01');
  await evaluate(`document.querySelector('[data-summary="pending"]').click()`);
  await until(()=>evaluate(`document.querySelector('[data-summary="pending"]').getAttribute('aria-pressed')==='true' && document.querySelectorAll('#request-list .request-card').length===1`),'summary filter');
  assert.equal(await evaluate(`document.querySelector('#status-filter').value`),'pending');
  await evaluate(`document.querySelector('#status-filter').value=''; document.querySelector('#status-filter').dispatchEvent(new Event('change'))`);
  await until(()=>evaluate(`document.querySelector('[data-summary="pending"]').getAttribute('aria-pressed')==='false' && document.querySelectorAll('#request-list .request-card').length===1`),'clear summary filter');
  await screenshot('admin-desktop.png');
  await evaluate(`document.querySelector('#search-input').value='no-matching-parent';document.querySelector('#search-form').requestSubmit()`);
  await until(()=>evaluate(`!document.querySelector('#empty-state').hidden`),'empty search');
  await evaluate(`document.querySelector('#search-input').value='0989';document.querySelector('#search-form').requestSubmit()`);
  await until(()=>evaluate(`document.querySelectorAll('#request-list .request-card').length===1`),'phone search');
  await evaluate(`document.querySelector('.detail-button').click()`);
  await until(()=>evaluate(`document.querySelector('#detail-dialog').open && !document.querySelector('#status-form').hidden`),'order details');
  assert.equal(await evaluate(`document.querySelector('#detail-content').textContent.includes('598.000đ')`),true);
  assert.equal(await evaluate(`document.querySelector('#detail-dialog').matches(':modal')`),false);
  assert.equal(await evaluate(`document.querySelectorAll('.book-thumbnails img').length`),2);
  assert.equal(await evaluate(`document.querySelectorAll('.detail-book img').length`),2);
  assert.equal(await evaluate(`document.querySelector('#save-status').textContent`),'Xác nhận đơn');
  const deskLayout=await evaluate(`({list:document.querySelector('.inbox-panel').getBoundingClientRect().right,detail:document.querySelector('#detail-dialog').getBoundingClientRect().left})`);
  assert.ok(deskLayout.detail>deskLayout.list, 'Desktop receipt sits beside the inbox');
  await screenshot('admin-desktop.png');
  await evaluate(`document.querySelector('#next-status').value='confirmed';document.querySelector('#status-form').requestSubmit()`);
  await until(()=>evaluate(`document.querySelector('#detail-message').textContent==='Đã cập nhật trạng thái.'`),'order status save');
  assert.equal(await evaluate(`document.querySelectorAll('.history li').length`),2);
  await evaluate(`document.querySelector('#close-detail').click();document.querySelector('[data-inbox="consultations"]').click()`);
  await until(()=>evaluate(`document.querySelector('#inbox-title').textContent==='Yêu cầu tư vấn' && document.querySelectorAll('#request-list .request-card').length===1`),'consultation inbox');
  await evaluate(`document.querySelector('.detail-button').click()`);
  await until(()=>evaluate(`document.querySelector('#detail-dialog').open && !document.querySelector('#status-form').hidden`),'consultation details');
  await evaluate(`document.querySelector('#next-status').value='contacted';document.querySelector('#status-form').requestSubmit()`);
  await until(()=>evaluate(`document.querySelector('#detail-message').textContent==='Đã cập nhật trạng thái.'`),'consultation status save');
  await evaluate(`document.querySelector('#close-detail').click()`);
  await cdp('Page.reload');
  await until(()=>evaluate(`document.querySelector('#dashboard-view') && !document.querySelector('#dashboard-view').hidden && document.querySelectorAll('#request-list .request-card').length===1`),'session persistence');
  await cdp('Emulation.setDeviceMetricsOverride', {width:390,height:844,deviceScaleFactor:1,mobile:true});
  await cdp('Page.reload');
  await until(()=>evaluate(`document.querySelector('#dashboard-view') && !document.querySelector('#dashboard-view').hidden && document.querySelectorAll('#request-list .request-card').length===1`),'mobile dashboard');
  const mobileLayout=await evaluate(`({inner:innerWidth,viewport:visualViewport.width,scale:visualViewport.scale,doc:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>395 && getComputedStyle(e).display!=='none').slice(0,18).map(e=>({tag:e.tagName,class:e.className,width:e.getBoundingClientRect().width,right:e.getBoundingClientRect().right}))})`);
  if(mobileLayout.inner!==390)console.log(JSON.stringify(mobileLayout));
  assert.equal(mobileLayout.inner,390);
  assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth`),true);
  await screenshot('admin-mobile.png');
  await evaluate(`document.querySelector('.detail-button').click()`);
  await until(()=>evaluate(`document.querySelector('#detail-dialog').matches(':modal') && !document.querySelector('#status-form').hidden`),'mobile full-screen receipt');
  assert.equal(await evaluate(`Math.round(document.querySelector('#detail-dialog').getBoundingClientRect().width)`),390);
  assert.equal(await evaluate(`document.querySelector('#detail-dialog').scrollWidth <= document.querySelector('#detail-dialog').clientWidth`),true);
  await screenshot('admin-mobile-detail.png');
  await cdp('Emulation.setDeviceMetricsOverride', {width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await until(()=>evaluate(`document.querySelector('#detail-dialog').open && !document.querySelector('#detail-dialog').matches(':modal')`),'resize receipt to desktop');
  await cdp('Emulation.setDeviceMetricsOverride', {width:390,height:844,deviceScaleFactor:1,mobile:true});
  await until(()=>evaluate(`document.querySelector('#detail-dialog').matches(':modal')`),'resize receipt to mobile');
  await evaluate(`document.querySelector('#close-detail').click()`);
  assert.equal(await evaluate(`document.querySelector('#detail-dialog').open`),false);
  await evaluate(`document.querySelector('#logout-button').click()`);
  await until(()=>evaluate(`!document.querySelector('#login-view').hidden && document.querySelector('#login-message').textContent==='Đã đăng xuất.'`),'logout');
  assert.equal(await evaluate(`(async()=>{const r=await fetch('/api/admin/orders');return r.status;})()`),401);
  assert.deepEqual(browserErrors, []);
  console.log(`Browser checks passed: book ordering, consultations, parent avatars, profile editing/save/cancel/error, empty bookshelf, admin login, invalid password, searching, details, status updates, session reload, logout and mobile overflow. Desktop ticket: ${desktopHeight}px. Screenshots saved in data/.`);
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
