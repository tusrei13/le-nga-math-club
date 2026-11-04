export function setupDigitalManagement({request,element,isAuthenticated}){
  const panel=document.querySelector('#digital-management'),container=document.querySelector('#digital-management-content');
  let generation=0;
  async function load(){
    const version=++generation;container.replaceChildren(element('p','Đang tải bản đọc thử…'));
    try{
      const data=await request('/api/admin/digital-products');if(version!==generation||!isAuthenticated())return;
      container.replaceChildren(element('h3','Bản đọc thử công khai'),element('p','Các PDF này mở miễn phí, không cần tài khoản hoặc thanh toán. Đơn tài liệu cũ chỉ được giữ để tra cứu và hủy/thu hồi; không nhận tiền mới.','digital-admin-note'));
      for(const p of data.products){
        const item=element('details',undefined,'digital-admin-product');item.append(element('summary',p.title));
        const links=element('div',undefined,'digital-admin-form');
        for(const file of p.files){const link=element('a',file.label);link.href=file.url;link.target='_blank';link.rel='noopener noreferrer';links.append(link);}
        item.append(links);container.append(item);
      }
    }catch(error){if(version===generation&&isAuthenticated())container.replaceChildren(element('p',error.message,'message'));}
  }
  panel.addEventListener('toggle',()=>{if(panel.open)load();});
  return {clear(){generation++;panel.open=false;container.replaceChildren();}};
}
