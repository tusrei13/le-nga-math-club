# CLB Toán Cô Lê Nga

Landing page bán 10 đầu sách, đặt sách COD và gửi yêu cầu tư vấn. Dữ liệu lưu trong SQLite; frontend và API chạy chung bằng Node.js.

## Chạy dự án

Cần Node.js **22.16 trở lên** (khuyến nghị Node.js 24). Bản Node không cần package runtime; Wrangler và esbuild dùng để build Cloudflare.

```powershell
npm run db:init
npm start
```

Mở `http://localhost:3000`. Không mở trực tiếp `index.html` bằng `file://`, vì trang cần gọi API.

Database tự tạo ở `data/landing.sqlite`, gồm 16 bảng và dữ liệu mẫu 10 sách với ảnh bìa trong `public/assets/books`. `npm start` cũng tự khởi tạo nếu chưa có database.

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

Phiếu đặt sách gồm hai bước: chọn sách theo nhóm lớp (mỗi nhóm hai cuốn), rồi điền thông tin nhận sách. Các cuốn đã chọn được giữ khi chuyển nhóm; chế độ tư vấn mở thẳng form liên hệ.

Có thể kiểm tra thao tác thực tế trong Chrome/Edge đã cài bằng `npm run test:ui`. Script dùng trình duyệt ẩn và database tạm, kiểm tra cả desktop/mobile rồi lưu ảnh vào `data/order-desktop.png` và `data/order-mobile.png`. Dùng `UI_BROWSER_PATH` nếu trình duyệt nằm ở đường dẫn khác.

Xem [DATABASE.md](DATABASE.md) để biết sơ đồ bảng, giá mẫu, các API và cách quản trị/sao lưu.

## Deploy Cloudflare Pages miễn phí

Dùng **Pages Functions + D1**, không upload database SQLite hoặc chạy `server.mjs` trên Pages. Xem [CLOUDFLARE.md](CLOUDFLARE.md) để tạo D1, cấu hình binding `DB`, tài khoản riêng và publish. Chạy `npm ci` rồi `npm run build:pages`; output là `dist`. Bản Cloudflare hỗ trợ danh mục, đặt sách, tư vấn, đăng nhập và quản lý trạng thái; dữ liệu local không tự đồng bộ lên D1.

Chạy `npm run check:pages` để biết cấu hình còn thiếu. Với hai yêu cầu deploy và đăng nhập Google/email, cần UUID D1 thật cùng ba giá trị Firebase trong `[vars]` của `wrangler.toml`. Lệnh `npm run pages:deploy` tự kiểm tra trước khi build/publish. Việc bật provider, authorized domain và khởi tạo D1 phải thực hiện trên dịch vụ tương ứng.

Bản Node có `/healthz`, giới hạn gửi đơn/tư vấn, timeout HTTP, graceful shutdown và CSP. Sao lưu SQLite đang chạy bằng `npm run db:backup`; file tạo trong `data/backups/`. Trên Cloudflare, dùng D1 export/Time Travel theo hướng dẫn riêng.
