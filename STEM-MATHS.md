# STEM Maths: lớp học tại CLB (lớp 3–9)

Từ tháng 11/2026 STEM Maths không còn là website riêng. Phần "Lớp học tại CLB" nằm trong trang chính của CLB, cùng một trang với sách và tài liệu. Chỉ còn **một** project Cloudflare Pages (`le-nga-books`) và một lệnh build (`npm run build:pages`).

Hướng dẫn bảo mật, URL Production/Preview, thu hồi phiên admin và kiểm tra dependency: [SECURITY.md](SECURITY.md).

## Cấu trúc trang

| Mục | id | Nội dung |
| --- | --- | --- |
| Hai lối đi | `#chon-huong` | Thẻ "Sách và tài liệu" và "Lớp học tại CLB" ngay sau dải số liệu |
| Chọn chương trình | `#lop-hoc` | Chọn lớp 3–9 và nhu cầu, xem hướng học phù hợp |
| Lộ trình | `#lo-trinh-hoc` | Tiểu học / THCS, cách CLB cùng gia đình chọn lớp |
| Học trực tiếp | `#hoc-truc-tiep` | Liên hệ, chỗ chờ video YouTube `#class-videos` |
| Đăng ký tư vấn | `#tu-van-lop` | Form gửi tới `/api/stem/enquiries` |

Các mục dùng chung (giới thiệu cô Nga, thành tích, hỏi đáp) là của trang sách; ba câu hỏi về lớp học đã được thêm vào mục hỏi đáp chung.

File nguồn: `class-zone.css` (kiểu dáng, dùng biến màu của `styles.css`) và `class-zone.js` (chọn chương trình, gửi form, video). Phần lớp học được bọc trong `div.class-zone`; menu chính có liên kết "Lớp học".

## Chạy trên máy

```powershell
npm ci
npm start
```

Mở `http://localhost:3001/` rồi cuộn tới "Lớp học tại CLB". Database local tự thêm các bảng STEM. Không cần Firebase để gửi yêu cầu tư vấn. `http://localhost:3001/stem/` chuyển về `/#lop-hoc`.

## Trang STEM cũ trên Cloudflare

Project **stem-maths-co-nga** không còn được build từ repo này. Chọn một trong hai cách:

1. Xóa project đó trên Cloudflare nếu chưa gửi link cho ai.
2. Nếu link `stem-maths-co-nga.pages.dev` đã được gửi cho phụ huynh, giữ project và đổi nó thành trang chuyển hướng: để Root directory trống, Build command trống, Output directory `redirect`, và đặt trong thư mục đó một file `_redirects` có nội dung `/* https://le-nga-books.pages.dev/#lop-hoc 301`.

## Khởi tạo D1 dùng chung

Trước khi nhận yêu cầu thật, chạy tại thư mục gốc:

```powershell
npx wrangler d1 execute le-nga-books --remote --file=database/migrations/005-stem-maths.sql
```

Migration thêm chương trình, yêu cầu tư vấn và lịch sử xử lý, không sửa đơn sách. Chạy lại an toàn. Nếu gặp `too many terms in compound SELECT`, dùng bản migration mới đã tách dữ liệu chương trình thành từng lệnh `INSERT OR IGNORE` rồi chạy lại; chương trình và yêu cầu đã có được giữ nguyên.

## Chức năng

- Bốn nhu cầu cho lớp 3–9: củng cố, cơ bản, nâng cao, bồi dưỡng HSG.
- Mục tiêu thi chuyên chỉ dành cho lớp 6–9, kiểm tra ở cả trình duyệt và server.
- Form đồng bộ chương trình đang chọn, yêu cầu đồng ý cho CLB liên hệ.
- Mã yêu cầu riêng, chống gửi trùng, giới hạn 20 lần/IP/15 phút.
- Admin có tab STEM Maths: tìm kiếm, lọc, ghi chú nội bộ, lịch sử và chuyển trạng thái Mới → Đã liên hệ → Đang tư vấn → Đã xếp lớp/Đã hủy.
- Dùng phiên admin và CSRF hiện có. API công khai không cho đọc danh sách phụ huynh.
- Video YouTube chỉ tải sau khi bấm (`youtube-nocookie.com`). Thêm video bằng một nút `.class-video-frame[data-youtube-id]` trong `#class-videos`; CSP trang sách đã cho phép khung này.

Các mục chương trình là nhóm nhu cầu để tư vấn, không phải danh sách lớp đang khai giảng hoặc xác nhận còn chỗ. Website không tự đặt học phí, lịch học, sĩ số hay cam kết học thử miễn phí. CLB cần xác nhận trước khi công bố. Chưa có gửi email/Zalo tự động hoặc nhận thanh toán học phí.

## Kiểm tra sau deploy

1. `/healthz` trả `status: ok`.
2. `/api/stem/programs` có 28 chương trình (7 khối × 4 nhu cầu).
3. Mở `/#lop-hoc`: chọn lớp 3 không có mục tiêu thi chuyên; lớp 7 có thể bật mục tiêu này.
4. Gửi yêu cầu thử ở `#tu-van-lop`; mở `/admin` → STEM Maths để tìm phiếu.
5. Lưu ghi chú và chuyển trạng thái.
6. `/stem/` (nếu server hỗ trợ) chuyển về `/#lop-hoc`.

Lệnh deploy giữ nguyên: `npm run check:pages && npm run build:pages`.

Kiểm tra giao diện: `npm run test:ui` chạy 19 kích thước từ 320 đến 2560px cho phần lớp học, menu cảm ứng, xoay màn hình, gửi form và xử lý phiếu trong admin. Ảnh chụp lưu ở `data/`.
