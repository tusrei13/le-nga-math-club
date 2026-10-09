const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
const mobileNavigation = window.matchMedia('(max-width: 900px)');
const menuToggle = document.querySelector('.menu-toggle');
const siteNav = document.querySelector('.site-nav');
const floatingOrder = document.querySelector('#floating-order');
const orderSection = document.querySelector('#dat-sach');
const orderPanel = document.querySelector('#order-panel');
const orderForm = document.querySelector('#order-form');
const formStatus = document.querySelector('#form-status');
const addressField = orderForm?.querySelector('.address-field');
const addressInput = orderForm?.querySelector('[name="address"]');
const modeInputs = [...document.querySelectorAll('[name="request_mode"]')];
const submitLabel = document.querySelector('#submit-label');
const visibility = { hero: true, order: false, footer: false };
const visibleActions = new Set();
const overlappingContent = new Set();

const floatingBody = document.querySelector('#floating-body');
const floatingToggle = document.querySelector('.floating-toggle');
floatingToggle?.addEventListener('click', () => {
  const collapsed = floatingOrder.classList.toggle('is-collapsed');
  floatingBody.hidden = collapsed;
  floatingBody.inert = collapsed;
  floatingToggle.setAttribute('aria-expanded', String(!collapsed));
  floatingToggle.setAttribute('aria-label', collapsed ? 'Mở lại thanh mua sách' : 'Thu gọn thanh mua sách');
  floatingToggle.querySelector('span').textContent = collapsed ? 'Mua sách' : '−';
});

function updateFloatingOrder() {
  if (!floatingOrder) return;
  const active = document.activeElement;
  const interacting = active?.matches('input, select, textarea, summary, button, a')
    && !floatingOrder.contains(active);
  const visible = !visibility.hero && !visibility.order && !visibility.footer
    && !interacting && visibleActions.size === 0 && overlappingContent.size === 0
    && !siteNav?.classList.contains('is-open');
  floatingOrder.hidden = !visible;
  floatingOrder.inert = !visible;
  floatingOrder.setAttribute('aria-hidden', String(!visible));
}

function setMenu(open, returnFocus = false) {
  siteNav?.classList.toggle('is-open', open);
  menuToggle?.setAttribute('aria-expanded', String(open));
  menuToggle?.setAttribute('aria-label', open ? 'Đóng menu' : 'Mở menu');
  if (siteNav) siteNav.inert = mobileNavigation.matches && !open;
  if (returnFocus) menuToggle?.focus();
  updateFloatingOrder();
}
menuToggle?.addEventListener('click', () => setMenu(!siteNav.classList.contains('is-open')));
siteNav?.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => setMenu(false)));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && siteNav?.classList.contains('is-open')) setMenu(false, true);
});
document.addEventListener('click', (event) => {
  if (!event.target.closest('.site-header') && siteNav?.classList.contains('is-open')) setMenu(false);
});
mobileNavigation.addEventListener('change', () => setMenu(false));
setMenu(false);

function getMode() {
  return modeInputs.find((input) => input.checked)?.value || 'order';
}
function setFormMode(mode) {
  const consulting = mode === 'consult';
  modeInputs.forEach((input) => { input.checked = input.value === (consulting ? 'consult' : 'order'); });
  if (addressField) addressField.hidden = consulting;
  if (addressInput) {
    addressInput.required = !consulting;
    addressInput.disabled = consulting;
  }
  orderPanel?.classList.toggle('is-consult', consulting);
  const title = document.querySelector('#request-title');
  const hint = document.querySelector('#request-hint');
  if (title) title.textContent = consulting ? 'Nhận tư vấn cho con' : 'Đặt trọn bộ sách';
  if (hint) hint.textContent = consulting
    ? 'CLB sẽ gọi lại tư vấn bộ sách phù hợp với lớp của con.'
    : 'CLB sẽ gọi lại xác nhận thông tin nhận sách.';
  const offerDetails = document.querySelector('.offer-details');
  if (offerDetails) offerDetails.open = !consulting;
  if (consulting && addressInput) clearFieldError(addressInput);
  if (submitLabel) submitLabel.textContent = consulting ? 'Gửi yêu cầu tư vấn' : 'Xác nhận đặt sách cho con';
  if (formStatus) {
    formStatus.textContent = '';
  }
}
modeInputs.forEach((input) => input.addEventListener('change', () => setFormMode(input.value)));
setFormMode(getMode());

function openForm(mode, updateHash = true) {
  setFormMode(mode);
  setMenu(false);
  // Hide immediately, before scrolling and before IntersectionObserver fires.
  visibility.order = true;
  updateFloatingOrder();
  if (updateHash && window.location.hash !== '#dat-sach') history.pushState(null, '', '#dat-sach');
  orderPanel?.focus({ preventScroll: true });
  orderPanel?.scrollIntoView({ behavior: motionPreference.matches ? 'instant' : 'smooth', block: 'start' });
}
document.querySelectorAll('[data-form-mode]').forEach((link) => {
  link.addEventListener('click', (event) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    openForm(link.dataset.formMode);
  });
});
function syncHash() {
  if (window.location.hash === '#dat-sach') openForm('order', false);
}
window.addEventListener('hashchange', syncHash);
if (window.location.hash === '#dat-sach') requestAnimationFrame(syncHash);

if ('IntersectionObserver' in window) {
  const targets = [
    [document.querySelector('.hero'), 'hero'],
    [orderSection, 'order'],
    [document.querySelector('.site-footer'), 'footer'],
  ];
  const stickyObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const match = targets.find(([target]) => target === entry.target);
      if (match) visibility[match[1]] = entry.isIntersecting;
    });
    updateFloatingOrder();
  }, { threshold: 0, rootMargin: '0px 0px 100px 0px' });
  targets.forEach(([target]) => { if (target) stickyObserver.observe(target); });
  // Keep purchase controls and FAQ clear, including just before they enter view.
  const actionObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) visibleActions.add(entry.target);
      else visibleActions.delete(entry.target);
    });
    updateFloatingOrder();
  }, { threshold: 0, rootMargin: '0px 0px 100px 0px' });
  document.querySelectorAll('.catalog-foot, .arrow-link, .faq-list')
    .forEach((target) => actionObserver.observe(target));
  // Watch the bottom safety area independently of the bar's hidden state.
  // The bar can appear over whitespace or artwork, but never over reading text.
  let contentObserver;
  function observeBottomContent() {
    contentObserver?.disconnect();
    overlappingContent.clear();
    const topInset = Math.max(0, window.innerHeight - 100);
    contentObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) overlappingContent.add(entry.target);
        else overlappingContent.delete(entry.target);
      });
      updateFloatingOrder();
    }, { threshold: 0, rootMargin: `-${topInset}px 0px 0px 0px` });
    document.querySelectorAll('main h2, main h3, main p, main a, main button, main summary, main label, .catalog-facts, .book-meta, .book-tag, .credentials, .portrait-caption, .gift-price, .score-row, .score-wall-head, .score-wall-foot, .testimonial footer, .solution-note li')
      .forEach((target) => contentObserver.observe(target));
    updateFloatingOrder();
  }
  observeBottomContent();
  window.addEventListener('resize', observeBottomContent);
} else if (floatingOrder) {
  floatingOrder.hidden = true;
  floatingOrder.inert = true;
}
document.addEventListener('focusin', updateFloatingOrder);
document.addEventListener('focusout', () => requestAnimationFrame(updateFloatingOrder));

// Native validation remains available if JavaScript fails to load.
// With JavaScript, inline errors replace browser bubbles and preserve entered values.
const validatedFields = orderForm
  ? ['name', 'phone', 'grade', 'address'].map((name) => orderForm.elements.namedItem(name))
  : [];
function fieldError(field) {
  if (field.disabled) return '';
  if (field.required && !field.value.trim()) {
    return {
      name: 'Vui lòng nhập họ tên phụ huynh.',
      phone: 'Vui lòng nhập số điện thoại để CLB liên hệ.',
      grade: 'Vui lòng chọn lớp hiện tại của con.',
      address: 'Vui lòng nhập địa chỉ nhận sách.',
    }[field.name];
  }
  if (field.name === 'phone' && field.value.replace(/\D/g, '').length < 9) {
    return 'Vui lòng kiểm tra lại số điện thoại (ít nhất 9 chữ số).';
  }
  return '';
}
function clearFieldError(field) {
  const error = document.querySelector(`#${field.name}-error`);
  if (error) { error.textContent = ''; error.hidden = true; }
  field.removeAttribute('aria-invalid');
  const descriptions = (field.getAttribute('aria-describedby') || '').split(' ')
    .filter((id) => id && id !== `${field.name}-error`);
  if (descriptions.length) field.setAttribute('aria-describedby', descriptions.join(' '));
  else field.removeAttribute('aria-describedby');
}
function showFieldError(field, message) {
  if (!message) { clearFieldError(field); return; }
  const error = document.querySelector(`#${field.name}-error`);
  error.textContent = message;
  error.hidden = false;
  field.setAttribute('aria-invalid', 'true');
  const descriptions = new Set((field.getAttribute('aria-describedby') || '').split(' ').filter(Boolean));
  descriptions.add(error.id);
  field.setAttribute('aria-describedby', [...descriptions].join(' '));
}
if (orderForm) orderForm.noValidate = true;
validatedFields.forEach((field) => {
  const onEdit = () => {
    if (field.hasAttribute('aria-invalid')) showFieldError(field, fieldError(field));
    if (formStatus) formStatus.textContent = '';
  };
  field.addEventListener('input', onEdit);
  field.addEventListener('change', onEdit);
});
orderForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  formStatus.textContent = '';
  let firstInvalid;
  validatedFields.forEach((field) => {
    const message = fieldError(field);
    showFieldError(field, message);
    if (message && !firstInvalid) firstInvalid = field;
  });
  if (firstInvalid) {
    firstInvalid.focus({ preventScroll: true });
    firstInvalid.closest('label').scrollIntoView({
      behavior: motionPreference.matches ? 'instant' : 'smooth', block: 'center',
    });
    return;
  }
  const mode = getMode();
  orderForm.reset();
  setFormMode(mode);
  formStatus.textContent = mode === 'consult'
    ? 'Đã nhận yêu cầu tư vấn. CLB sẽ gọi lại tư vấn bộ sách phù hợp với lớp của con trong thời gian sớm nhất.'
    : 'Đã nhận thông tin — CLB sẽ gọi lại xác nhận đơn trong thời gian sớm nhất.';
});
const year = document.querySelector('#year');
if (year) year.textContent = new Date().getFullYear();

