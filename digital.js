const $=selector=>document.querySelector(selector);
const catalog=$('#digital-catalog'),previewDialog=$('#digital-preview-dialog');
let products=[];
const node=(tag,text,className)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;};
let selectedGrade='',currentPage=1;
const pageSize=6;
function productCard(product){
  const topic=/chuyên đề|tổng\s*[–-]\s*hiệu|tối ưu|đường tròn/i.test(product.title);
  const card=node('article',undefined,'digital-product');
  const cover=node('div',undefined,'digital-cover'+(topic?' digital-cover-topic':''));
  cover.setAttribute('aria-hidden','true');
  cover.append(node('span','TOÁN CÔ LÊ NGA','digital-cover-brand'),node('strong','TOÁN '+product.grade,'digital-cover-grade'),node('span',undefined,'digital-cover-lines'),node('span',topic?'CHUYÊN ĐỀ':'BỘ ĐỀ','digital-cover-kind'));
  const info=node('div',undefined,'digital-product-info');
  info.append(node('p',(topic?'Chuyên đề':'Bộ đề')+' · PDF · '+product.file_count+' bản đọc thử','digital-product-meta'),node('h3',product.title));
  const bottom=node('div',undefined,'digital-product-bottom');
  bottom.append(node('span','Đọc thử miễn phí','digital-preview-free'));
  if(product.files.length===1)bottom.append(previewLink(product.files[0],'Đọc thử PDF','btn btn-primary'));
  else {const button=node('button','Đọc thử PDF','btn btn-primary');button.type='button';button.dataset.digitalPreview=product.id;button.addEventListener('click',()=>openPreview(product));bottom.append(button);}
  info.append(bottom);card.append(cover,info);return card;
}
function renderPagination(total){
  const pages=Math.max(1,Math.ceil(total/pageSize)),start=(currentPage-1)*pageSize;
  $('#digital-page-summary').textContent=total?'Hiển thị '+(start+1)+'–'+Math.min(start+pageSize,total)+' trong '+total+' bộ tài liệu':'Không có tài liệu cho lựa chọn này.';
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
function renderCatalog(){
  const grade=selectedGrade;
  const visible=products.filter(p=>!grade||p.grade===Number(grade));
  currentPage=Math.min(currentPage,Math.max(1,Math.ceil(visible.length/pageSize)));
  const start=(currentPage-1)*pageSize;
  catalog.replaceChildren(...visible.slice(start,start+pageSize).map(productCard));
  renderPagination(visible.length);
  if(!visible.length)catalog.append(node('p','Chưa có tài liệu cho lựa chọn này.','digital-empty'));
  $('#digital-result-count').textContent=visible.length+' bộ tài liệu';
  const saleNote=$('#digital-sale-note');
  saleNote.hidden=false;saleNote.textContent='Đọc thử miễn phí';
}
async function loadCatalog(){
  catalog.setAttribute('aria-busy','true');$('#digital-catalog-status').textContent='Đang tải danh mục tài liệu…';
  try{
    const response=await fetch('/api/digital/products',{signal:AbortSignal.timeout(12000)}),data=await response.json();
    if(!response.ok)throw new Error(data.error);
    products=data.products;renderCatalog();$('#digital-catalog-status').textContent='';
  }catch(error){
    catalog.replaceChildren();$('#digital-result-count').textContent='';$('#digital-pagination').hidden=true;$('#digital-page-summary').textContent='';
    const retry=node('button','Tải lại danh mục','btn btn-outline');retry.type='button';retry.addEventListener('click',loadCatalog);catalog.append(retry);
    $('#digital-catalog-status').textContent=error.name==='TimeoutError'?'Kết nối mất quá lâu. Vui lòng thử lại.':error.message||'Chưa tải được danh mục.';
  }finally{catalog.setAttribute('aria-busy','false');}
}

function previewLink(file,label=file.label,className='btn btn-outline'){
  const link=node('a',label,className);
  const url=new URL(file.url,location.origin);
  if(url.origin!==location.origin||!url.pathname.startsWith('/assets/documents/previews/')||!url.pathname.endsWith('.pdf'))throw new Error('Đường dẫn đọc thử không hợp lệ.');
  link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';return link;
}
function openPreview(product){
  $('#digital-preview-title').textContent=product.title;
  const links=$('#digital-preview-files');links.replaceChildren(...product.files.map(file=>previewLink(file)));
  if(!previewDialog.open)previewDialog.showModal();
}
$('#digital-preview-close').addEventListener('click',()=>previewDialog.close());
previewDialog.addEventListener('click',event=>{if(event.target===previewDialog){const r=previewDialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)previewDialog.close();}});
document.querySelectorAll('[data-digital-grade]').forEach(button=>button.addEventListener('click',()=>{selectedGrade=button.dataset.digitalGrade;currentPage=1;document.querySelectorAll('[data-digital-grade]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));renderCatalog();}));
loadCatalog();
