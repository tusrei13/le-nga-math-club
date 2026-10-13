const $ = selector => document.querySelector(selector);
const labels = { pending:'Mới nhận', confirmed:'Chờ giao', shipping:'Đang giao', completed:'Hoàn tất', cancelled:'Đã hủy', new:'Chưa liên hệ', contacted:'Đã liên hệ', resolved:'Đã tư vấn' };
const states = { orders:['pending','confirmed','shipping','completed','cancelled'], consultations:['new','contacted','resolved','cancelled'] };
const currency = value => `${new Intl.NumberFormat('vi-VN').format(value)}đ`;
const dateFormat = new Intl.DateTimeFormat('vi-VN', { dateStyle:'short', timeStyle:'short', timeZone:'Asia/Bangkok' });
const date = value => dateFormat.format(new Date(value.replace(' ','T') + 'Z'));
let auth, inbox = 'orders', offset = 0, total = 0, sequence = 0, detail;
let detailSequence = 0, selectedId, covers = new Map();
const mobileDetail = matchMedia('(max-width: 850px)');
const pageSize = 20;

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function showLogin(message = '', setup = false) {
  auth = undefined; sequence++;
  $('#dashboard-view').hidden = true; $('#login-view').hidden = false; $('#boot-status').hidden = true;
  closeDetail();
  $('#request-list').replaceChildren(); $('#detail-content').replaceChildren(); detail = undefined;
  $('#login-message').textContent = message; $('#setup-hint').hidden = !setup;
  $('#login-password').value = '';
}
async function request(path, { method = 'GET', data } = {}) {
  let response;
  try {
    response = await fetch(path, { method, credentials:'same-origin', headers:{'Content-Type':'application/json', ...(auth?.csrf_token && method !== 'GET' ? {'X-CSRF-Token':auth.csrf_token} : {})}, body:data === undefined ? undefined : JSON.stringify(data), signal:AbortSignal.timeout(15000) });
  } catch { throw new Error('Không kết nối được máy chủ. Vui lòng thử lại.'); }
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401 && path !== '/api/auth/login') showLogin('Phiên đăng nhập đã kết thúc. Vui lòng đăng nhập lại.');
    throw new Error(result.error || 'Không thể xử lý yêu cầu.');
  }
  return result;
}
function statusTag(status) { return element('span', labels[status] || status, `status-tag status-${status}`); }
function populateFilter() {
  const select = $('#status-filter'); select.replaceChildren(new Option('Tất cả trạng thái',''));
  for (const status of states[inbox]) select.add(new Option(labels[status],status));
}
async function showDashboard(current) {
  auth = current; $('#login-form').reset();
  $('#login-password').type = 'password'; $('#password-toggle').textContent = 'Hiện'; $('#password-toggle').setAttribute('aria-pressed','false');
  $('#login-view').hidden = true; $('#boot-status').hidden = true; $('#dashboard-view').hidden = false;
  $('#current-user').textContent = current.username;
  $('#user-initial').textContent = Array.from(current.username)[0].toLocaleUpperCase('vi-VN');
  try {
    const products = await request('/api/products');
    covers = new Map(products.products.map(product => [product.id, product.media.find(media => media.kind === 'cover')?.url]));
  } catch { covers = new Map(); }
  await refresh();
}
async function loadSummary() {
  const data = await request('/api/admin/summary');
  for (const [key,count] of [['pending',data.orders.pending || 0],['shipping',data.orders.shipping || 0],['consultations',data.consultations.new || 0]]) {
    const number=$(`#summary-${key}`);
    number.textContent=String(count).padStart(2,'0');
    number.parentElement.classList.toggle('has-work',count>0);
  }
  $('#order-badge').textContent = data.orders.pending || 0;
  $('#consultation-badge').textContent = data.consultations.new || 0;
}
async function loadList() {
  syncSummaryFilter();
  const version = ++sequence, table = inbox;
  $('#dashboard-message').textContent = '';
  $('.inbox-panel').setAttribute('aria-busy','true');
  $('#request-list').replaceChildren(); $('#empty-state').hidden = true;
  $('#result-count').textContent = 'Đang tải…'; $('#previous-page').disabled = true; $('#next-page').disabled = true;
  const params = new URLSearchParams({limit:String(pageSize),offset:String(offset),q:$('#search-input').value.trim(),status:$('#status-filter').value});
  try {
    const data = await request(`/api/admin/${table}?${params}`);
    if (version !== sequence) return;
    total = data.total;
    if (offset >= total && total > 0) {offset = Math.floor((total-1)/pageSize)*pageSize;return await loadList();}
    for (const row of data.data) {
      const card = element('article', undefined, `request-card ${['pending','new'].includes(row.status) ? 'is-new' : ''}`);
      card.dataset.requestId = row.id;
      const heading = element('div',undefined,'request-heading');
      heading.append(element('h3',row.parent_name,'parent-name'),statusTag(row.status));
      const parent = element('div',undefined,'request-contact');
      const phone = element('a',row.phone); phone.href = `tel:${row.phone}`; parent.append(phone,element('span',`Lớp ${row.grade}`));
      const content = element('div',undefined,'request-books');
      if (table === 'orders') {
        const books = row.items.reduce((sum,item) => sum+item.quantity,0);
        const thumbnails=element('div',undefined,'book-thumbnails');
        for (const item of row.items.slice(0,3)) { const image=coverImage(item); if(image) thumbnails.append(image); }
        const copy=element('div');
        copy.append(element('span',row.items.map(item=>item.title).join(' · '),'cell-title'),element('span',`${books} cuốn · Thanh toán COD`,'cell-meta'));
        content.append(thumbnails,copy,element('strong',currency(row.total_vnd),'request-total'));
      } else content.append(element('span',`Tư vấn sách cho lớp ${row.grade}`,'cell-title'),element('span',row.note ? row.note.slice(0,65) + (row.note.length>65?'…':'') : 'Chưa có ghi chú','cell-meta'));
      const action = element('div',undefined,'request-footer'), button = element('button','Mở phiếu →','detail-button'); button.type='button';
      button.setAttribute('aria-label',`Xem ${table==='orders'?'đơn sách':'tư vấn'} của ${row.parent_name}`);
      button.addEventListener('click',()=>openDetail(table,row.id)); action.append(element('time',date(row.created_at)),button);
      card.append(heading,parent,content,action); $('#request-list').append(card);
      if(selectedId===row.id) card.classList.add('is-selected');
    }
    $('#empty-state').hidden = data.data.length > 0;
    const filtered = params.get('q') || params.get('status');
    $('#empty-title').textContent = filtered ? 'Chưa tìm thấy yêu cầu phù hợp.' : 'Hộp thư đang trống.';
    $('#empty-description').textContent = filtered ? 'Thử từ khóa hoặc trạng thái khác.' : 'Khi phụ huynh gửi yêu cầu, thông tin sẽ xuất hiện tại đây.';
    $('#result-count').textContent = total ? `${offset+1}–${Math.min(offset+pageSize,total)} / ${total} yêu cầu` : '0 yêu cầu';
    $('#previous-page').disabled = offset === 0; $('#next-page').disabled = offset+pageSize >= total;
    if (selectedId && !data.data.some(row=>row.id===selectedId)) closeDetail();
  } catch (error) { if(version===sequence) {$('#dashboard-message').textContent=error.message;$('#result-count').textContent='Chưa tải được dữ liệu';} }
  finally {if(version===sequence) $('.inbox-panel').removeAttribute('aria-busy');}
}
async function refresh() {
  const button = $('#refresh-button'); button.disabled = true;
  try { await Promise.all([loadSummary(),loadList()]); }
  catch(error) {$('#dashboard-message').textContent=error.message;}
  finally {button.disabled=false;}
}
function selectInbox(table, status = '') {
  closeDetail();
  inbox = table; offset = 0;
  document.querySelectorAll('[data-inbox]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.inbox === table)));
  $('#inbox-title').textContent = table === 'orders' ? 'Đơn sách' : 'Yêu cầu tư vấn';
  $('#inbox-description').textContent = table === 'orders' ? 'Nhận đơn, xác nhận với phụ huynh và theo dõi giao sách.' : 'Liên hệ phụ huynh và tìm sách phù hợp với con.';
  $('#search-input').value=''; populateFilter(); $('#status-filter').value=status; loadList();
}
function syncSummaryFilter() {
  const status=$('#status-filter').value;
  document.querySelectorAll('[data-summary]').forEach(button=>{
    const key=button.dataset.summary;
    const selected=key==='consultations' ? inbox==='consultations' && status==='new' : inbox==='orders' && status===key;
    button.setAttribute('aria-pressed',String(selected));
  });
}
function addField(list,title,value,wide=false) {
  const group = element('div',undefined,wide?'detail-wide':undefined);
  const description = element('dd');
  if (value instanceof Node) description.append(value); else description.textContent = value;
  group.append(element('dt',title),description); list.append(group);
}
function coverImage(item) {
  const url=covers.get(item.product_id);
  if (!url) return null;
  const image=element('img'); image.src=url; image.alt=item.title; image.loading='lazy';
  image.addEventListener('error',()=>image.remove(),{once:true});
  return image;
}
function renderDetail(row,table) {
  detail={row,table};
  const container=$('#detail-content'); container.replaceChildren();
  $('#detail-kind').textContent=table==='orders'?'PHIẾU ĐẶT SÁCH':'PHIẾU TƯ VẤN';
  $('#detail-title').textContent=row.parent_name;
  container.append(element('p',row.id,'detail-id'),statusTag(row.status));
  const fields=element('dl',undefined,'detail-grid');
  const phone=element('a',row.phone); phone.href=`tel:${row.phone}`;
  addField(fields,'Số điện thoại',phone);addField(fields,'Lớp của con',`Lớp ${row.grade}`);
  addField(fields,'Ngày nhận',date(row.created_at));addField(fields,'Cập nhật gần nhất',date(row.updated_at));
  if(table==='orders') addField(fields,'Địa chỉ nhận sách',row.address,true);
  addField(fields,'Ghi chú',row.note || 'Không có ghi chú.',true);container.append(fields);
  if(table==='orders') {
    const books=element('section',undefined,'detail-section');books.append(element('h3','Sách trong đơn'));
    for(const item of row.items) {
      const line=element('div',undefined,'detail-book'),copy=element('div',item.title);
      copy.append(element('small',`${item.quantity} cuốn × ${currency(item.unit_price_vnd)}`));
      const image=coverImage(item); if(image) line.append(image);
      else line.classList.add('without-cover');
      line.append(copy,element('strong',currency(item.quantity*item.unit_price_vnd)));books.append(line);
    }
    books.append(element('p',`Phí giao hàng: ${currency(row.shipping_vnd)} · Thanh toán COD`,'cell-meta'));
    const total=element('div',undefined,'detail-total');total.append(element('span','Tổng thanh toán'),element('strong',currency(row.total_vnd)));books.append(total);
    if(row.gifts.length) books.append(element('p',`Quà kèm theo: ${row.gifts.map(g=>g.title).join(', ')}`,'cell-meta'));
    container.append(books);
  }
  const history=element('section',undefined,'detail-section');history.append(element('h3','Lịch sử xử lý'));
  const list=element('ol',undefined,'history');
  for(const item of row.history) {
    const line=element('li');line.append(element('span',`${item.from_status ? `${labels[item.from_status]} → ` : ''}${labels[item.to_status]}`),element('time',date(item.created_at)));list.append(line);
  }
  history.append(list);container.append(history);
  const select=$('#next-status');select.replaceChildren();
  for(const status of row.allowed_statuses) select.add(new Option(labels[status],status));
  $('#status-form').hidden=!row.allowed_statuses.length;
  updateActionLabel();
  if(!row.allowed_statuses.length) container.append(element('p','Yêu cầu đã kết thúc; không còn trạng thái tiếp theo.','final-status'));
}
async function openDetail(table,id) {
  const version=++detailSequence; selectedId=id;
  document.querySelectorAll('.request-card').forEach(card=>card.classList.toggle('is-selected',card.dataset.requestId===id));
  detail=undefined;$('#detail-title').textContent='Đang tải thông tin…';$('#detail-content').replaceChildren();$('#detail-message').textContent='';$('#status-form').hidden=true;
  $('#detail-placeholder').hidden=true;
  const dialog=$('#detail-dialog');
  if(!dialog.open) { if(mobileDetail.matches) dialog.showModal(); else dialog.show(); }
  try {const row=await request(`/api/admin/${table}/${id}`);if(version===detailSequence && dialog.open && auth) renderDetail(row,table);}
  catch(error) {if(version===detailSequence) $('#detail-message').textContent=error.message;}
}
function closeDetail() {
  detailSequence++; selectedId=undefined; detail=undefined;
  $('#detail-dialog').close(); $('#detail-placeholder').hidden=false;
  $('#detail-content').replaceChildren(); $('#detail-message').textContent=''; $('#status-form').hidden=true;
  document.querySelectorAll('.request-card').forEach(card=>card.classList.remove('is-selected'));
}
function updateActionLabel() {
  const actions={confirmed:'Xác nhận đơn',shipping:'Bắt đầu giao sách',completed:'Hoàn tất đơn',cancelled:'Hủy yêu cầu',contacted:'Đánh dấu đã liên hệ',resolved:'Hoàn tất tư vấn'};
  $('#save-status').textContent=actions[$('#next-status').value] || 'Cập nhật trạng thái';
}
mobileDetail.addEventListener('change',()=>{
  const dialog=$('#detail-dialog'); if(!dialog.open)return;
  dialog.close(); if(mobileDetail.matches)dialog.showModal();else dialog.show();
});
$('#detail-dialog').addEventListener('cancel',event=>{event.preventDefault();closeDetail();});
$('#next-status').addEventListener('change',updateActionLabel);
$('#login-form').addEventListener('submit',async event=>{
  event.preventDefault();const button=$('#login-submit');button.disabled=true;$('#login-message').textContent='Đang đăng nhập…';
  try {const result=await request('/api/auth/login',{method:'POST',data:{username:$('#login-username').value.trim(),password:$('#login-password').value}});await showDashboard(result);}
  catch(error) {$('#login-message').textContent=error.message;}
  finally {button.disabled=false;}
});
$('#password-toggle').addEventListener('click',()=>{
  const show=$('#login-password').type==='password';$('#login-password').type=show?'text':'password';$('#password-toggle').textContent=show?'Ẩn':'Hiện';$('#password-toggle').setAttribute('aria-pressed',String(show));
});
$('#logout-button').addEventListener('click',async()=>{
  const button=$('#logout-button');button.disabled=true;
  try {await request('/api/auth/logout',{method:'POST',data:{}});showLogin('Đã đăng xuất.');$('#login-username').focus();}
  catch(error) {$('#dashboard-message').textContent=error.message;}
  finally {button.disabled=false;}
});
document.querySelectorAll('[data-inbox]').forEach(button=>button.addEventListener('click',()=>selectInbox(button.dataset.inbox)));
document.querySelectorAll('[data-summary]').forEach(button=>button.addEventListener('click',()=>selectInbox(button.dataset.summary==='consultations'?'consultations':'orders',button.dataset.summary==='consultations'?'new':button.dataset.summary)));
$('#refresh-button').addEventListener('click',refresh);
$('#search-form').addEventListener('submit',event=>{event.preventDefault();closeDetail();offset=0;loadList();});
$('#status-filter').addEventListener('change',()=>{closeDetail();offset=0;loadList();});
$('#previous-page').addEventListener('click',()=>{closeDetail();offset=Math.max(0,offset-pageSize);loadList();});
$('#next-page').addEventListener('click',()=>{closeDetail();offset+=pageSize;loadList();});
$('#close-detail').addEventListener('click',closeDetail);
$('#status-form').addEventListener('submit',async event=>{
  event.preventDefault();if(!detail)return;
  const {table,row}=detail,button=$('#save-status');button.disabled=true;$('#detail-message').textContent='Đang lưu…';
  const version=detailSequence;
  try {
    await request(`/api/admin/${table}/${row.id}/status`,{method:'PATCH',data:{status:$('#next-status').value,expected_status:row.status}});
    const updated=await request(`/api/admin/${table}/${row.id}`);if(version===detailSequence && auth){renderDetail(updated,table);$('#detail-message').textContent='Đã cập nhật trạng thái.';}if(auth)await refresh();
  } catch(error) {if(version===detailSequence)$('#detail-message').textContent=error.message;}
  finally {button.disabled=false;}
});
populateFilter();
try {const current=await request('/api/auth/session');if(current.deployment==='cloudflare') $('#setup-hint').textContent='Chưa có tài khoản D1. Chạy npm run pages:admin trên máy, rồi áp dụng file SQL theo hướng dẫn CLOUDFLARE.md.';if(current.authenticated)await showDashboard(current);else showLogin('',current.setup_required);}
catch(error) {showLogin(error.message);}
