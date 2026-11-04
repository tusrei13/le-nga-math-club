const $=selector=>document.querySelector(selector);
const money=value=>new Intl.NumberFormat('vi-VN').format(value)+'đ';
const catalog=$('#digital-catalog'),checkout=$('#digital-checkout'),form=$('#digital-order-form');
let products=[],checkoutEnabled=false,selected,requestGeneration=0,libraryGeneration=0,libraryController,pending,buyerId,busy=false;
const labels={pending:'Chờ xác nhận thanh toán',paid:'Đã mở quyền tải',cancelled:'Đã hủy',revoked:'Quyền tải đã thu hồi'};
const node=(tag,text,className)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;};
function session(){return window.customerSession;}
function openLibrary(){session()?.open('digital');}
let selectedGrade='';
function productCard(product){
  const topic=/chuyên đề|tổng\s*[–-]\s*hiệu|tối ưu|đường tròn/i.test(product.title);
  const card=node('article',undefined,'digital-product');
  const cover=node('div',undefined,'digital-cover'+(topic?' digital-cover-topic':''));
  cover.setAttribute('aria-hidden','true');
  cover.append(node('span','TOÁN CÔ LÊ NGA','digital-cover-brand'),node('strong','TOÁN '+product.grade,'digital-cover-grade'),node('span',undefined,'digital-cover-lines'),node('span',topic?'CHUYÊN ĐỀ':'BỘ ĐỀ','digital-cover-kind'));
  const info=node('div',undefined,'digital-product-info');
  info.append(node('p',(topic?'Chuyên đề':'Bộ đề')+' · PDF · '+product.file_count+' file','digital-product-meta'),node('h3',product.title));
  const seeded='Tài liệu PDF cho lớp '+product.grade+'. '+product.title+'. Bộ gồm '+product.file_count+' file; xem tên từng file sau khi được cấp quyền tải.';
  if(product.description&&product.description!==seeded)info.append(node('p',product.description,'digital-product-description'));
  const bottom=node('div',undefined,'digital-product-bottom'),price=node('div');
  price.append(node('small',product.is_draft?'Giá dự kiến':'Giá trọn bộ'),node('strong',money(product.price_vnd)));bottom.append(price);
  if(checkoutEnabled){
    const button=node('button',product.is_draft?'Sắp mở bán':'Chọn bộ này','btn btn-primary');
    button.type='button';button.disabled=product.is_draft;button.dataset.digitalProduct=product.id;
    button.addEventListener('click',()=>openCheckout(product));bottom.append(button);
  }
  info.append(bottom);card.append(cover,info);return card;
}
function renderCatalog(){
  const grade=selectedGrade;
  const visible=products.filter(p=>!grade||p.grade===Number(grade));
  catalog.replaceChildren(...visible.map(productCard));
  if(!visible.length)catalog.append(node('p','Chưa có tài liệu cho lựa chọn này.','digital-empty'));
  $('#digital-result-count').textContent=visible.length+' bộ tài liệu';
  const saleNote=$('#digital-sale-note');
  saleNote.hidden=checkoutEnabled||!products.length;
  saleNote.textContent=products.every(p=>p.is_draft)?'Sắp mở bán':'Tạm ngừng nhận đơn';
}
async function loadCatalog(){
  catalog.setAttribute('aria-busy','true');$('#digital-catalog-status').textContent='Đang tải danh mục tài liệu…';
  try{
    const response=await fetch('/api/digital/products',{signal:AbortSignal.timeout(12000)}),data=await response.json();
    if(!response.ok)throw new Error(data.error);
    products=data.products;checkoutEnabled=data.checkout_enabled;renderCatalog();$('#digital-catalog-status').textContent='';
  }catch(error){
    catalog.replaceChildren();$('#digital-result-count').textContent='';
    const retry=node('button','Tải lại danh mục','btn btn-outline');retry.type='button';retry.addEventListener('click',loadCatalog);catalog.append(retry);
    $('#digital-catalog-status').textContent=error.name==='TimeoutError'?'Kết nối mất quá lâu. Vui lòng thử lại.':error.message||'Chưa tải được danh mục.';
  }finally{catalog.setAttribute('aria-busy','false');}
}
function openCheckout(product){
  if(!session()?.id){session()?.open('digital');return;}
  selected=product;buyerId=session().id;requestGeneration++;form.reset();
  $('#digital-checkout-title').textContent=product.title;
  $('#digital-checkout-price').textContent=money(product.price_vnd);
  form.elements.name.value=$('#customer-profile-display-name')?.textContent||'';
  $('#digital-checkout-status').textContent='';
  if(!checkout.open)checkout.showModal();
}
async function authorizedRequest(path,{method='GET',data,headers={},signal}={}){
  const owner=session()?.id;if(!owner)throw new Error('Vui lòng đăng nhập để tiếp tục.');
  const token=await session().getToken();
  if(!token||session()?.id!==owner)throw new Error('Phiên đăng nhập đã thay đổi. Vui lòng thử lại.');
  const response=await fetch(path,{method,headers:{Authorization:'Bearer '+token,...(method!=='GET'?{'Content-Type':'application/json'}:{}),...headers},body:data===undefined?undefined:JSON.stringify(data),signal:signal||AbortSignal.timeout(15000)});
  const result=await response.json();
  if(session()?.id!==owner)throw new Error('Phiên đăng nhập đã thay đổi.');
  if(!response.ok)throw new Error(result.error||'Chưa thể xử lý yêu cầu.');
  return result;
}
form.addEventListener('submit',async event=>{
  event.preventDefault();if(busy||!selected||buyerId!==session()?.id)return;
  const input={product_id:selected.id,expected_price_vnd:selected.price_vnd,expected_version:selected.version,name:form.elements.name.value.trim(),phone:form.elements.phone.value.trim(),consent:form.elements.consent.checked};
  const fingerprint=JSON.stringify({owner:buyerId,...input});
  if(!pending||pending.fingerprint!==fingerprint)pending={fingerprint,key:crypto.randomUUID()};
  const version=requestGeneration;busy=true;$('#digital-order-submit').disabled=true;form.setAttribute('aria-busy','true');$('#digital-checkout-status').textContent='Đang tạo đơn tài liệu…';
  try{
    await authorizedRequest('/api/digital/orders',{method:'POST',data:input,headers:{'Idempotency-Key':pending.key}});
    if(version!==requestGeneration)return;
    pending=undefined;checkout.close();openLibrary();
  }catch(error){if(version===requestGeneration)$('#digital-checkout-status').textContent=error.message;}
  finally{busy=false;$('#digital-order-submit').disabled=false;form.removeAttribute('aria-busy');}
});
$('#digital-checkout-close').addEventListener('click',()=>checkout.close());
checkout.addEventListener('close',()=>{requestGeneration++;selected=undefined;buyerId=undefined;});
document.querySelectorAll('[data-digital-grade]').forEach(button=>button.addEventListener('click',()=>{selectedGrade=button.dataset.digitalGrade;document.querySelectorAll('[data-digital-grade]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));renderCatalog();}));
$('#digital-library-open').addEventListener('click',openLibrary);
$('#customer-digital-refresh').addEventListener('click',loadLibrary);
function transferDetails(order,payment){
  const box=node('div',undefined,'digital-payment-details');
  if(!payment.enabled){box.append(node('p','CLB chưa nhận chuyển khoản cho đơn này. Liên hệ 0989 066 885 để được hỗ trợ.'));return box;}
  box.append(node('h4','Thông tin chuyển khoản'));
  const list=node('dl');for(const [label,value] of [['Ngân hàng',payment.bank_name],['Số tài khoản',payment.account_number],['Chủ tài khoản',payment.account_holder],['Số tiền',money(order.amount_vnd)],['Nội dung',order.id]]){
    const row=node('div');row.append(node('dt',label),node('dd',value));list.append(row);
  }
  box.append(list,node('p','Quyền tải được mở sau khi CLB kiểm tra tiền thực nhận.'));
  if(payment.instructions)box.append(node('p',payment.instructions));
  return box;
}
function libraryCard(order,payment){
  const card=node('article',undefined,'digital-library-card');
  const head=node('div',undefined,'digital-library-heading');
  head.append(node('h4',order.title),node('span',labels[order.status]||order.status,'digital-order-status'));
  card.append(head,node('p','Mã đơn: '+order.id,'digital-order-reference'),node('p','Giá trị: '+money(order.amount_vnd)));
  if(order.status==='pending')card.append(transferDetails(order,payment));
  if(order.status==='revoked')card.append(node('p','Liên hệ CLB để được giải đáp về quyền tải tài liệu.'));
  if(order.status==='paid'){
    const files=node('div',undefined,'digital-library-files'),message=node('p',undefined,'digital-download-status');message.setAttribute('role','status');
    for(const file of order.files||[]){
      const button=node('button','Tải '+file.label,'btn btn-outline');button.type='button';button.dataset.digitalFile=file.id;
      button.addEventListener('click',async()=>{
        const version=libraryGeneration;button.disabled=true;message.textContent='Đang chuẩn bị tài liệu…';
        try{
          const result=await authorizedRequest('/api/customer/digital-orders/'+encodeURIComponent(order.id)+'/files/'+encodeURIComponent(file.id)+'/download',{method:'POST',data:{}});
          if(version!==libraryGeneration)return;
          const url=new URL(result.url);
          if(url.protocol!=='https:'||!url.hostname.endsWith('.supabase.co')||!url.pathname.startsWith('/storage/v1/object/sign/paid-documents/'))throw new Error('Liên kết tài liệu không hợp lệ.');
          const link=node('a');link.href=url.href;link.download='';link.rel='noreferrer';link.referrerPolicy='no-referrer';document.body.append(link);link.click();link.remove();
          message.textContent='Đã gửi yêu cầu tải. Nếu liên kết hết hạn, hãy bấm tải lại.';
        }catch(error){if(version===libraryGeneration)message.textContent=error.message;}
        finally{button.disabled=false;}
      });files.append(button);
    }
    card.append(files,message);
  }
  return card;
}
async function loadLibrary(){
  const owner=session()?.id,version=++libraryGeneration;
  libraryController?.abort();if(!owner)return;
  const controller=libraryController=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
  const container=$('#customer-digital-orders');container.setAttribute('aria-busy','true');container.replaceChildren(node('p','Đang tải tài liệu của bạn…'));
  try{
    const result=await authorizedRequest('/api/customer/digital-orders',{signal:controller.signal});
    if(version!==libraryGeneration)return;
    container.replaceChildren(...result.orders.map(order=>libraryCard(order,result.payment)));
    if(!result.orders.length){
      const empty=node('div',undefined,'digital-library-empty'),link=node('a','Khám phá tài liệu','btn btn-primary');link.href='#tai-lieu-so';link.addEventListener('click',()=>$('#customer-dialog').close());
      empty.append(node('h4','Tài liệu cho hành trình học của con.'),node('p','Các bộ đã đặt và quyền tải sẽ xuất hiện tại đây.'),link);container.append(empty);
    }
  }catch(error){
    if(version!==libraryGeneration)return;
    const retry=node('button','Thử tải lại','btn btn-outline');retry.type='button';retry.addEventListener('click',loadLibrary);
    container.replaceChildren(node('p',error.name==='AbortError'?'Kết nối mất quá lâu. Vui lòng thử lại.':error.message),retry);
  }finally{clearTimeout(timeout);if(version===libraryGeneration)container.setAttribute('aria-busy','false');}
}
window.addEventListener('customer:section',event=>{
  if(event.detail.section==='digital')loadLibrary();
  else{libraryGeneration++;libraryController?.abort();}
});
window.addEventListener('customer:changed',()=>{
  libraryGeneration++;libraryController?.abort();$('#customer-digital-orders').replaceChildren();
  if(checkout.open&&buyerId!==session()?.id)checkout.close();
  if(session()?.id&&!$('#customer-digital-view').hidden)loadLibrary();
});
loadCatalog();
