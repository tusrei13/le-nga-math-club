export function setupDigitalManagement({request,element,currency,isAuthenticated}){
  const panel=document.querySelector('#digital-management'),container=document.querySelector('#digital-management-content');
  let generation=0;
  const field=(form,label,value,{type='text',maxLength=200,rows}={})=>{
    const wrapper=element('label',label),input=element(rows?'textarea':'input');
    if(!rows)input.type=type;else input.rows=rows;
    if(type==='checkbox')input.checked=Boolean(value);else input.value=value??'';
    input.maxLength=maxLength;wrapper.append(input);form.append(wrapper);return input;
  };
  function settingsForm(settings){
    const form=element('form',undefined,'digital-admin-form'),title=element('h3','Nhận chuyển khoản');
    form.append(title,element('p',settings.storage_configured?'Kho Supabase đã có cấu hình khóa phía máy chủ.':'Chưa kết nối kho: thêm SUPABASE_SECRET_KEY trong Cloudflare Secrets theo DIGITAL-DOCUMENTS.md.','digital-admin-note'));
    const bank=field(form,'Ngân hàng',settings.bank_name,{maxLength:100}),number=field(form,'Số tài khoản',settings.account_number,{maxLength:34}),holder=field(form,'Tên chủ tài khoản',settings.account_holder,{maxLength:120}),instructions=field(form,'Hướng dẫn cho người mua',settings.instructions,{rows:3,maxLength:1000});
    const accept=field(form,'Mở nhận đơn tài liệu',settings.accept_orders,{type:'checkbox'});
    form.append(element('p','Điền thông tin nhận tiền thật. Tài liệu chỉ mở bán sau khi bỏ trạng thái bản nháp và kiểm tra được file trong Supabase.','digital-admin-note'));
    const button=element('button','Lưu thông tin thanh toán','primary-button'),message=element('p',undefined,'message');button.type='submit';message.setAttribute('role','status');form.append(button,message);
    form.addEventListener('submit',async event=>{
      event.preventDefault();button.disabled=true;message.textContent='Đang lưu…';
      try{await request('/api/admin/digital-settings',{method:'PATCH',data:{expected_version:settings.version,bank_name:bank.value,account_number:number.value,account_holder:holder.value,instructions:instructions.value,accept_orders:accept.checked}});if(isAuthenticated())await load();}
      catch(error){message.textContent=error.message;}finally{button.disabled=false;}
    });return form;
  }
  function productForm(product){
    const details=element('details',undefined,'digital-admin-product'),summary=element('summary',product.title+' · '+currency(product.price_vnd)+(product.is_draft?' · Bản nháp':''));
    const form=element('form',undefined,'digital-admin-form');details.append(summary,form);
    const title=field(form,'Tên bộ tài liệu',product.title,{maxLength:200}),description=field(form,'Mô tả',product.description,{rows:3,maxLength:2000}),price=field(form,'Giá bán trọn bộ (VND)',product.price_vnd,{type:'number'});
    price.min='1000';price.max='100000000';price.step='1000';price.required=true;title.required=true;description.required=true;
    const active=field(form,'Hiển thị trong danh mục',product.active,{type:'checkbox'}),draft=field(form,'Bản nháp: giá dự kiến, chưa nhận đặt mua',product.is_draft,{type:'checkbox'});
    form.append(element('p','Giá ban đầu là dữ liệu tạm. Kiểm tra giá và nội dung trước khi mở bán. Khi bỏ bản nháp, máy chủ sẽ kiểm tra từng file trong bucket paid-documents.','digital-admin-note'));
    const files=product.files.map(file=>{
      const group=element('fieldset');group.append(element('legend',file.label));
      const label=field(group,'Tên hiển thị khi tải',file.label,{maxLength:120}),key=field(group,'Đường dẫn trong bucket',file.object_key,{maxLength:800});key.required=true;label.required=true;
      form.append(group);return {id:file.id,label,key};
    });
    const button=element('button','Lưu bộ tài liệu','primary-button'),message=element('p',undefined,'message');button.type='submit';message.setAttribute('role','status');form.append(button,message);
    form.addEventListener('submit',async event=>{
      event.preventDefault();button.disabled=true;message.textContent='Đang lưu và kiểm tra file…';
      try{
        await request('/api/admin/digital-products/'+product.id,{method:'PATCH',data:{expected_version:product.version,title:title.value,description:description.value,price_vnd:Number(price.value),active:active.checked,is_draft:draft.checked,files:files.map(f=>({id:f.id,label:f.label.value,object_key:f.key.value}))}});
        if(isAuthenticated())await load();
      }catch(error){message.textContent=error.message;}finally{button.disabled=false;}
    });return details;
  }
  async function load(){
    const version=++generation;container.replaceChildren(element('p','Đang tải cấu hình tài liệu…'));
    try{
      const [settings,data]=await Promise.all([request('/api/admin/digital-settings'),request('/api/admin/digital-products')]);
      if(version!==generation||!isAuthenticated())return;
      container.replaceChildren(settingsForm(settings),element('h3','Danh mục và file giao cho người mua'),...data.products.map(productForm));
    }catch(error){if(version===generation&&isAuthenticated())container.replaceChildren(element('p',error.message,'message'));}
  }
  panel.addEventListener('toggle',()=>{if(panel.open)load();});
  return {clear(){generation++;panel.open=false;container.replaceChildren();}};
}
