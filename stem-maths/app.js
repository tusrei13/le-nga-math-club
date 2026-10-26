const $=selector=>document.querySelector(selector);
const form=$('#enquiry-form');
let programs=[],grade=6,level='basic',specialist=false,busy=false,pending;
const menu=$('#main-nav'),toggle=$('.menu-toggle');
function closeMenu(){menu.classList.remove('is-open');toggle.setAttribute('aria-expanded','false');}
toggle.addEventListener('click',()=>{const open=menu.classList.toggle('is-open');toggle.setAttribute('aria-expanded',String(open));});
menu.querySelectorAll('a').forEach(link=>link.addEventListener('click',closeMenu));
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&menu.classList.contains('is-open')){closeMenu();toggle.focus();}});
const desktopNavigation=matchMedia('(min-width:1024px)');
desktopNavigation.addEventListener('change',event=>{
  if(!event.matches)return;
  const toggleHadFocus=document.activeElement===toggle;
  closeMenu();
  if(toggleHadFocus)menu.querySelector('a').focus({preventScroll:true});
});
document.addEventListener('click',event=>{if(!event.target.closest('.site-header'))closeMenu();});
function render(){
  if(grade<6)specialist=false;
  document.querySelectorAll('[data-grade]').forEach(button=>{button.setAttribute('aria-pressed',String(Number(button.dataset.grade)===grade));button.setAttribute('aria-label',`Lớp ${button.dataset.grade}`);});
  document.querySelectorAll('[name=level]').forEach(input=>{if(input.type==='radio')input.checked=input.value===level;});
  $('#specialist-choice').hidden=grade<6;$('#specialist-goal').checked=specialist;
  form.elements.grade.value=String(grade);form.elements.level.value=level;form.elements.specialist_goal.checked=specialist;
  form.elements.specialist_goal.disabled=grade<6;$('#form-specialist-label').hidden=grade<6;
  const program=programs.find(item=>item.grade===grade&&item.level===level);
  $('#program-grade').textContent=`Lớp ${grade} · Học trực tiếp`;
  $('#program-title').textContent=program?.title||'Chưa tải được chương trình';
  $('#program-description').textContent=program?.description||'Vui lòng tải lại danh mục hoặc liên hệ CLB qua hotline.';
  $('#specialist-note').hidden=!specialist;
  $('#chosen-program').textContent=program?program.title+(specialist?' · Định hướng thi chuyên':''):'Vui lòng tải lại chương trình';
  $('#choose-program').setAttribute('aria-disabled',String(!program));$('#enquiry-submit').disabled=busy||!program;
}
async function loadPrograms(){
  $('#program-retry').hidden=true;
  try{const response=await fetch('/api/stem/programs',{signal:AbortSignal.timeout(12000)});const data=await response.json();if(!response.ok||!Array.isArray(data.programs)||!data.programs.length)throw new Error();programs=data.programs;}
  catch{programs=[];$('#program-retry').hidden=false;}
  render();
}
$('#program-retry').addEventListener('click',loadPrograms);
document.querySelectorAll('[data-grade]').forEach(button=>button.addEventListener('click',()=>{grade=Number(button.dataset.grade);render();}));
document.querySelectorAll('input[name=level]').forEach(input=>input.addEventListener('change',()=>{level=input.value;render();}));
$('#specialist-goal').addEventListener('change',event=>{specialist=event.target.checked;render();});
form.elements.grade.addEventListener('change',event=>{grade=Number(event.target.value);render();});
form.elements.level.addEventListener('change',event=>{level=event.target.value;render();});
form.elements.specialist_goal.addEventListener('change',event=>{specialist=event.target.checked;render();});
$('#choose-program').addEventListener('click',event=>{if($('#choose-program').getAttribute('aria-disabled')==='true'){event.preventDefault();$('#program-retry').focus();return;}requestAnimationFrame(()=>form.elements.name.focus({preventScroll:true}));});
form.addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;
  const program=programs.find(item=>item.grade===grade&&item.level===level);if(!program)return;
  const payload={name:form.elements.name.value.trim(),phone:form.elements.phone.value.trim(),grade,level,specialist_goal:specialist,note:form.elements.note.value.trim(),consent:form.elements.consent.checked,website:form.elements.website.value};
  const fingerprint=JSON.stringify(payload);if(!pending||pending.fingerprint!==fingerprint)pending={fingerprint,key:crypto.randomUUID()};
  busy=true;$('#enquiry-submit').disabled=true;form.setAttribute('aria-busy','true');$('#enquiry-status').textContent='Đang gửi yêu cầu…';
  try{
    const response=await fetch('/api/stem/enquiries',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':pending.key},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
    const result=await response.json();if(!response.ok)throw new Error(result.error||'Chưa gửi được yêu cầu.');
    pending=undefined;form.reset();render();$('#enquiry-status').textContent=`Đã nhận yêu cầu ${result.id}. CLB sẽ liên hệ để trao đổi chương trình và xếp lớp. Đây chưa phải xác nhận nhập học.`;
  }catch(error){$('#enquiry-status').textContent=['TimeoutError','TypeError','AbortError'].includes(error.name)?'Chưa nhận được xác nhận. Bạn có thể gửi lại; thông tin đã nhập vẫn được giữ.':error.message;}
  finally{busy=false;form.removeAttribute('aria-busy');$('#enquiry-submit').disabled=!programs.length;}
});
loadPrograms();
