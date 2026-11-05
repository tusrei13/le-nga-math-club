# Sách & Tài liệu Toán Cô Lê Nga

Landing page gồm 21 mục sách và tài liệu theo bản mẫu tháng 11/2026: 9 mục sách giấy và 12 mục tài liệu lớp 3–5. Sách giấy có giá được đặt COD; PDF đầy đủ đặt qua Zalo trợ lí, PDF đọc thử miễn phí. Dữ liệu lưu trong SQLite; frontend và API chạy chung bằng Node.js.

STEM Maths là landing page thứ hai dành cho chương trình Toán offline lớp 3–9. Chạy `npm run build:stem`, xem local tại `/stem/`; hướng dẫn Cloudflare và D1 trong [STEM-MATHS.md](STEM-MATHS.md).

Hướng dẫn bảo mật và thu hồi phiên quản trị: [SECURITY.md](SECURITY.md).

## Chạy dự án

Cần Node.js **22.16 trở lên** (khuyến nghị Node.js 24). Bản Node không cần package runtime; Wrangler và esbuild dùng để build Cloudflare.

```powershell
npm run db:init
npm start
```

Mở `http://localhost:3000`. Không mở trực tiếp `index.html` bằng `file://`, vì trang cần gọi API.

Database tự tạo ở `data/landing.sqlite`, với danh mục hiện hành theo `reference-catalog.mjs`. `npm start` cũng tự khởi tạo nếu chưa có database.

## Logo

Logo dùng chung cho trang sách, STEM Maths và quản trị tại public/assets/logo.png. Thay file này rồi build/deploy cả hai project. Build tự thêm phiên bản theo SHA-256 vào URL logo, favicon và ảnh dự phòng để trình duyệt tải ảnh mới. Giao diện hiển thị toàn bộ logo, không cắt trong khung tròn.

## Ảnh bìa đầu trang

Cụm ba sách đầu trang dùng ảnh gốc trong public/assets/books/, căn và giới hạn vùng hiển thị bằng CSS. Không cần các PNG cũ trong cutouts. Khi thay ảnh nguồn, cần rà lại clip-path trong styles.css.

## Bản đọc thử sách và tài liệu

Nút Đọc thử PDF mở đúng mẫu theo sản phẩm; bộ nhiều bản cho chọn từng file. Bản mẫu mới và nguồn ảnh/video nằm trong public/assets/catalog; các bản cũ vẫn được giữ để bảo toàn đường dẫn. Xem [REFERENCE-CATALOG.md](REFERENCE-CATALOG.md) cho giá, đơn vị bán, thời hạn ưu đãi và migration D1 bắt buộc.

## Tài liệu số

Mục #tai-lieu-so có 17 nhóm với 31 PDF đọc thử công khai, không cần đăng nhập hoặc thanh toán; lọc theo lớp, phân trang 6 nhóm/trang và chọn từng file. Xem DIGITAL-DOCUMENTS.md.

Kho đọc thử tách khỏi mục tài liệu đầy đủ có giá và liên hệ Zalo. Website chưa tự xác nhận chuyển khoản hoặc cấp quyền tải tài liệu đã mua. File trả phí sau này phải đặt trong kho riêng và kiểm tra quyền tải phía server; không đưa file trả phí vào public/assets/.

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

Phiếu đặt sách gồm hai bước: chọn sách giấy hoặc bộ sách có giá xác định, rồi điền thông tin nhận sách. Các tập Siêu nhân và bộ lớp 9 cần liên hệ báo giá; PDF đầy đủ đặt qua Zalo. Các cuốn đã chọn được giữ khi chuyển nhóm; chế độ tư vấn mở thẳng form liên hệ.

Có thể kiểm tra thao tác thực tế trong Chrome/Edge đã cài bằng `npm run test:ui`. Script dùng trình duyệt ẩn và database tạm, kiểm tra cả desktop/mobile rồi lưu ảnh vào `data/order-desktop.png` và `data/order-mobile.png`. Dùng `UI_BROWSER_PATH` nếu trình duyệt nằm ở đường dẫn khác.

Xem [DATABASE.md](DATABASE.md) để biết sơ đồ bảng, giá mẫu, các API và cách quản trị/sao lưu.

## Deploy Cloudflare Pages miễn phí

Dùng **Pages Functions + D1**, không upload database SQLite hoặc chạy `server.mjs` trên Pages. Xem [CLOUDFLARE.md](CLOUDFLARE.md) để tạo D1, cấu hình binding `DB`, tài khoản riêng và publish. Chạy `npm ci` rồi `npm run build:pages`; output là `dist`. Bản Cloudflare hỗ trợ danh mục, đặt sách, tư vấn, đăng nhập và quản lý trạng thái; dữ liệu local không tự đồng bộ lên D1.

Chạy `npm run check:pages` để biết cấu hình còn thiếu. Với hai yêu cầu deploy và đăng nhập Google/email, cần UUID D1 thật cùng ba giá trị Firebase trong `[vars]` của `wrangler.toml`. Lệnh `npm run pages:deploy` tự kiểm tra trước khi build/publish. Việc bật provider, authorized domain và khởi tạo D1 phải thực hiện trên dịch vụ tương ứng.

Bản Node có `/healthz`, giới hạn gửi đơn/tư vấn, timeout HTTP, graceful shutdown và CSP. Sao lưu SQLite đang chạy bằng `npm run db:backup`; file tạo trong `data/backups/`. Trên Cloudflare, dùng D1 export/Time Travel theo hướng dẫn riêng.

## Tài liệu PDF đọc thử công khai

Danh mục 17 nhóm, 31 PDF đọc thử miễn phí, lọc theo lớp và phân trang 6 nhóm/trang. Không cần đăng nhập, thanh toán hoặc Supabase. Xem [DIGITAL-DOCUMENTS.md](DIGITAL-DOCUMENTS.md).


## Video giới thiệu bộ sách Tiểu học

Khối giới thiệu bộ sách nằm trước bốn tập **Em là siêu nhân giải Toán Tiểu học**. Các tập 1, 3, 4 có nút **Xem giới thiệu** bên cạnh **Đọc thử PDF**. Tập 2 chưa có video nên chưa hiện nút này.

Các MP4 và ảnh poster trích từ video gốc nằm trong `public/assets/videos/sieu-nhan/`. Video giữ tỉ lệ dọc, có điều khiển phát/tua; chỉ tải MP4 sau khi người xem bấm và dừng khi đóng. File được đưa cùng bản build Pages; không cần bucket, biến môi trường hoặc migration mới. Mỗi MP4 hiện dưới 25 MiB; build sẽ báo lỗi nếu vượt giới hạn.

Để bổ sung tập 2: thêm `tap-2.mp4` và `tap-2.jpg` vào thư mục trên, rồi thêm khóa `sieu-nhan-tap-2` trong `book-video-data.js` theo cấu trúc các tập hiện có. Nút trên thẻ sách sẽ xuất hiện tự động. Không thay video bằng nội dung AI hoặc thay đổi chữ trên bìa.

Chạy `npm run test:ui:videos` để kiểm tra trình phát trong Chrome/Edge, tải theo yêu cầu, tua, đóng bằng Escape và bố cục điện thoại/iPad/desktop. Ảnh kiểm tra lưu trong `data/book-video-*.png`.
