export function seed(db) {
  const insert = db.prepare(`INSERT OR IGNORE INTO products(id,slug,title,category,grade,volume,description,price_vnd,sort_order) VALUES(?,?,?,?,?,?,?,?,?)`);
  let position = 0;
  for (const grade of [6,7,8,9]) for (const volume of [1,2]) {
    const id = `toan-${grade}-tap-${volume}`;
    insert.run(id, `phan-dang-${id}`, `Phân dạng Toán ${grade} tập ${volume}`, 'phan-dang', grade, volume,
      `Hệ thống các dạng bài Toán lớp ${grade}, tập ${volume}; hỗ trợ học và luyện tập theo từng chủ đề.`, 299000, ++position);
  }
  insert.run('70-de-vao-6','70-de-but-toc-thi-vao-lop-6-clc','70 đề bứt tốc thi vào lớp 6 Chất lượng cao','thi-vao-6',5,null,
    'Luyện tập với 70 đề, dành cho học sinh chuẩn bị thi vào lớp 6 Chất lượng cao.',299000,++position);
  insert.run('200-bai-hinh-vao-6','200-bai-hinh-hoc-thi-vao-lop-6-clc','200 bài hình học thi vào lớp 6 Chất lượng cao','thi-vao-6',5,null,
    'Rèn kỹ năng giải bài hình học cho kỳ thi vào lớp 6 Chất lượng cao.',299000,++position);
  const cover = db.prepare(`INSERT OR IGNORE INTO product_media(product_id,kind,url,alt) VALUES(?,'cover',?,?)`);
  for (const grade of [6,7,8,9]) for (const volume of [1,2]) {
    cover.run(`toan-${grade}-tap-${volume}`, `/assets/books/${encodeURIComponent(`Phan dang toan lop${grade} t${volume}.png`)}`, `Bìa Phân dạng Toán ${grade} tập ${volume}`);
  }
  cover.run('70-de-vao-6','/assets/books/70_de_but_toc_thi_vao_lop_6_clc.jpg','Bìa 70 đề bứt tốc thi vào lớp 6 Chất lượng cao');
  cover.run('200-bai-hinh-vao-6','/assets/books/200_bai_hinh_hoc_thi_vao_lop_6_clc.jpg','Bìa 200 bài hình học thi vào lớp 6 Chất lượng cao');
  const media = db.prepare(`INSERT OR IGNORE INTO product_media(product_id,kind,url,alt) VALUES(?,'sample',?,?)`);
  for (const p of db.prepare('SELECT id,title FROM products').all()) media.run(p.id,'/assets/trang-mau-toan.pdf',`Trang mẫu minh họa chung; chưa phải trang mẫu riêng của ${p.title}`);
  const content = {
    contact: {phone:'0989066885',phone_display:'0989 066 885',email:'clbtoanconga@gmail.com',address:'Số 02, Lô A7, Khu A, Geleximco, Lê Trọng Tấn, An Khánh, Hà Nội.',facebook:'https://www.facebook.com/daytoanclc',youtube:'https://www.youtube.com/@vuihoactoan382'},
    author: {name:'Cô Lê Nga',photo_url:'/assets/teacher-le-nga.jpg',qualification:'',experience_years:0,quote:''},
    hero: {title:'Đồng hành cùng con bứt phá môn Toán.',description:'Giúp con lấy lại gốc, rèn tư duy và tự tin ôn thi HSG, trường Chất lượng cao, trường Chuyên.',illustration_url:'/assets/book-stack.png'},
    sales_policy: {shipping_vnd:0,payment_method:'cod',delivery_days:'',return_days:0,gifts_with_order:false,price_note:'299.000đ/cuốn. Phí vận chuyển được CLB xác nhận riêng.'}
  };
  const contentInsert = db.prepare('INSERT OR IGNORE INTO site_content(key,value_json) VALUES(?,?)');
  for (const [key,value] of Object.entries(content)) contentInsert.run(key,JSON.stringify(value));
  // Replace the original illustration while preserving edited hero copy and custom images.
  const currentHero = JSON.parse(db.prepare("SELECT value_json FROM site_content WHERE key='hero'").get().value_json);
  if (['/assets/book-stack.svg','public/assets/book-stack.svg'].includes(currentHero.illustration_url)) {
    currentHero.illustration_url = '/assets/book-stack.png';
    db.prepare("UPDATE site_content SET value_json=? WHERE key='hero'").run(JSON.stringify(currentHero));
  }
  const gift = db.prepare('INSERT OR IGNORE INTO gifts(id,title,description,kind,sort_order,active) VALUES(?,?,?,?,?,0)');
  gift.run('video','Khóa học Video','Hướng dẫn giải các dạng bài khó trong sách.','video',1);
  gift.run('zalo','Group Zalo giải đáp','Cộng đồng cùng đội ngũ trợ giảng CLB Cô Lê Nga.','community',2);
  gift.run('practice','Bộ đề thi thử','Đề HSG & đề thi vào trường CLC có đáp án chi tiết.','practice',3);
  const faq = db.prepare('INSERT OR IGNORE INTO faqs(id,question,answer,sort_order) VALUES(?,?,?,?)');
  faq.run('foundation','Con đang mất gốc có học theo sách được không?','Phụ huynh nên xem trang mẫu và liên hệ CLB để chọn sách phù hợp với kiến thức hiện tại của con.',1);
  faq.run('solutions','Sách có đáp án chi tiết không?','Vui lòng liên hệ CLB để xác nhận nội dung lời giải và tài liệu đi kèm của cuốn sách bạn chọn.',2);
  faq.run('delivery','Thời gian giao hàng mất bao lâu?','CLB sẽ xác nhận phí vận chuyển và thời gian giao theo địa chỉ nhận sách trước khi gửi đơn.',3);
  const testimonial = db.prepare('INSERT OR IGNORE INTO testimonials(id,quote,display_name,context,published,sort_order) VALUES(?,?,?,?,0,?)');
  testimonial.run('parent-5','Trước đây con rất ngại bài khó. Sau khi học theo từng dạng, con bắt đầu biết tự vẽ sơ đồ và giải thích lại cho mẹ.','Phụ huynh học sinh lớp 5','Hà Nội · lớp 5 · chia sẻ ẩn danh',1);
  testimonial.run('parent-8','Điều mình thích nhất là sách không chỉ đưa đáp án, mà chỉ cho con cách nhìn để lần sau tự làm được.','Phụ huynh học sinh lớp 8','Hà Nội · lớp 8 · chia sẻ ẩn danh',2);
  const achievement = db.prepare('INSERT OR IGNORE INTO achievements(id,metric,title,description,published,sort_order) VALUES(?,?,?,?,0,?)');
  achievement.run('math-85','8.5+','Mốc điểm Toán lớp 6–9','Ghi nhận từ chia sẻ phụ huynh/học viên',1);
  achievement.run('math-90','9.0+','Điểm Toán nổi bật','Những bước tiến sau khi học có lộ trình',2);
  achievement.run('clc','CLC','Trường Chuyên / Chất lượng cao','Mục tiêu có lộ trình để chạm tới',3);
}
