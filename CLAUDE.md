# CLAUDE.md

Hướng dẫn cho Claude khi làm việc trong repo này. Tài liệu chi tiết nằm trong các file `.md` ở thư mục gốc; file này chỉ tóm tắt những điều cần biết trước khi sửa code.

## Dự án

Landing page của **CLB Toán Cô Lê Nga**, gồm ba phần trong một trang chính:

- **Sách và tài liệu**: danh mục sách giấy (đặt COD), PDF đầy đủ (đặt qua Zalo trợ lí), bản đọc thử PDF miễn phí, mục Tài liệu số.
- **Lớp học tại CLB** (STEM Maths, lớp 3–9): id `#lop-hoc`, form tư vấn gửi tới `/api/stem/enquiries`.
- **Trang quản trị** `/admin`: xử lý đơn sách và yêu cầu tư vấn.

Giao diện và nội dung hiển thị bằng **tiếng Việt**. Tài liệu trong repo cũng viết bằng tiếng Việt.

Hai môi trường chạy:

- **Local (Node + SQLite)**: `server.mjs`, `api.mjs`, `database/db.mjs`, dữ liệu ở `data/landing.sqlite`.
- **Production (Cloudflare Pages + D1)**: `dist/` do `npm run build:pages` tạo; API nằm ở `cloudflare/worker.mjs`; dữ liệu ở D1 (binding `DB`, database `le-nga-books`).

Hai môi trường **không đồng bộ dữ liệu** với nhau. Chỉ sửa HTML/CSS/JS thì D1 không đổi; thay đổi dữ liệu phải có migration.

## Lệnh thường dùng

```powershell
npm ci                  # cài dependency (lockfile đã khóa)
npm run db:init         # tạo database SQLite local
npm start               # chạy server Node tại http://localhost:3001
npm test                # toàn bộ test Node (database tạm)
npm run test:ui         # test giao diện đặt sách bằng Chrome/Edge (headless)
npm run test:ui:reference | test:ui:digital | test:ui:videos
npm run build:pages     # build dist/ cho Cloudflare Pages
npm run check:pages     # kiểm tra cấu hình Pages/Firebase/D1 còn thiếu
npm run db:backup       # sao lưu SQLite vào data/backups/
npm run admin:create    # tạo tài khoản admin local (tối thiểu 15 ký tự mật khẩu)
```

Yêu cầu: Node.js **>= 22.16** (khuyến nghị 24). Không mở `index.html` bằng `file://`; trang cần gọi API.

## Bản đồ mã nguồn

- **Frontend trang chính**: `index.html`, `styles.css`, `app.js`, `catalog-ui.js/.css`, `class-zone.js/.css`, `book-videos.js/.css`, `book-video-data.js`, `digital.js/.css`, `customer.js/.css`.
- **Frontend quản trị**: `admin.html`, `admin.js`, `admin.css`, `admin-digital.js/.css`.
- **Server Node**: `server.mjs` (HTTP, static, CSP), `api.mjs` (API sách/đơn/tư vấn/admin), `stem-api.mjs`, `digital-api.mjs`, `digital-catalog.mjs`, `auth.mjs`, `customer-auth.mjs`, `security.mjs`, `edge-rate-limit.mjs`, `passwords.mjs`, `video-assets.mjs`.
- **Danh mục chuẩn**: `reference-catalog.mjs` là nguồn chính của sản phẩm, giá và nhóm hiển thị. API luôn trả `price_vnd=null` và `orderable=false` cho mục cần báo giá.
- **Cloudflare**: `cloudflare/worker.mjs` (Pages Function), `cloudflare/edge-schema.sql`, `wrangler.toml`, `pages-admin-auth.mjs`.
- **Database**: `database/schema.sql` (SQLite gốc), `database/migrations/*.sql` (004–010), `database/init.mjs`, `database/seed.mjs`, `database/d1-adapter.mjs`, `database/backup.mjs`.
- **Scripts build/kiểm tra**: `scripts/build-pages.mjs` (bundle, thêm hash SHA-256 vào URL logo/favicon), `scripts/check-pages.mjs`, `scripts/pages-admin.mjs`.
- **Tài nguyên tĩnh**: `public/assets/` (ảnh bìa, ảnh bìa mẫu, PDF đọc thử, video MP4 của bộ Tiểu học, PDF mẫu tài liệu số).
- **Test**: `tests/*.test.mjs` (Node test runner) và `tests/*-ui.mjs` (trình duyệt thật). Ảnh kiểm tra ghi vào `data/` và không commit.

Các tài liệu cần đọc theo chủ đề:

- [README.md](README.md): chạy dự án, biến môi trường, tổng quan.
- [DATABASE.md](DATABASE.md): bảng, API công khai và quản trị, quy tắc Idempotency-Key.
- [REFERENCE-CATALOG.md](REFERENCE-CATALOG.md): danh mục, giá, migration 010 và thứ tự triển khai.
- [CLOUDFLARE.md](CLOUDFLARE.md), [ADMIN.md](ADMIN.md), [FIREBASE.md](FIREBASE.md), [DIGITAL-DOCUMENTS.md](DIGITAL-DOCUMENTS.md), [STEM-MATHS.md](STEM-MATHS.md), [SECURITY.md](SECURITY.md).

## Quy tắc khi sửa code

**Giá và đơn hàng**
- Giá tính ở server. Không tin đơn giá hoặc tổng tiền do frontend gửi lên.
- Sửa giá, tên sách hoặc danh mục phải cập nhật cả `reference-catalog.mjs` lẫn migration tương ứng trong `database/migrations/`.
- Đơn cũ giữ giá tại thời điểm đặt (`order_items`). Không sửa ngược dữ liệu lịch sử.

**Database và migration**
- Mọi thay đổi schema hoặc dữ liệu production phải có file migration mới trong `database/migrations/`, đánh số tiếp theo (hiện có tới 010). Không sửa migration đã áp dụng.
- Migration phải an toàn khi chạy lại: không ghi đè chỉnh sửa do quản trị làm.
- Với D1: deploy code và tài nguyên trước, rồi mới chạy `npx wrangler d1 execute le-nga-books --remote --file=...`. Ghi rõ thứ tự này trong tài liệu liên quan khi thêm migration.
- Các POST đặt hàng và tư vấn yêu cầu header `Idempotency-Key` (16–100 ký tự, chữ/số/gạch ngang). Giữ nguyên quy tắc này khi sửa API.

**Bảo mật**
- Không commit `.env`, `data/`, file `.sqlite`, `data/pages-admin.sql`, `cloudflare/init.sql` (đã ignore) hoặc mật khẩu, token, service-account key. `wrangler.toml` chỉ chứa giá trị Firebase web config công khai và ID D1; đây là chấp nhận được.
- Giữ CSP và các header bảo mật trong `server.mjs`, `security.mjs`, `cloudflare/worker.mjs`. Trang admin không được dùng script inline hoặc eval.
- Dữ liệu người dùng (tên phụ huynh, ghi chú) hiển thị bằng text, không bằng HTML. Query SQL luôn dùng tham số.
- File trả phí không được đặt trong `public/`. Kho đọc thử công khai và kho file trả phí phải tách bạch; quyền tải kiểm tra ở server.
- Không đưa bản preview (`<hash>.stem-math-co-le-nga.pages.dev`) vào luồng đăng nhập hoặc gửi thông tin thật. Chỉ dùng domain production.

**Frontend**
- Không hardcode giá hoặc số điện thoại mới trong HTML nếu đã có nguồn trong `reference-catalog.mjs` / `site_content`.
- Layout phải chạy tốt ở điện thoại trước (mobile-first). Khi đổi bố cục, chạy `test:ui` tương ứng và xem ảnh kiểm tra.
- Ảnh bìa đầu trang dùng `public/assets/books/`; khi đổi ảnh nguồn phải rà lại `clip-path` trong `styles.css`.
- Video MP4 của bộ Tiểu học mỗi file dưới 25 MiB; build sẽ lỗi nếu vượt. Không thay video bằng nội dung AI hoặc chữ trên bìa.

**Tài liệu và nội dung**
- Không bịa tên, thành tích, đánh giá hay cam kết chưa được chủ dự án xác nhận. Testimonial hiện là case tổng hợp ẩn danh.
- Không quảng cáo freeship toàn bộ danh mục; chỉ áp dụng cho mục đã ghi rõ trong `REFERENCE-CATALOG.md`.

## Quy trình deploy Cloudflare

1. `npm test` và `npm run check:pages` phải pass.
2. Commit và push (kèm `public/assets/` mới nếu có).
3. `npm run pages:deploy` (lệnh này tự chạy check và build).
4. Chạy migration D1 mới nhất theo tài liệu tương ứng (ví dụ `010-reference-catalog.sql`).
5. Kiểm tra `/healthz`, `/api/landing` và nút đọc thử trên domain production.

Sau khi sửa phần bảo mật hoặc dependency: chạy `npm audit --audit-level=moderate`. Không chạy `npm audit fix --force` vì sẽ hạ Wrangler; `overrides.undici` đã được cấu hình có chủ đích.

## Quy ước làm việc

- Chỉ commit hoặc push khi người dùng yêu cầu. Làm việc trên branch riêng; không commit thẳng vào `main`.
- Trước khi sửa một mục giao diện, đọc đúng file CSS/JS liên quan và tìm các id đang được tham chiếu (ví dụ `#lop-hoc`, `#tai-lieu-so`, `#chon-huong`) để không phá link nội bộ.
- Trang `/stem/` cũ chỉ chuyển hướng về `/#lop-hoc`; không khôi phục project STEM riêng.
- Khi thêm tính năng cần dữ liệu mới, ưu tiên bảng/migration có sẵn hơn tạo cấu trúc mới.
- Chạy test liên quan trước khi báo hoàn thành. Nếu không chạy được (thiếu Chrome/Edge, thiếu Firebase, thiếu D1), nói rõ điều đó trong báo cáo.

## Trạng thái git hiện tại

Branch `feat/merge-stem-into-books` đang có các thay đổi chưa commit, trong đó thư mục `stem-maths/` và `scripts/build-stem.mjs` đã được xóa (staged) để gộp STEM vào trang sách. Không khôi phục các file này trừ khi người dùng yêu cầu. Các file mới chưa theo dõi: `class-zone.css`, `class-zone.js`.
