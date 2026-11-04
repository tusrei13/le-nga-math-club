# Sách & Tài liệu Toán Cô Lê Nga

Landing page gồm sách giấy và tài liệu số: 9 đầu sách đặt COD, PDF mẫu miễn phí và form tư vấn. Dữ liệu lưu trong SQLite; frontend và API chạy chung bằng Node.js.

STEM Maths là landing page thứ hai dành cho chương trình Toán offline lớp 3–9. Chạy `npm run build:stem`, xem local tại `/stem/`; hướng dẫn Cloudflare và D1 trong [STEM-MATHS.md](STEM-MATHS.md).

Hướng dẫn bảo mật và thu hồi phiên quản trị: [SECURITY.md](SECURITY.md).

## Chạy dự án

Cần Node.js **22.16 trở lên** (khuyến nghị Node.js 24). Bản Node không cần package runtime; Wrangler và esbuild dùng để build Cloudflare.

```powershell
npm run db:init
npm start
```

Mở `http://localhost:3000`. Không mở trực tiếp `index.html` bằng `file://`, vì trang cần gọi API.

Database tự tạo ở `data/landing.sqlite`, gồm 16 bảng và dữ liệu 13 sách với ảnh bìa trong `public/assets/books`. `npm start` cũng tự khởi tạo nếu chưa có database.

## Logo

Logo dùng chung cho trang sách, STEM Maths và quản trị tại public/assets/logo.png. Thay file này rồi build/deploy cả hai project. Build tự thêm phiên bản theo SHA-256 vào URL logo, favicon và ảnh dự phòng để trình duyệt tải ảnh mới. Giao diện hiển thị toàn bộ logo, không cắt trong khung tròn.

## Ảnh bìa tách nền

Cụm sách đầu trang và minh họa tủ sách dùng ba PNG riêng ở public/assets/books/cutouts/, xếp chồng bằng CSS. Chữ và hình trên bìa lấy nguyên điểm ảnh từ ba ảnh gốc, chỉ thêm alpha ở nền; không dùng ảnh dựng lại bằng AI.

Để tái tạo trên Windows, chạy pwsh -File scripts/prepare-book-cutouts.ps1. Script kiểm tra SHA-256 ảnh nguồn, xuất PNG và đối chiếu RGB các điểm ảnh không trong suốt. Nếu thay ảnh nguồn, cần rà và cập nhật mặt nạ trước khi chạy lại. Danh mục và database tiếp tục dùng ảnh gốc.

## Bản đọc thử của 9 cuốn sách

Mỗi thẻ sách có nút Đọc thử PDF, mở bản đọc thử riêng ở tab mới và không thay đổi giỏ sách. Chín PDF gốc nằm trong public/assets/books preview/. Ánh xạ theo ID sách nằm ở database/book-previews.mjs; URL mã hóa khoảng trắng nên dùng được trên Node và Cloudflare Pages.

SQLite cập nhật tự động khi khởi động. Với D1 đã deploy, publish các PDF trước rồi áp dụng database/migrations/007-book-previews.sql; xem CLOUDFLARE.md. Migration giữ lịch sử đơn và không ghi đè thay đổi quản trị khi chạy lại. Build Pages sẽ báo lỗi nếu thiếu PDF bắt buộc.

## Tài liệu số

Mục #tai-lieu-so có 17 nhóm với 31 PDF đọc thử công khai, không cần đăng nhập hoặc thanh toán; lọc theo lớp, phân trang 6 nhóm/trang và chọn từng file. Xem DIGITAL-DOCUMENTS.md.

Đây là phần giới thiệu và tải mẫu. Chưa có bán file trả phí, xác nhận chuyển khoản hoặc cấp quyền tải riêng. File trả phí sau này phải đặt trong kho riêng và kiểm tra quyền tải phía server; không đưa file trả phí vào public/assets/.

## Tài khoản khách hàng

Landing page có đăng nhập/đăng ký email và Google qua Firebase Authentication, quên mật khẩu, xác minh email và lịch sử đơn riêng. Xem [FIREBASE.md](FIREBASE.md) để tạo Firebase project và bật phương thức đăng nhập. Đặt sách không cần tài khoản vẫn hoạt động; chỉ đơn đặt lúc đăng nhập được gắn với tài khoản.

## Trang quản trị

Với bản Cloudflare, xem [CLOUDFLARE.md](CLOUDFLARE.md). Tài khoản D1 độc lập với tài khoản SQLite dưới đây.

Chạy `npm run admin:create` trong terminal để tự đặt tên đăng nhập và mật khẩu (tối thiểu 15 ký tự). Khởi động lại server rồi mở `http://localhost:3000/admin` để quản lý đơn sách và yêu cầu tư vấn. Dùng `npm run admin:reset` nếu cần đặt lại mật khẩu. Xem [ADMIN.md](ADMIN.md) để biết cách sử dụng và cấu hình triển khai.

## Biến môi trường

Các biến dưới đây dành cho bản Node. Cấu hình Pages/D1 theo hướng dẫn Cloudflare.

- `PORT`: cổng server, mặc định `3000`.
- `DATABASE_PATH`: đường dẫn SQLite, mặc định `data/landing.sqlite`.
- `PUBLIC_ORIGIN`: origin HTTPS, ví dụ `https://books.example.com`, bắt buộc khi Node chạy `NODE_ENV=production`.
- `TRUST_PROXY=1`: chỉ dùng khi Node nằm sau đúng một proxy tin cậy và không được truy cập trực tiếp; mặc định bỏ qua `X-Forwarded-For`.
- `ADMIN_API_TOKEN`: token riêng dài ít nhất 32 ký tự để bật API quản trị. Đặt trong môi trường chạy server; `.env` không được tự động đọc.
- `ADMIN_COOKIE_SECURE=true` hoặc `NODE_ENV=production`: dùng cookie đăng nhập Secure khi triển khai HTTPS. Giao diện quản trị đăng nhập bằng tài khoản, không cần Bearer token.

## Kiểm tra

```powershell
npm test
```

Test dùng database tạm riêng; kiểm tra ảnh bìa, lưu đơn/tư vấn, giá tính phía server, gửi trùng, validation, quyền quản trị, trạng thái, chỉnh sửa nội dung và khả năng giữ dữ liệu khi khởi tạo lại.

Phiếu đặt sách gồm hai bước: chọn sách theo nhóm lớp (hai tập cho mỗi lớp 6–9, một cuốn 70 đề thi vào lớp 6 và bốn tập Siêu nhân Tiểu học), rồi điền thông tin nhận sách. Các cuốn đã chọn được giữ khi chuyển nhóm; chế độ tư vấn mở thẳng form liên hệ.

Có thể kiểm tra thao tác thực tế trong Chrome/Edge đã cài bằng `npm run test:ui`. Script dùng trình duyệt ẩn và database tạm, kiểm tra cả desktop/mobile rồi lưu ảnh vào `data/order-desktop.png` và `data/order-mobile.png`. Dùng `UI_BROWSER_PATH` nếu trình duyệt nằm ở đường dẫn khác.

Xem [DATABASE.md](DATABASE.md) để biết sơ đồ bảng, giá mẫu, các API và cách quản trị/sao lưu.

## Deploy Cloudflare Pages miễn phí

Dùng **Pages Functions + D1**, không upload database SQLite hoặc chạy `server.mjs` trên Pages. Xem [CLOUDFLARE.md](CLOUDFLARE.md) để tạo D1, cấu hình binding `DB`, tài khoản riêng và publish. Chạy `npm ci` rồi `npm run build:pages`; output là `dist`. Bản Cloudflare hỗ trợ danh mục, đặt sách, tư vấn, đăng nhập và quản lý trạng thái; dữ liệu local không tự đồng bộ lên D1.

Chạy `npm run check:pages` để biết cấu hình còn thiếu. Với hai yêu cầu deploy và đăng nhập Google/email, cần UUID D1 thật cùng ba giá trị Firebase trong `[vars]` của `wrangler.toml`. Lệnh `npm run pages:deploy` tự kiểm tra trước khi build/publish. Việc bật provider, authorized domain và khởi tạo D1 phải thực hiện trên dịch vụ tương ứng.

Bản Node có `/healthz`, giới hạn gửi đơn/tư vấn, timeout HTTP, graceful shutdown và CSP. Sao lưu SQLite đang chạy bằng `npm run db:backup`; file tạo trong `data/backups/`. Trên Cloudflare, dùng D1 export/Time Travel theo hướng dẫn riêng.

## Tài liệu PDF đọc thử công khai

Danh mục 17 nhóm, 31 PDF đọc thử miễn phí, lọc theo lớp và phân trang 6 nhóm/trang. Không cần đăng nhập, thanh toán hoặc Supabase. Xem [DIGITAL-DOCUMENTS.md](DIGITAL-DOCUMENTS.md).
