const $=s=>document.querySelector(s);
const money=n=>new Intl.NumberFormat('vi-VN').format(n)+'đ';
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const clean=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase();
let products=[],paperFilter='all',query='';
function external(label,url,cls){const a=node('a',label,cls);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;}
function previewUrl(path){try{const u=new URL(path,location.origin);return u.origin===location.origin&&u.pathname.startsWith('/assets/')&&u.pathname.endsWith('.pdf')?u.href:null;}catch{return null;}}
function previewButton(p){
 const files=(p.previews||[]).filter(f=>previewUrl(f.url));if(!files.length)return null;
 if(files.length===1){const a=external('Đọc thử PDF',previewUrl(files[0].url),'book-preview');a.setAttribute('aria-label','Đọc thử '+p.title+' (PDF, mở tab mới)');return a;}
 const b=node('button','Đọc thử PDF','book-preview');b.type='button';b.dataset.catalogPreview=p.id;b.setAttribute('aria-haspopup','dialog');return b;
}
function priceLine(p){const line=node('p',undefined,'reference-price');line.append(node('strong',p.price_vnd===null?'Liên hệ':money(p.price_vnd)+'/'+p.unit));if(p.old_price_vnd)line.append(node('del',money(p.old_price_vnd)));return line;}
function filterPaper(){
 let count=0,primaryVisible=false;
 for(const card of document.querySelectorAll('.book-card[data-product-id]')){
  const p=products.find(p=>p.id===card.dataset.productId);if(!p)continue;
  const inGroup=paperFilter==='all'||paperFilter==='primary'&&p.grade<6||String(p.grade)===paperFilter;
  card.hidden=!inGroup||!clean(p.title+' '+p.description).includes(clean(query));
  if(!card.hidden){count++;if(p.id.startsWith('sieu-nhan-tap-'))primaryVisible=true;}
 }
 const intro=$('#primary-series-overview');if(intro)intro.hidden=!primaryVisible;
 $('#paper-catalog-status').textContent=count+' sản phẩm sách giấy';
}
function decorate(){
 for(const card of document.querySelectorAll('.book-card[data-product-id]')){
  const p=products.find(p=>p.id===card.dataset.productId);if(!p)continue;const copy=card.querySelector('.book-card-copy');
  if(copy.querySelector('.reference-product-meta'))continue;
  copy.prepend(node('p',[p.format_label,p.pages].filter(Boolean).join(', '),'reference-product-meta'));
  if(p.old_price_vnd){const detail=node('p','Giá gốc '+money(p.old_price_vnd)+'/'+p.unit+'. Ưu đãi đến '+new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Bangkok'}).format(new Date(p.promotion_ends_at)),'reference-product-meta');copy.querySelector('.product-price').after(detail);}
 }
 filterPaper();
}
function initialize(list){
 products=list;queueMicrotask(decorate);
 for(const el of document.querySelectorAll('[data-reference-price]')){const p=products.find(p=>p.id===el.dataset.referencePrice);if(p)el.textContent=p.price_vnd===null?'Liên hệ':money(p.price_vnd)+'/'+p.unit;}
 const sale=products.filter(p=>p.old_price_vnd);$('#uu-dai').hidden=!sale.length;const target=$('#reference-sale-list');target.replaceChildren();
 for(const p of sale.filter(p=>p.format==='paper').concat(sale.filter(p=>p.format!=='paper').slice(0,2))){
  const a=node('a',undefined,'reference-sale-item');a.href=p.format==='paper'?'#bo-sach':'#tai-lieu-so';a.append(node('strong',p.title),node('span',money(p.price_vnd)+'/'+p.unit));target.append(a);
 }
}
$('#catalog-search').addEventListener('input',event=>{query=event.target.value.trim();filterPaper();window.dispatchEvent(new CustomEvent('catalog:search',{detail:query}));});
$('#paper-catalog-filters').addEventListener('click',event=>{const b=event.target.closest('[data-paper-filter]');if(!b)return;paperFilter=b.dataset.paperFilter;for(const e of document.querySelectorAll('[data-paper-filter]'))e.setAttribute('aria-pressed',String(e===b));filterPaper();});
const previewDialog=$('#catalog-preview-dialog');let previewOpener;
document.addEventListener('click',event=>{
 const b=event.target.closest('[data-catalog-preview]');if(!b)return;const p=products.find(p=>p.id===b.dataset.catalogPreview);if(!p)return;
 const files=$('#catalog-preview-files');files.replaceChildren();$('#catalog-preview-title').textContent='Đọc thử: '+p.title;
 for(const file of p.previews||[]){const href=previewUrl(file.url);if(href)files.append(external(file.label+' (PDF)',href,'book-preview'));}
 previewOpener=b;previewDialog.showModal();
});
$('#catalog-preview-close').addEventListener('click',()=>previewDialog.close());
previewDialog.addEventListener('close',()=>previewOpener?.isConnected&&previewOpener.focus({preventScroll:true}));
previewDialog.addEventListener('click',e=>{if(e.target!==previewDialog)return;const r=previewDialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)previewDialog.close();});
for(const button of document.querySelectorAll('[data-reference-video]'))button.addEventListener('click',async()=>{
 const video=document.querySelector('[data-reference-player="'+button.dataset.referenceVideo+'"]');
 document.querySelectorAll('[data-reference-player]').forEach(v=>v.pause());video.src=video.dataset.videoSrc;video.hidden=false;button.hidden=true;
 try{await video.play();}catch{button.parentElement.querySelector('.reference-video-status').textContent='Bấm nút phát trong video để bắt đầu.';}
 video.addEventListener('error',()=>{const status=button.parentElement.querySelector('.reference-video-status');status.replaceChildren(external('Mở video ở tab mới',video.dataset.videoSrc,'text-link'));},{once:true});
});
document.addEventListener('visibilitychange',()=>{if(document.hidden)document.querySelectorAll('[data-reference-player]').forEach(v=>v.pause());});
window.addEventListener('books:rendered',decorate);
window.addEventListener('catalog:loaded',event=>initialize(event.detail));
if(window.referenceProducts)initialize(window.referenceProducts);
