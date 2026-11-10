const $=selector=>document.querySelector(selector);
const catalog=$('#digital-catalog'),previewDialog=$('#digital-preview-dialog');
// One grid for every document: free PDF previews (digital catalog) and full documents sold through Zalo (reference catalog).
let freeProducts=[],orderProducts=[];
const node=(tag,text,className)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;};
const clean=s=>s.normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/đ/g,'d').toLowerCase();
const money=n=>new Intl.NumberFormat('vi-VN').format(n)+'đ';
let selectedGrade='',currentPage=1,query='';
const pageSize=6;
function typographicCover(topic,product){return [node('span','TOÁN CÔ LÊ NGA','digital-cover-brand'),node('strong','TOÁN '+product.grade,'digital-cover-grade'),node('span',undefined,'digital-cover-lines'),node('span',topic?'CHUYÊN ĐỀ':'BỘ ĐỀ','digital-cover-kind')];}
function allItems(){
  const free=freeProducts.map(p=>({...p,kind:'free',description:p.description||''}));
  const orders=orderProducts.map(p=>({id:p.id,kind:'order',title:p.title,grade:p.grade,description:p.description||'',cover:(p.media||[]).find(m=>m.kind==='cover')?.url||null,format_label:p.format_label,price_vnd:p.price_vnd,unit:p.unit,promotion_ends_at:p.promotion_ends_at,files:(p.previews||[]).map(f=>({label:f.label,url:f.url})),file_count:(p.previews||[]).length,enquiry:p.format==='enquiry'}));
  return [...free,...orders].sort((a,b)=>a.grade-b.grade||a.title.localeCompare(b.title,'vi'));
}
function coverFor(item,topic){
  const cover=node('div',undefined,'digital-cover'+(topic?' digital-cover-topic':''));
  cover.setAttribute('aria-hidden','true');
  if(item.cover){
    // Real first page of the reading sample; fall back to the typographic cover if it fails.
    const image=node('img');image.src=item.cover;image.alt='';image.loading='lazy';image.decoding='async';image.width=400;image.height=566;
    image.addEventListener('error',()=>{cover.classList.remove('has-image');image.remove();cover.append(...typographicCover(topic,item));},{once:true});
    cover.classList.add('has-image');cover.append(image);
  } else cover.append(...typographicCover(topic,item));
  return cover;
}
function productCard(item){
  const topic=/chuyên đề|tổng\s*[–-]\s*hiệu|tối ưu|đường tròn/i.test(item.title);
  const card=node('article',undefined,'digital-product');
  if(item.kind==='order')card.dataset.orderProduct=item.id;
  const info=node('div',undefined,'digital-product-info');
  if(item.kind==='order'){
    info.append(node('p','Lớp '+item.grade+', '+item.format_label,'digital-product-meta'),node('h3',item.title));
    if(item.description)info.append(node('p',item.description,'digital-product-desc'));
    const price=node('p',undefined,'digital-product-price');
    price.append(node('strong',item.price_vnd===null?'Liên hệ':money(item.price_vnd)+'/'+item.unit));
    info.append(price);
    if(item.enquiry)info.append(node('small','Liên hệ trợ lí để xác nhận hình thức nhận tài liệu.','digital-product-meta'));
    if(item.promotion_ends_at)info.append(node('small','Ưu đãi đến '+new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Bangkok'}).format(new Date(item.promotion_ends_at)),'digital-product-meta'));
  } else {
    info.append(node('p',(topic?'Chuyên đề':'Bộ đề')+' PDF, '+item.file_count+' bản đọc thử','digital-product-meta'),node('h3',item.title));
  }
  card.append(coverFor(item,topic));
  const bottom=node('div',undefined,'digital-product-bottom');
  if(item.files.length){
    bottom.append(node('span','Đọc thử miễn phí','digital-preview-free'));
    if(item.files.length===1)bottom.append(previewLink(item.files[0],'Đọc thử PDF','btn btn-outline'));
    else {const button=node('button','Đọc thử PDF','btn btn-outline');button.type='button';button.dataset.digitalPreview=item.id;button.addEventListener('click',()=>openPreview(item));bottom.append(button);}
  }
  if(item.kind==='order'){
    const zalo=node('a',item.price_vnd===null?'Hỏi giá qua Zalo':'Đặt tài liệu qua Zalo','btn btn-primary');
    zalo.href='https://zalo.me/0365473632';zalo.target='_blank';zalo.rel='noopener noreferrer';bottom.append(zalo);
  }
  info.append(bottom);card.append(info);return card;
}
function renderPagination(total){
  const pages=Math.max(1,Math.ceil(total/pageSize)),start=(currentPage-1)*pageSize;
  $('#digital-page-summary').textContent=total?'Hiển thị '+(start+1)+'–'+Math.min(start+pageSize,total)+' trong '+total+' tài liệu':'Không có tài liệu cho lựa chọn này.';
  const nav=$('#digital-pagination');nav.replaceChildren();nav.hidden=pages<=1;
  if(pages<=1)return;
  function button(label,page,disabled=false){
    const item=node('button',label);item.type='button';item.disabled=disabled;item.dataset.digitalPage=String(page);
    if(label===String(currentPage))item.setAttribute('aria-current','page');
    else if(/^\d+$/.test(label))item.setAttribute('aria-label','Trang '+page);
    item.addEventListener('click',()=>{
      currentPage=page;renderCatalog();
    });nav.append(item);
  }
  button('Trước',currentPage-1,currentPage===1);
  for(let page=1;page<=pages;page++)button(String(page),page);
  button('Sau',currentPage+1,currentPage===pages);
}
function visibleItems(){
  const needle=clean(query);
  return allItems().filter(item=>(!selectedGrade||item.grade===Number(selectedGrade))&&clean(item.title+' '+item.description).includes(needle));
}
function renderCatalog(){
  const visible=visibleItems();
  currentPage=Math.min(currentPage,Math.max(1,Math.ceil(visible.length/pageSize)));
  const start=(currentPage-1)*pageSize;
  catalog.replaceChildren(...visible.slice(start,start+pageSize).map(productCard));
  renderPagination(visible.length);
  if(!visible.length)catalog.append(node('p','Chưa có tài liệu cho lựa chọn này.','digital-empty'));
  $('#digital-result-count').textContent=visible.length+' tài liệu';
  const saleNote=$('#digital-sale-note');
  saleNote.hidden=false;saleNote.textContent='Đọc thử miễn phí';
}
async function loadCatalog(){
  catalog.setAttribute('aria-busy','true');$('#digital-catalog-status').textContent='Đang tải danh mục tài liệu…';
  try{
    const response=await fetch('/api/digital/products',{signal:AbortSignal.timeout(12000)}),data=await response.json();
    if(!response.ok)throw new Error(data.error);
    freeProducts=data.products;renderCatalog();$('#digital-catalog-status').textContent='';
  }catch(error){
    catalog.replaceChildren();$('#digital-result-count').textContent='';$('#digital-pagination').hidden=true;$('#digital-page-summary').textContent='';
    const retry=node('button','Tải lại danh mục','btn btn-outline');retry.type='button';retry.addEventListener('click',loadCatalog);catalog.append(retry);
    $('#digital-catalog-status').textContent=error.name==='TimeoutError'?'Kết nối mất quá lâu. Vui lòng thử lại.':error.message||'Chưa tải được danh mục.';
  }finally{catalog.setAttribute('aria-busy','false');}
}

function previewLink(file,label=file.label,className='btn btn-outline'){
  const link=node('a',label,className);
  const url=new URL(file.url,location.origin);
  if(url.origin!==location.origin||!url.pathname.startsWith('/assets/')||!url.pathname.endsWith('.pdf'))throw new Error('Đường dẫn đọc thử không hợp lệ.');
  link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';return link;
}
function openPreview(item){
  $('#digital-preview-title').textContent=item.title;
  const links=$('#digital-preview-files');links.replaceChildren(...item.files.map(file=>previewLink(file)));
  if(!previewDialog.open)previewDialog.showModal();
}
$('#digital-preview-close').addEventListener('click',()=>previewDialog.close());
previewDialog.addEventListener('click',event=>{if(event.target===previewDialog){const r=previewDialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)previewDialog.close();}});
document.querySelectorAll('[data-digital-grade]').forEach(button=>button.addEventListener('click',()=>{selectedGrade=button.dataset.digitalGrade;currentPage=1;document.querySelectorAll('[data-digital-grade]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));renderCatalog();}));
window.addEventListener('catalog:search',event=>{query=event.detail||'';currentPage=1;renderCatalog();});
// Full documents come from the shared catalog request, which may finish before or after this script.
const takeOrders=list=>{orderProducts=list.filter(p=>p.format!=='paper');renderCatalog();};
window.addEventListener('catalog:loaded',event=>takeOrders(event.detail));
if(window.referenceProducts)takeOrders(window.referenceProducts);
loadCatalog();
