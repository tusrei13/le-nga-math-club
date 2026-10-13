# Deploy miễn phí lên Cloudflare Pages + D1

Pages phục vụ giao diện; Pages Function trong `cloudflare/worker.mjs` xử lý API; D1 lưu sách, đơn, tư vấn và phiên quản trị. Không upload toàn bộ thư mục dự án. Không đưa file SQLite hay mật khẩu vào Git.

## Chuẩn bị trên máy

Cần Node.js 22.16+ (khuyến nghị Node 24), tài khoản Cloudflare và npm. Chạy tại thư mục gốc:

```powershell
npm ci
npx wrangler login
npx wrangler d1 create le-nga-books
```

Lệnh cuối trả `database_id`. Thay `REPLACE_WITH_YOUR_D1_DATABASE_ID` trong `wrangler.toml` bằng ID đó. ID database không phải mật khẩu; có thể commit. Binding phải tên **DB**.

```powershell
npm run build:pages
npx wrangler d1 execute le-nga-books --remote --file=cloudflare/init.sql
```

Build tạo `dist/` và SQL khởi tạo. SQL chỉ chứa danh mục/nội dung mẫu, không chứa tài khoản hoặc đơn tại máy bạn. Chạy lại SQL không ghi đè bản ghi đã chỉnh sửa. D1 độc lập với `data/landing.sqlite`; dữ liệu local không tự đồng bộ.

## Tài khoản quản trị Cloudflare

Tài khoản khách hàng email/Google được cấu hình riêng bằng Firebase; xem [FIREBASE.md](FIREBASE.md). Tài khoản khách hàng không được truy cập quản trị. Nếu D1 đã chạy trước đây, áp dụng `database/customer-schema.sql` trước khi publish phiên bản có tài khoản khách hàng.

```powershell
npm run pages:admin -- admin
npx wrangler d1 execute le-nga-books --remote --file=data/pages-admin.sql
```

Lệnh đầu hỏi email và mật khẩu bạn tự đặt (15–256 ký tự), nhập lại để xác nhận. Nếu bỏ đối số `admin`, chương trình cũng hỏi tên đăng nhập. Mật khẩu không hiển thị khi gõ và không được ghi vào SQL/log. Có thể chọn một cụm từ dài dễ nhớ.

Firebase Email/Password phải được bật; chương trình đọc web config từ `wrangler.toml`. Nếu email chưa có tài khoản Firebase, chương trình tạo với mật khẩu vừa nhập. Nếu đã có, nhập mật khẩu hiện tại của email đó; mật khẩu sai sẽ không tạo SQL cấp quyền. Khi quên mật khẩu, đặt lại qua chức năng “Quên mật khẩu” trên landing page hoặc Firebase Authentication trước rồi chạy lại lệnh. D1 chỉ lưu liên kết Firebase UID/email/project trong cột `password_hash` cũ; mật khẩu được Firebase quản lý. Khách tự đăng ký Firebase không tự có quyền admin.

Chỉ khi lệnh chuẩn bị thành công, áp dụng SQL bằng lệnh thứ hai. Sau đó deploy bản code mới và đăng nhập `/admin` bằng tên đăng nhập (ví dụ `admin`) cùng mật khẩu tự đặt; không cần nhập email vào ô tên đăng nhập. D1 và tài khoản SQLite local độc lập.

Áp dụng lại SQL với cùng tên đăng nhập sẽ chuyển liên kết tài khoản và thu hồi mọi phiên admin cũ. Nếu đổi mật khẩu trong Firebase, áp dụng lại SQL để thu hồi ngay phiên D1 đã đăng nhập; nếu không, phiên D1 vẫn có thể tồn tại đến khi hết hạn. Tài khoản mật khẩu ngẫu nhiên cũ tiếp tục hoạt động tới khi được chuyển đổi. Không có endpoint công khai tự cấp quyền admin. Cookie `Secure`, `HttpOnly`, `SameSite=Strict`; phiên tối đa 8 giờ, nghỉ quá 30 phút hết phiên; sửa dữ liệu yêu cầu CSRF. D1 giới hạn gửi đơn/tư vấn và thử đăng nhập theo IP; giới hạn thử đăng nhập là 10 lần/15 phút (khác local Node).

## Publish

Điền D1 database ID và ba giá trị Firebase public trong `wrangler.toml`, bật Email/Password + Google và authorized domain theo [FIREBASE.md](FIREBASE.md). `npm run check:pages` kiểm tra các giá trị bắt buộc; lệnh deploy cũng chạy kiểm tra này để tránh publish bản thiếu đăng nhập.

```powershell
npm run pages:deploy
```

Lần đầu Wrangler có thể hỏi tạo Pages project, đặt tên `le-nga-books`. Sau đó mở URL `https://le-nga-books.pages.dev` do Wrangler trả về và `/admin` để đăng nhập. `/healthz` kiểm tra binding/schema.

Nếu kết nối GitHub trong dashboard Pages:

- Framework preset: **None**.
- Build command: **npm run build:pages**.
- Output directory: **dist**.
- Node version: **24**.
- D1 binding: **DB**, chọn database đã tạo nếu cấu hình dashboard yêu cầu.
- Compatibility flag: **nodejs_compat**, ngày tương thích theo `wrangler.toml`.

Không dùng “Upload assets” kéo thả đơn thuần: dự án có Pages Function. Chọn Wrangler hoặc Git integration. Với preview, dùng D1 riêng để tránh tạo đơn test hay thay đổi đơn thật; không trỏ preview vào D1 production. Không đặt `NODE_ENV=production` cho script local để thay thế runtime Cloudflare: bản Pages không chạy `server.mjs`.

## Kiểm tra trước khi mở bán

Mở `/api/products` kiểm tra 10 sách và ảnh; thử đặt một đơn, gửi tư vấn, đăng nhập `/admin`, tìm phiếu và đổi trạng thái. Xác nhận giá, phí giao, quà tặng, thông tin liên hệ, bằng cấp/kinh nghiệm và trang mẫu PDF với chủ CLB. Đây là nội dung ban đầu do dự án đề xuất, không phải dữ liệu đã được xác minh. Bản Cloudflare ẩn các testimonial/điểm số có `is_composite=1`; chỉ công bố dữ liệu thật đã có quyền sử dụng bằng `published=1, is_composite=0`.

Giao diện quản trị hiện quản lý đơn và tư vấn. Các API chỉnh sửa danh mục/nội dung của bản Node chưa được chuyển sang Pages; nếu cần sửa trên D1, dùng dashboard D1/SQL hoặc bổ sung chức năng CMS sau. `/api/admin/products` và các endpoint CMS trả 404 trên Pages.

## Backup và giới hạn

```powershell
npx wrangler d1 export le-nga-books --remote --output=data/d1-backup.sql
```

Lưu backup ở nơi riêng, ngoài máy đang chạy; file có dữ liệu phụ huynh và hash tài khoản. D1 có Time Travel theo gói dịch vụ. Theo dõi quota Pages Functions/Workers và D1 trong dashboard: vượt quota miễn phí có thể khiến API tạm ngừng, không nên xem gói free là cam kết vận hành không giới hạn. Chọn chế độ **fail closed** nếu dashboard cho phép cấu hình khi Functions hết quota. Thư mục output không chứa backend source hay database để tránh rò rỉ dù Function không chạy.

## Kiểm thử local Cloudflare

```powershell
npm run build:pages
npx wrangler d1 execute le-nga-books --local --file=cloudflare/init.sql
npm run pages:dev
```

Mở URL localhost do Wrangler in ra. Các lệnh `--local` dùng database riêng trong `.wrangler/`, không tác động D1 trên Cloudflare. Trong terminal khác, chạy `node tests/pages-live.mjs` để kiểm thử runtime thật ở cổng 8788; script chỉ cho phép localhost và dọn các bản ghi do nó tạo. Giới hạn CPU/quota production cần kiểm tra sau khi publish, local simulator không mô phỏng đầy đủ mọi hạn mức free.

Tham khảo: [Pages Functions](https://developers.cloudflare.com/pages/functions/), [D1 bindings](https://developers.cloudflare.com/pages/functions/bindings/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [Node crypto compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/).
