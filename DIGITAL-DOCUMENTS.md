# Tài liệu số riêng tư

Trang sách có danh mục PDF theo lớp, đơn tài liệu riêng và mục **Tài liệu của tôi** trong tài khoản Firebase. Node/SQLite và Cloudflare Pages/D1 dùng chung API trong `digital-api.mjs`.

## Dữ liệu ban đầu

Migration `008-digital-documents.sql` tạo 14 bộ tài liệu với 25 file PDF đầy đủ theo tên file đã sắp xếp. Bốn file `BanDocThu` của Toán 3 không được đưa vào bán như bản đầy đủ. PDF gốc vẫn nằm trong Supabase, không được sao chép vào repo hoặc output deploy.

Giá 29.000–79.000đ là **giá tạm để chủ CLB duyệt**, không phải giá đã xác nhận. Tất cả bộ ban đầu là bản nháp, danh mục hiển thị “Giá dự kiến / Sắp mở bán”. Nhận đơn và thông tin ngân hàng ban đầu đều tắt/trống. Migration chạy lại giữ nguyên chỉnh sửa và đơn đã có.

## Thiết lập Production

1. Giữ bucket `paid-documents` của Supabase ở chế độ **Private**. Không tạo policy cho phép `anon` hoặc mọi người đọc toàn bộ bucket.
2. Trong Supabase **Project Settings → API Keys**, lấy một **Secret key** (`sb_secret_...`). API cũng hỗ trợ legacy `service_role` qua `SUPABASE_SERVICE_ROLE_KEY`; không dùng `anon` hoặc publishable key để giao PDF.
3. Thêm khóa vào Cloudflare Pages project **le-nga-books**, môi trường **Production**, dưới dạng Secret tên `SUPABASE_SECRET_KEY`. Có thể dùng terminal trong repo:

   ```powershell
   npx wrangler pages secret put SUPABASE_SECRET_KEY --project-name le-nga-books
   ```

   Dán khóa tại lời nhắc bí mật. Không đưa khóa vào `wrangler.toml`, HTML, frontend JS, GitHub, log hoặc chat. Secret mới cần deploy lại để có trong runtime.

4. URL mặc định đã đúng project của CLB: `https://qyyhdfmlvmuqqcihoejg.supabase.co`. Nếu cần thay, đặt biến server `SUPABASE_URL`. API chỉ chấp nhận HTTPS trên tên miền project `*.supabase.co`, bucket cố định `paid-documents`.
5. Áp dụng riêng migration mới vào D1 hiện có:

   ```powershell
   npx wrangler d1 execute le-nga-books --remote --file=database/migrations/008-digital-documents.sql
   ```

   Không cần nhập lại toàn bộ `cloudflare/init.sql` cho database đang sử dụng.

6. Build và deploy bản code mới của trang sách theo `CLOUDFLARE.md`. Không cần đổi Firebase hay deploy STEM Maths.
7. Vào trang quản trị hiện có, chọn tab **Tài liệu số → Quản lý tài liệu và thông tin thanh toán**:
   - Điền ngân hàng, số tài khoản, chủ tài khoản thật và hướng dẫn cho khách.
   - Kiểm tra tên, mô tả, giá từng bộ; kiểm tra đường dẫn từng file tương ứng trong Supabase.
   - Bỏ **Bản nháp** rồi lưu. Máy chủ thử tạo link có thời hạn cho từng file để kiểm tra kho trước khi cho mở bán.
   - Bật **Mở nhận đơn tài liệu** sau khi hoàn tất. API từ chối nếu chưa đủ thông tin nhận tiền hoặc thiếu cấu hình kho.

Phần Data API/PostgREST của Supabase không cần bật cho luồng Storage này.

## Quy trình nhận đơn

Khách đăng nhập Firebase, chọn một bộ và tạo đơn. Giá và tên tài liệu được chụp từ database phía máy chủ; một tài khoản chỉ có một đơn chờ hoặc đã trả tiền cho cùng bộ. Gửi lại sau lỗi mạng sử dụng cùng mã gửi để tránh tạo trùng.

Mục **Tài liệu của tôi** hiển thị mã đơn, số tiền, thông tin chuyển khoản và trạng thái. Khách không có nút tự xác nhận đã thanh toán.

Chủ CLB đối chiếu giao dịch ngân hàng thực tế với mã đơn, số tiền. Trong admin, chọn **Đã thanh toán**, tích xác nhận đã kiểm tra tiền thực nhận rồi lưu. Chỉ lúc đó khách mới có các nút tải từng PDF trong bộ.

Khi cần thu hồi quyền, chuyển đơn đã thanh toán sang **Đã thu hồi quyền tải** và ghi lý do. Lịch sử lưu người xử lý và thời gian; sửa trạng thái yêu cầu phiên admin, CSRF và phiên bản đơn hiện tại.

## Bảo vệ file

API tải xác thực Firebase trên mỗi yêu cầu, kiểm tra đúng tài khoản sở hữu đơn, trạng thái đã thanh toán và file thuộc đúng bộ. Người dùng không thể gửi đường dẫn PDF tùy ý để yêu cầu ký.

Khóa Supabase chỉ được gửi từ backend tới Storage; key mới dùng header `apikey`, legacy service_role dùng thêm Bearer JWT. URL trả về được kiểm tra đúng host và đường dẫn. Kết nối có timeout và không theo redirect.

Link tải hiệu lực 60 giây và là bearer link: ai có link đó có thể dùng trong thời gian còn hiệu lực. Thu hồi đơn ngăn tạo link mới nhưng link đã phát hành có thể còn dùng tối đa 60 giây. File khách đã tải xuống không thể thu hồi hoặc ngăn họ chia sẻ bằng cơ chế này.

Kho bị lỗi, thiếu khóa, đơn chưa trả tiền hoặc sai chủ sở hữu đều không được cấp link. Dữ liệu danh mục công khai không chứa object key, khóa Supabase, thông tin khách hay link tải có chữ ký.

## Chạy local

`npm start` không tự đọc `.env`. Để thử với cấu hình thật, lưu biến theo `.env.example` vào file `.env` đã được gitignore rồi chạy:

```powershell
node --env-file=.env server.mjs
```

Không cần khóa thật để xem danh mục nháp. Các bài test dùng kho/Firebase mô phỏng, database tạm; không kết nối bucket thật hoặc tạo giao dịch ngân hàng.

## Kiểm tra

```powershell
npm test
npm run test:ui
npm run test:ui:digital
npm run build:pages
```

Sau deploy: kiểm tra danh mục, sửa một bộ và xác nhận file, tạo đơn thử có tài khoản, duyệt sau khi đối chiếu giao dịch, thử tải bằng tài khoản chủ đơn và thử từ tài khoản khác; cuối cùng thử thu hồi quyền.
