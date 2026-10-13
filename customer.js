const $ = selector => document.querySelector(selector);
const dialog = $('#customer-dialog');
const menu = $('#customer-menu');
const entry = $('#customer-entry');
let sdk, auth, user, config, initialization;
let mode = 'login', section = 'orders', busy = false, generation = 0, ordersController;
const money = value => `${new Intl.NumberFormat('vi-VN').format(value)}đ`;
const statuses = {pending:'Chờ xác nhận',confirmed:'Chờ giao',shipping:'Đang giao',completed:'Đã nhận sách',cancelled:'Đã hủy'};

// Bound network and SDK waits without assuming a timeout cancels Firebase's request.
function waitFor(promise, milliseconds = 20000) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('timeout'), {code:'auth/request-timeout'})), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
window.customerSession = {
  get id() { return user?.uid || null; },
  getToken: () => user ? waitFor(user.getIdToken(), 10000) : Promise.resolve(null)
};
const message = text => { $('#customer-status').textContent = text; };
function errorMessage(error) {
  return ({
    'auth/invalid-credential':'Email hoặc mật khẩu không đúng.',
    'auth/email-already-in-use':'Email đã được sử dụng. Hãy đăng nhập hoặc đặt lại mật khẩu.',
    'auth/weak-password':'Mật khẩu chưa đủ mạnh.',
    'auth/invalid-email':'Email không hợp lệ.',
    'auth/popup-closed-by-user':'Bạn đã đóng cửa sổ đăng nhập.',
    'auth/cancelled-popup-request':'Lần đăng nhập trước đã được hủy. Hãy thử lại.',
    'auth/popup-blocked':'Trình duyệt chặn cửa sổ Google. Hãy cho phép popup và thử lại.',
    'auth/unauthorized-domain':'Đăng nhập chưa được bật cho địa chỉ trang này.',
    'auth/operation-not-allowed':'Phương thức đăng nhập chưa được bật.',
    'auth/too-many-requests':'Vui lòng chờ một chút trước khi thử lại.',
    'auth/network-request-failed':'Không kết nối được dịch vụ đăng nhập. Kiểm tra mạng và thử lại.',
    'auth/request-timeout':'Kết nối mất quá lâu. Hãy kiểm tra mạng và thử lại. Nếu đang đăng nhập Google, đóng cửa sổ Google cũ trước khi thử lại.',
    'auth/not-configured':'Đăng nhập chưa sẵn sàng. Bạn vẫn có thể đặt sách trực tiếp.',
    'auth/invalid-api-key':'Cấu hình dịch vụ đăng nhập chưa hợp lệ.'
  })[error.code] || 'Chưa thể hoàn tất. Vui lòng thử lại.';
}
function setBusy(value) {
  busy = value;
  for (const button of dialog.querySelectorAll('button:not(#customer-close)')) button.disabled = value;
  for (const button of menu.querySelectorAll('button')) button.disabled = value;
  $('#customer-form').setAttribute('aria-busy', String(value));
  $('#customer-profile-form').setAttribute('aria-busy', String(value));
}
function setMode(next) {
  mode = next;
  document.querySelectorAll('[data-customer-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.customerMode === mode)));
  $('#customer-name-field').hidden = mode !== 'register';
  $('#customer-confirm-field').hidden = mode !== 'register';
  $('#customer-name').required = mode === 'register';
  $('#customer-confirm').required = mode === 'register';
  $('#customer-password').minLength = mode === 'register' ? 12 : 1;
  $('#customer-password').autocomplete = mode === 'register' ? 'new-password' : 'current-password';
  $('#customer-submit').textContent = mode === 'register' ? 'Tạo tài khoản' : 'Đăng nhập';
  $('#customer-forgot').hidden = mode === 'register';
  message('');
}
function closeMenu(restoreFocus = false) {
  menu.hidden = true;
  entry.setAttribute('aria-expanded', 'false');
  if (restoreFocus) entry.focus();
}
function closeMobileNavigation() {
  if (!matchMedia('(max-width:900px)').matches) return;
  $('#site-nav').classList.remove('is-open');
  $('.menu-toggle').setAttribute('aria-expanded', 'false');
}
function displayName(current) {
  return current.displayName?.trim() || current.email?.split('@')[0] || 'bạn';
}
function renderAvatar(current, words) {
  const avatar = $('#customer-avatar');
  const initials = document.createElement('span');
  initials.textContent = words.slice(-2).map(word => Array.from(word)[0]).join('').toLocaleUpperCase('vi-VN');
  avatar.replaceChildren(initials);
  const googleProfile = current.providerData?.find(profile => profile.providerId === 'google.com');
  const photo = googleProfile?.photoURL || current.photoURL;
  if (!photo) return;
  let url;
  try { url = new URL(photo); } catch { return; }
  if (url.protocol !== 'https:') return;
  const image = document.createElement('img');
  image.alt = '';
  image.hidden = true;
  image.referrerPolicy = 'no-referrer';
  image.decoding = 'async';
  image.addEventListener('load', () => {
    if (!avatar.contains(image)) return;
    initials.hidden = true;
    image.hidden = false;
  }, {once:true});
  image.addEventListener('error', () => {
    if (!avatar.contains(image)) return;
    image.remove();
    initials.hidden = false;
  }, {once:true});
  avatar.append(image);
  image.src = url.href;
}
function fillProfile() {
  if (!user) return;
  $('#customer-profile-name').value = user.displayName || '';
  $('#customer-profile-email').value = user.email || '';
  $('#customer-email-state').textContent = user.emailVerified ? 'Email đã được xác minh.' : 'Email chưa được xác minh. Xác minh để dễ khôi phục tài khoản.';
  $('#customer-verify').hidden = !user.email || user.emailVerified;
}
function showSection(next) {
  section = next;
  $('#customer-orders-view').hidden = next !== 'orders';
  $('#customer-profile-view').hidden = next !== 'profile';
  for (const button of dialog.querySelectorAll('[data-customer-section]')) button.setAttribute('aria-pressed', String(button.dataset.customerSection === next));
  message('');
  if (next === 'orders') loadOrders();
  else { generation++; ordersController?.abort(); fillProfile(); }
}
function openAccount(next) {
  if (!user) return;
  closeMenu();
  closeMobileNavigation();
  if (!dialog.open) dialog.showModal();
  showSection(next);
}
function renderAccount(current) {
  const previousId = user?.uid;
  user = current;
  const signedIn = Boolean(user);
  $('#customer-auth-view').hidden = signedIn;
  $('#customer-account-view').hidden = !signedIn;
  $('#customer-welcome-note').hidden = !signedIn;
  $('#customer-avatar').hidden = !signedIn;
  $('#customer-chevron').hidden = !signedIn;
  dialog.classList.toggle('is-account', signedIn);
  $('#customer-kicker').textContent = signedIn ? 'GÓC PHỤ HUYNH' : 'CLB TOÁN CÔ LÊ NGA';
  if (user) {
    const name = displayName(user);
    const words = name.split(/\s+/);
    $('#customer-entry-label').textContent = words.slice(-2).join(' ');
    renderAvatar(user, words);
    $('#customer-menu-name').textContent = name;
    $('#customer-title').textContent = `Chào ${words.at(-1)},`;
    entry.setAttribute('aria-label', `Góc phụ huynh của ${name}`);
    const orderName = $('#order-form [name="name"]');
    if (orderName && !orderName.value && user.displayName) orderName.value = user.displayName;
    // Initial auth restoration must not clear a form the visitor has started typing.
    if (previousId !== user.uid) {
      $('#customer-form').reset();
      message('');
      if (dialog.open) showSection('orders');
    } else if (section === 'profile' && document.activeElement !== $('#customer-profile-name')) fillProfile();
  } else {
    generation++;
    ordersController?.abort();
    closeMenu();
    $('#customer-entry-label').textContent = 'Đăng nhập';
    $('#customer-title').textContent = 'Chào mừng bạn.';
    entry.setAttribute('aria-label', 'Đăng nhập');
    $('#customer-orders').replaceChildren();
    $('#customer-orders-limit').hidden = true;
    $('#customer-profile-form').reset();
    $('#customer-menu-name').textContent = '';
    $('#customer-avatar').replaceChildren();
    if (previousId) { $('#customer-form').reset(); if (dialog.open) dialog.close(); }
  }
}
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function coverImage(url, title = '') {
  const image = element('img');
  let source = '/assets/logo.png';
  try {
    const resolved = new URL(url, location.origin);
    if (url && (resolved.protocol === 'https:' || (resolved.origin === location.origin && resolved.pathname.startsWith('/assets/')))) source = resolved.href;
  } catch {}
  image.src = source;
  image.alt = title;
  image.loading = 'lazy';
  image.addEventListener('error', () => { image.src = '/assets/logo.png'; }, {once:true});
  return image;
}
function emptyOrders() {
  const empty = element('div', undefined, 'customer-orders-empty');
  const books = element('div', undefined, 'customer-empty-books');
  books.setAttribute('aria-hidden', 'true');
  for (const url of ['/assets/books/70_de_but_toc_thi_vao_lop_6_clc.jpg','/assets/books/Phan%20dang%20toan%20lop6%20t1.png','/assets/books/200_bai_hinh_hoc_thi_vao_lop_6_clc.jpg']) books.append(coverImage(url));
  const link = element('a', 'Khám phá bộ sách ↗', 'btn btn-primary');
  link.href = '#bo-sach';
  link.addEventListener('click', () => dialog.close());
  empty.append(books, element('h3', 'Cuốn sách đầu tiên đang chờ bạn.'), element('p', 'Chọn sách phù hợp với lớp và mục tiêu học tập của con.'), link);
  return empty;
}
function orderCard(order) {
  const card = element('article', undefined, 'customer-order');
  const header = element('header', undefined, 'customer-order-heading');
  const meta = element('div');
  meta.append(element('p', `Đơn ${order.id}`, 'customer-order-id'));
  const date = new Date(order.created_at.includes('T') ? order.created_at : order.created_at.replace(' ', 'T') + 'Z');
  if (!Number.isNaN(date.getTime())) meta.append(element('p', date.toLocaleDateString('vi-VN', {day:'2-digit',month:'2-digit',year:'numeric'})));
  const status = element('span', statuses[order.status] || order.status, 'customer-order-status');
  status.dataset.status = order.status;
  header.append(meta, status);
  const items = element('div', undefined, 'customer-order-items');
  for (const item of order.items) {
    const row = element('div', undefined, 'customer-order-item');
    const description = element('div');
    description.append(element('h4', item.title), element('p', `${item.quantity} cuốn${Number.isFinite(item.unit_price_vnd) ? ` · ${money(item.unit_price_vnd)}/cuốn` : ''}`));
    row.append(coverImage(item.cover_url, item.title), description);
    items.append(row);
  }
  const total = element('div', undefined, 'customer-order-total');
  total.append(element('span', 'Tổng thanh toán · COD'), element('strong', money(order.total_vnd)));
  card.append(header, items, total);
  if (order.status === 'cancelled') card.append(element('p', 'Đơn đã hủy. Liên hệ CLB nếu bạn cần hỗ trợ.', 'customer-order-cancelled'));
  else {
    const progress = element('ol', undefined, 'customer-order-progress');
    progress.setAttribute('aria-label', 'Tiến trình đơn sách');
    const steps = ['pending','confirmed','shipping','completed'];
    const current = steps.indexOf(order.status);
    for (const [index, label] of ['Tiếp nhận','Xác nhận','Đang giao','Đã nhận'].entries()) {
      const step = element('li', label, index < current ? 'is-done' : undefined);
      if (index === current) step.setAttribute('aria-current', 'step');
      progress.append(step);
    }
    card.append(progress);
  }
  return card;
}
async function loadOrders() {
  const version = ++generation, currentUser = user;
  ordersController?.abort();
  if (!currentUser) return;
  const controller = ordersController = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const container = $('#customer-orders');
  container.setAttribute('aria-busy', 'true');
  container.replaceChildren(element('p', 'Đang tìm những cuốn sách của bạn…', 'customer-orders-loading'));
  $('#customer-orders-limit').hidden = true;
  try {
    const token = await waitFor(currentUser.getIdToken(), 10000);
    const response = await fetch('/api/customer/orders', {headers:{Authorization:`Bearer ${token}`},signal:controller.signal});
    const result = await response.json();
    if (version !== generation || currentUser.uid !== user?.uid) return;
    if (!response.ok) throw new Error(result.error);
    container.replaceChildren(...(result.orders.length ? result.orders.map(orderCard) : [emptyOrders()]));
    $('#customer-orders-limit').hidden = result.orders.length < 50;
  } catch {
    if (version !== generation || currentUser.uid !== user?.uid) return;
    const error = element('div', undefined, 'customer-orders-error');
    const retry = element('button', 'Thử tải lại');
    retry.type = 'button';
    retry.addEventListener('click', loadOrders);
    error.append(element('p', 'Chưa tải được đơn sách. Kiểm tra kết nối và thử lại.'), retry);
    container.replaceChildren(error);
  } finally {
    clearTimeout(timeout);
    if (version === generation) container.setAttribute('aria-busy', 'false');
  }
}
function initialize() {
  if (auth) return Promise.resolve(true);
  if (initialization) return initialization;
  initialization = (async () => {
    const response = await fetch('/api/customer/config', {signal:AbortSignal.timeout(10000)});
    config = await response.json();
    if (!response.ok) throw Object.assign(new Error(), {code:'auth/network-request-failed'});
    if (!config.enabled) throw Object.assign(new Error(), {code:'auth/not-configured'});
    const [appSdk, authSdk] = await waitFor(Promise.all([
      import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js')
    ]), 15000);
    sdk = authSdk;
    auth = sdk.getAuth(appSdk.initializeApp(config));
    auth.languageCode = 'vi';
    sdk.onAuthStateChanged(auth, renderAccount);
    return true;
  })().catch(error => { initialization = undefined; throw error; });
  return initialization;
}
async function action(callback, pendingMessage = 'Đang xử lý…') {
  if (busy) return;
  setBusy(true);
  message(pendingMessage);
  $('#customer-menu-status').textContent = '';
  try {
    // When ready, invoke the callback in the click event to preserve popup activation.
    if (!auth) { message('Đang kết nối dịch vụ đăng nhập…'); await initialize(); message(pendingMessage); }
    await callback();
  } catch (error) {
    const text = errorMessage(error);
    message(text);
    if (!menu.hidden) $('#customer-menu-status').textContent = text;
  } finally { setBusy(false); }
}

entry.addEventListener('click', () => {
  if (user) {
    menu.hidden = !menu.hidden;
    entry.setAttribute('aria-expanded', String(!menu.hidden));
    if (!menu.hidden) menu.querySelector('button').focus();
  } else {
    closeMenu();
    closeMobileNavigation();
    if (!dialog.open) dialog.showModal();
    if (config && !config.enabled) message(errorMessage({code:'auth/not-configured'}));
  }
});
document.addEventListener('click', event => { if (!event.target.closest('.customer-nav')) closeMenu(); });
document.addEventListener('focusin', event => { if (!event.target.closest('.customer-nav')) closeMenu(); });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !menu.hidden) { event.preventDefault(); closeMenu(true); }
});
$('#customer-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const bounds = dialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
});
dialog.addEventListener('close', () => {
  generation++;
  ordersController?.abort();
  $('#customer-password').value = '';
  $('#customer-confirm').value = '';
  if (entry.getClientRects().length) entry.focus();
  else $('.menu-toggle').focus();
});
document.querySelectorAll('[data-customer-section]').forEach(button => button.addEventListener('click', () => openAccount(button.dataset.customerSection)));
document.querySelectorAll('[data-customer-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.customerMode)));
$('#customer-refresh').addEventListener('click', loadOrders);
$('#customer-form').addEventListener('submit', event => {
  event.preventDefault();
  // Capture input before Firebase's initial state callback can update the view.
  const email = $('#customer-email').value.trim(), password = $('#customer-password').value;
  const name = $('#customer-name').value.trim(), selectedMode = mode, confirmation = $('#customer-confirm').value;
  action(async () => {
    if (selectedMode === 'register') {
      if (password.length < 12) { message('Mật khẩu cần ít nhất 12 ký tự.'); return; }
      if (password !== confirmation) { message('Hai mật khẩu chưa khớp.'); return; }
      const credential = await waitFor(sdk.createUserWithEmailAndPassword(auth, email, password));
      await waitFor(sdk.updateProfile(credential.user, {displayName:name}));
      renderAccount(credential.user);
      try { await waitFor(sdk.sendEmailVerification(credential.user)); message('Đã tạo tài khoản. Kiểm tra email để xác minh địa chỉ của bạn.'); }
      catch { message('Đã tạo tài khoản. Bạn có thể gửi lại email xác minh trong Thông tin cá nhân.'); }
    } else {
      const result = await waitFor(sdk.signInWithEmailAndPassword(auth, email, password));
      renderAccount(result.user);
      message('Đăng nhập thành công.');
    }
  });
});
$('#customer-google').addEventListener('click', () => action(async () => {
  const provider = new sdk.GoogleAuthProvider();
  provider.setCustomParameters({prompt:'select_account'});
  const result = await waitFor(sdk.signInWithPopup(auth, provider), 120000);
  renderAccount(result.user);
  message('Đăng nhập Google thành công.');
}, 'Chọn tài khoản trong cửa sổ Google. Đóng cửa sổ đó để hủy đăng nhập.'));
$('#customer-forgot').addEventListener('click', () => action(async () => {
  const email = $('#customer-email').value.trim();
  if (!email || !$('#customer-email').checkValidity()) { message('Nhập email hợp lệ để nhận liên kết đặt lại mật khẩu.'); $('#customer-email').focus(); return; }
  await waitFor(sdk.sendPasswordResetEmail(auth, email));
  message('Nếu email có tài khoản, bạn sẽ nhận được liên kết đặt lại mật khẩu.');
}));
$('#customer-verify').addEventListener('click', () => action(async () => {
  if (!user) return;
  await waitFor(sdk.sendEmailVerification(user));
  message('Đã gửi email xác minh. Hãy kiểm tra hộp thư.');
}));
$('#customer-profile-form').addEventListener('submit', event => {
  event.preventDefault();
  const name = $('#customer-profile-name').value.trim();
  if (!name) { message('Vui lòng nhập họ tên.'); $('#customer-profile-name').focus(); return; }
  action(async () => {
    if (!user) return;
    await waitFor(sdk.updateProfile(user, {displayName:name}));
    renderAccount(user);
    message('Đã lưu thông tin của bạn.');
  }, 'Đang lưu thông tin…');
});
function logout() {
  action(async () => { await waitFor(sdk.signOut(auth)); renderAccount(null); closeMenu(); message('Đã đăng xuất.'); }, 'Đang đăng xuất…');
}
$('#customer-logout').addEventListener('click', logout);
$('#customer-menu-logout').addEventListener('click', logout);
initialize().catch(error => { if (dialog.open && !busy) message(errorMessage(error)); });
