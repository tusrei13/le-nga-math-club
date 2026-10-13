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
let orderStep = 1;
let activeBookGroup = '6';
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
  setOrderStep(orderStep);
  if (consulting && addressInput) clearFieldError(addressInput);
  if (submitLabel) submitLabel.textContent = consulting ? 'Gửi yêu cầu tư vấn' : 'Xác nhận đặt sách cho con';
  if (formStatus) {
    formStatus.textContent = '';
  }
}
modeInputs.forEach((input) => input.addEventListener('change', () => setFormMode(input.value)));
setFormMode(getMode());

function setOrderStep(step, focus = false) {
  orderStep = step;
  const consulting = getMode() === 'consult';
  const receiving = consulting || step === 2;
  const selection = document.querySelector('#book-selection');
  selection.hidden = consulting || receiving;
  selection.disabled = consulting;
  document.querySelector('#order-steps').hidden = consulting;
  document.querySelector('#order-receipt').hidden = consulting;
  document.querySelector('#order-next').hidden = receiving;
  document.querySelector('#order-contact-fields').hidden = !receiving;
  document.querySelector('#order-submit-actions').hidden = !receiving;
  document.querySelector('#order-back').hidden = consulting;
  document.querySelectorAll('[data-order-step]').forEach(button => {
    if (Number(button.dataset.orderStep) === step) button.setAttribute('aria-current', 'step');
    else button.removeAttribute('aria-current');
  });
  document.querySelector('#request-title').textContent = consulting ? 'Cùng tìm sách phù hợp' : receiving ? 'Sách sẽ đến tay con' : 'Phiếu chọn sách cho con';
  document.querySelector('#request-hint').textContent = consulting
    ? 'Để lại thông tin, CLB sẽ gọi tư vấn cho phụ huynh.'
    : receiving ? 'CLB sẽ gọi xác nhận trước khi gửi sách.' : 'Chọn đúng lớp. Thêm cuốn con cần.';
  if (focus) {
    if (receiving) document.querySelector('#field-name').focus({ preventScroll: true });
    else document.querySelector('[data-book-group][aria-pressed="true"]').focus({ preventScroll: true });
  }
}
function continueOrder() {
  if (!validBookSelection()) return;
  setOrderStep(2, true);
}
document.querySelector('#order-next').addEventListener('click', continueOrder);
document.querySelector('#order-back').addEventListener('click', () => setOrderStep(1, true));
document.querySelectorAll('[data-order-step]').forEach(button => button.addEventListener('click', () => {
  if (Number(button.dataset.orderStep) === 2) continueOrder();
  else setOrderStep(1, true);
}));
function setBookGroup(group) {
  activeBookGroup = group;
  document.querySelectorAll('[data-book-group]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.bookGroup === group)));
  document.querySelectorAll('[data-picker-group]').forEach(row => { row.hidden = row.dataset.pickerGroup !== group; });
  if (catalogLoaded) updateOrderArtwork();
}
document.querySelectorAll('[data-book-group]').forEach(button => button.addEventListener('click', () => setBookGroup(button.dataset.bookGroup)));

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
  window.addEventListener('landing:loaded', observeBottomContent);
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
  if (field.name === 'phone' && !/^0[35789]\d{8}$/.test(field.value.replace(/[\s().-]/g, '').replace(/^\+84/, '0').replace(/^84(?=\d{9}$)/, '0'))) {
    return 'Vui lòng nhập số điện thoại di động Việt Nam hợp lệ.';
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
let catalog = [];
let salesPolicy = { shipping_vnd: 0 };
let catalogLoaded = false;
let submitting = false;
let pendingRequest;
const currency = (value) => `${new Intl.NumberFormat('vi-VN').format(value)}đ`;
function selectedItems() {
  return [...document.querySelectorAll('[data-product-quantity]')]
    .filter(input => Number(input.value) > 0)
    .map(input => ({ product_id: input.dataset.productQuantity, quantity: Number(input.value) }));
}
function updateTotal() {
  const items = selectedItems();
  const subtotal = items.reduce((sum,item) => sum + catalog.find(p => p.id === item.product_id).price_vnd * item.quantity, 0);
  document.querySelector('#order-total').textContent = currency(subtotal + (items.length ? salesPolicy.shipping_vnd : 0));
  const count = items.reduce((sum,item) => sum + item.quantity, 0);
  document.querySelector('#selected-book-count').textContent = count ? `${count} cuốn` : 'Chưa chọn sách';
  const selected = document.querySelector('#selected-books');
  selected.replaceChildren();
  if (!items.length) selected.append(element('p', 'Cuốn sách đầu tiên đang chờ con.', 'receipt-empty'));
  for (const item of items) {
    const product = catalog.find(p => p.id === item.product_id);
    const row = element('div', undefined, 'receipt-item');
    row.append(element('span', `${product.title} × ${item.quantity}`), element('strong', currency(product.price_vnd * item.quantity)));
    const remove = element('button', '×', 'receipt-remove'); remove.type = 'button'; remove.setAttribute('aria-label', `Bỏ ${product.title}`);
    remove.addEventListener('click', () => {
      const input = document.querySelector(`[data-product-quantity="${product.id}"]`);
      input.value = '0'; updateTotal();
      if (!selectedItems().length && getMode() === 'order') setOrderStep(1);
      const nextRemove = selected.querySelector('button');
      if (nextRemove) nextRemove.focus({ preventScroll: true });
      else document.querySelector('[data-book-group][aria-pressed="true"]').focus({ preventScroll: true });
    });
    row.append(remove); selected.append(row);
  }
  document.querySelectorAll('[data-picker-group]').forEach(row => {
    const input = row.querySelector('[data-product-quantity]');
    const quantity = Number(input.value);
    row.classList.toggle('is-selected', quantity > 0);
    row.querySelector('[data-quantity-decrease]').disabled = quantity <= 0;
    row.querySelector('[data-quantity-increase]').disabled = quantity >= 20;
  });
  updateOrderArtwork();
  const error = document.querySelector('#items-error');
  error.hidden = true;
}
function updateOrderArtwork() {
  const chosen = selectedItems().map(item => catalog.find(p => p.id === item.product_id));
  const group = catalog.filter(p => (p.category === 'thi-vao-6' ? 'entrance' : String(p.grade)) === activeBookGroup);
  const books = [...chosen, ...group.filter(p => !chosen.some(c => c.id === p.id))].slice(0,2);
  document.querySelectorAll('.order-book-display img').forEach((image,index) => {
    const cover = books[index]?.media.find(m => m.kind === 'cover');
    image.hidden = !cover;
    if (cover) image.src = cover.url;
  });
}
function validBookSelection() {
  const items = selectedItems();
  if (catalogLoaded && items.length && [...document.querySelectorAll('[data-product-quantity]')].every(input => input.validity.valid)) return true;
  const error = document.querySelector('#items-error');
  error.textContent = !catalogLoaded ? 'Vui lòng tải lại danh mục trước khi đặt sách.' : 'Chọn ít nhất một cuốn, số lượng mỗi cuốn từ 1 đến 20.';
  error.hidden = false;
  error.scrollIntoView({ behavior: motionPreference.matches ? 'instant' : 'smooth', block: 'nearest' });
  return false;
}
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
async function loadLanding() {
  try {
    const response = await fetch('/api/landing', { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Không thể tải dữ liệu sách.');
    const data = await response.json();
    catalog = data.products;
    salesPolicy = data.content.sales_policy;
    const cards = document.querySelector('#book-catalog');
    const options = document.querySelector('#book-options');
    cards.replaceChildren(); options.replaceChildren();
    for (const [index, product] of catalog.entries()) {
      const card = element('article', undefined, 'book-card');
      const meta = element('div', undefined, 'book-meta');
      meta.append(element('span', `${String(index + 1).padStart(2,'0')} / ${product.category === 'phan-dang' ? 'PHÂN DẠNG' : 'THI VÀO 6'}`), element('span', `LỚP ${product.grade}`));
      const cover = product.media.find(media => media.kind === 'cover');
      const art = element('div', undefined, 'product-cover');
      if (cover) {
        const image = element('img'); image.src = cover.url; image.alt = cover.alt || product.title; image.loading = 'lazy';
        image.addEventListener('error', () => art.replaceChildren(element('p', product.title)), { once: true });
        art.append(image);
      } else art.append(element('p', product.title));
      const copy = element('div', undefined, 'book-card-copy');
      copy.append(element('h3', product.title), element('p', product.description), element('strong', currency(product.price_vnd), 'product-price'));
      const choose = element('button', 'Chọn cuốn này', 'text-link'); choose.type = 'button';
      choose.addEventListener('click', () => {
        const quantity = document.querySelector(`[data-product-quantity="${product.id}"]`);
        setBookGroup(product.category === 'thi-vao-6' ? 'entrance' : String(product.grade));
        quantity.value = Math.min(20, Number(quantity.value) + 1); updateTotal(); orderStep = 1; openForm('order');
        quantity.focus({ preventScroll: true });
      });
      copy.append(choose); card.append(meta, art, copy); cards.append(card);
      const option = element('div', undefined, 'book-option');
      option.dataset.pickerGroup = product.category === 'thi-vao-6' ? 'entrance' : String(product.grade);
      const thumbnail = element('img'); thumbnail.alt = ''; thumbnail.loading = 'lazy';
      if (cover) thumbnail.src = cover.url; else thumbnail.hidden = true;
      thumbnail.addEventListener('error', () => { thumbnail.hidden = true; }, { once: true });
      const info = element('div', undefined, 'book-option-info');
      info.append(element('h4', product.title),element('span', currency(product.price_vnd)));
      const controls = element('div', undefined, 'book-quantity');
      const decrease = element('button', '−'); decrease.type = 'button'; decrease.dataset.quantityDecrease = ''; decrease.setAttribute('aria-label', `Giảm số lượng ${product.title}`);
      const increase = element('button', '+'); increase.type = 'button'; increase.dataset.quantityIncrease = ''; increase.setAttribute('aria-label', `Thêm ${product.title}`);
      const quantity = element('input'); quantity.type = 'number'; quantity.min = '0'; quantity.max = '20'; quantity.step = '1'; quantity.defaultValue = '0';
      quantity.dataset.productQuantity = product.id; quantity.setAttribute('aria-label', `Số lượng ${product.title}`);
      quantity.addEventListener('input', updateTotal);
      quantity.addEventListener('change', () => { quantity.value = String(Math.min(20, Math.max(0, Math.floor(Number(quantity.value) || 0)))); updateTotal(); });
      decrease.addEventListener('click', () => { quantity.value = Math.max(0, Number(quantity.value) - 1); updateTotal(); });
      increase.addEventListener('click', () => { quantity.value = Math.min(20, Number(quantity.value) + 1); updateTotal(); });
      controls.append(decrease,quantity,increase); option.append(thumbnail,info,controls); options.append(option);
    }
    setBookGroup(activeBookGroup);
    if (catalog.length) {
      const minimum = Math.min(...catalog.map(p => p.price_vnd));
      for (const id of ['catalog-min-price', 'hero-book-price', 'floating-book-price']) document.getElementById(id).textContent = `Từ ${currency(minimum)}`;
    }
    const faqList = document.querySelector('.faq-list'); faqList.replaceChildren();
    for (const [index, faq] of data.faqs.entries()) {
      const details = element('details'); details.open = index === 0;
      const summary = element('summary', faq.question); summary.append(element('span', '+'));
      details.append(summary, element('p', faq.answer)); faqList.append(details);
    }
    const giftList = document.querySelector('.gift-list'); giftList.replaceChildren();
    for (const [index, gift] of data.gifts.entries()) {
      const article = element('article', undefined, 'gift-item');
      const illustration = element('div', undefined, `gift-illustration ${gift.kind === 'video' ? 'video-illus' : gift.kind === 'community' ? 'zalo-illus' : 'test-illus'}`);
      illustration.append(element('span', gift.kind === 'video' ? '▶' : gift.kind === 'community' ? 'z' : '✓'));
      const copy = element('div'); copy.append(element('h3', `${String(index+1).padStart(2,'0')} ${gift.title}`), element('p', gift.description));
      article.append(illustration,copy); giftList.append(article);
    }
    document.querySelector('.proof-section').hidden = !data.testimonials.length && !data.achievements.length;
    const testimonials = document.querySelector('.testimonial-stack'); testimonials.replaceChildren();
    for (const item of data.testimonials) {
      const article = element('article', undefined, 'testimonial');
      const footer = element('footer'); footer.append(element('strong',item.display_name),element('span',item.context));
      article.append(element('span','“','quote-mark'),element('p',item.quote),footer); testimonials.append(article);
    }
    const wall = document.querySelector('.score-wall'); wall.querySelectorAll('.score-row').forEach(row => row.remove());
    for (const item of data.achievements) {
      const row = element('div', undefined, 'score-row'); const copy = element('div');
      copy.append(element('b',item.title),element('small',item.description)); row.append(element('strong',item.metric),copy,element('span','✳','score-star'));
      wall.insertBefore(row,wall.querySelector('.score-wall-foot'));
    }
    const author = data.content.author;
    document.querySelector('.author-photo').src = author.photo_url;
    document.querySelector('.portrait-caption strong').textContent = author.name;
    const credentials = document.querySelectorAll('.credentials>div');
    credentials[0].querySelector('small').textContent = author.qualification;
    credentials[1].querySelector('strong').textContent = `${author.experience_years} năm`;
    document.querySelector('.trust-row>div:first-child strong').textContent = author.experience_years;
    const quote = document.querySelector('.author-quote'); quote.replaceChildren(document.createTextNode(`“${author.quote}”`),element('cite',`— ${author.name}`));
    document.querySelector('.hero-deck').textContent = data.content.hero.description;
    const heroTitle = document.querySelector('.hero-title');
    if (heroTitle.textContent.replace(/\s+/g,' ').trim() !== data.content.hero.title) heroTitle.textContent = data.content.hero.title;
    heroTitle.setAttribute('aria-label',data.content.hero.title);
    document.querySelector('.hero-art-image').src = data.content.hero.illustration_url;
    const contact = data.content.contact;
    document.querySelectorAll('a[href^="tel:"]').forEach(a => { a.href = `tel:${contact.phone}`; a.textContent = contact.phone_display; });
    document.querySelector('.order-contact small').textContent = contact.email;
    document.querySelector('a[href^="mailto:"]').href = `mailto:${contact.email}`;
    document.querySelector('a[href^="mailto:"]').textContent = contact.email;
    document.querySelector('.footer-links>div:nth-child(2) p').textContent = contact.address;
    document.querySelector('.footer-links a[href*="facebook.com"]').href = contact.facebook;
    document.querySelector('.footer-links a[href*="youtube.com"]').href = contact.youtube;
    document.querySelector('#shipping-label').textContent = salesPolicy.shipping_vnd ? `Phí giao hàng ${currency(salesPolicy.shipping_vnd)} · COD` : 'FREESHIP COD';
    document.querySelector('.hero-offer>span').textContent = `${salesPolicy.gifts_with_order ? `+ ${data.gifts.length} quà tặng · ` : ''}${salesPolicy.shipping_vnd ? `Phí giao hàng ${currency(salesPolicy.shipping_vnd)}` : 'Freeship'} COD toàn quốc`;
    document.querySelector('.gift-price strong').textContent = salesPolicy.gifts_with_order ? `${data.gifts.length} quà tặng` : 'Liên hệ CLB';
    document.querySelector('.catalog-facts>div:last-child span').textContent = salesPolicy.shipping_vnd ? `Phí giao hàng ${currency(salesPolicy.shipping_vnd)}` : 'freeship toàn quốc';
    document.querySelector('.promise-list p:nth-child(2)').replaceChildren(element('span','✓'),document.createTextNode(salesPolicy.shipping_vnd ? ` Phí giao hàng ${currency(salesPolicy.shipping_vnd)} qua COD` : ' Freeship toàn quốc qua COD'));
    document.querySelector('.promise-list p:nth-child(3)').replaceChildren(element('span','✓'),document.createTextNode(` Đổi trả miễn phí ${salesPolicy.return_days} ngày nếu lỗi nhà in`));
    catalogLoaded = true;
    updateTotal();
    window.dispatchEvent(new Event('landing:loaded'));
  } catch (error) {
    const retry = element('button', 'Tải lại danh mục', 'text-link'); retry.type = 'button'; retry.addEventListener('click', loadLanding);
    document.querySelector('#book-catalog').replaceChildren(element('p', 'Không tải được sách. Vui lòng thử lại hoặc gọi hotline.'),retry);
    document.querySelector('#book-options').textContent = 'Danh mục chưa tải được. Bạn vẫn có thể gửi yêu cầu tư vấn.';
  }
}
loadLanding();
orderForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (submitting) return;
  if (getMode() === 'order' && orderStep === 1) { continueOrder(); return; }
  formStatus.textContent = '';
  if (getMode() === 'order' && !validBookSelection()) { setOrderStep(1, true); return; }
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
  const items = selectedItems();
  const values = Object.fromEntries(new FormData(orderForm));
  const payload = { name: values.name, phone: values.phone, grade: Number(values.grade.replace('Lớp ','')), note: values.note };
  if (mode === 'order') { payload.address = values.address; payload.items = items; }
  const fingerprint = JSON.stringify({ mode, payload, customer: window.customerSession?.id || null });
  if (!pendingRequest || pendingRequest.fingerprint !== fingerprint) pendingRequest = { fingerprint, key: Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2,'0')).join('') };
  const button = orderForm.querySelector('[type="submit"]');
  submitting = true; button.disabled = true; orderForm.setAttribute('aria-busy','true');
  formStatus.textContent = 'Đang gửi thông tin…';
  try {
    const customerToken = mode === 'order' ? await window.customerSession?.getToken() : null;
    const response = await fetch(mode === 'order' ? '/api/orders' : '/api/consultations', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': pendingRequest.key, ...(customerToken ? {Authorization: 'Bearer ' + customerToken} : {}) },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(15000),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Không thể gửi thông tin.');
    pendingRequest = undefined;
    orderForm.reset(); orderStep = 1; setFormMode(mode); updateTotal();
    formStatus.textContent = mode === 'consult'
      ? `Đã lưu yêu cầu tư vấn ${result.id}. CLB sẽ gọi lại trong thời gian sớm nhất.`
      : `Đã lưu đơn ${result.id}, tổng tiền ${currency(result.total_vnd)}, thanh toán COD. CLB sẽ gọi lại xác nhận.`;
  } catch (error) {
    formStatus.textContent = error.name === 'TimeoutError' || error.name === 'TypeError'
      ? 'Chưa nhận được xác nhận từ máy chủ. Vui lòng thử gửi lại; thông tin bạn nhập vẫn được giữ.'
      : error.message;
  } finally { submitting = false; button.disabled = false; orderForm.removeAttribute('aria-busy'); }
});
const year = document.querySelector('#year');
if (year) year.textContent = new Date().getFullYear();

