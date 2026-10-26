# Vận hành bảo mật

Áp dụng cho website sách, STEM Maths và trang quản trị chung. Đây là hướng dẫn vận hành; không phải cam kết hệ thống không thể bị tấn công.

## Bảo vệ trong code

- API admin yêu cầu phiên hợp lệ; thao tác ghi qua cookie kiểm tra CSRF và Origin. Cookie Pages có HttpOnly, Secure, SameSite=Strict, giới hạn thời gian sống và thời gian không hoạt động. Đăng nhập lại thay thế cookie đang dùng bằng phiên mới.
- Pages giới hạn đăng nhập theo IP và theo tên tài khoản đã chuẩn hóa, dùng D1 dùng chung giữa các instance. Node có giới hạn tương ứng trong bộ nhớ. Dữ liệu giới hạn hết hạn được dọn khi có yêu cầu tiếp theo, kể cả khi đăng nhập hoặc kiểm tra dữ liệu thất bại.
- JSON giới hạn 32 KiB; Pages giới hạn 10 giây nhận body, kiểm tra media type, encoding và UTF-8. Node giữ giới hạn 32 KiB và request timeout của HTTP server.
- Header CSP, chống nhúng iframe, nosniff, HTTPS và cache được áp dụng cho cả phản hồi Worker, lỗi API và tài nguyên tĩnh. CSP admin và STEM không cho script inline hoặc eval. Trang sách giữ các nguồn cần cho Firebase/Google login.
- API không trả request key/hash trong phiếu admin. Ghi chú và tên phụ huynh được hiển thị bằng text, truy vấn dùng tham số. Các file nguồn backend, SQL và database nằm ngoài thư mục public.
- Firebase xác minh ID token qua dịch vụ Google; khi có `validSince`, code kiểm tra `auth_time` để từ chối phiên đã bị thu hồi. Lỗi dịch vụ không được xem là xác thực thành công. Customer UID không cấp quyền admin.

## Domain chính và bản xem thử

Dùng `https://le-nga-books.pages.dev` và `https://stem-maths-co-nga.pages.dev` để đăng nhập hoặc gửi thông tin thật. Các URL `https://<hash-hoặc-branch>.<project>.pages.dev` chỉ được đọc API danh mục công khai; API nhận phiếu, đăng nhập và dữ liệu riêng tư bị chặn. Quy tắc này cũng áp dụng cho link hash của một bản deploy Production.

Lớp chặn trong code không thay thế việc tách môi trường: dùng D1 riêng cho Preview, hoặc tắt build Preview nếu chưa cần. Đặc biệt không gắn custom domain cho Preview dùng D1 production. Có thể bật Cloudflare Access cho Preview trong dashboard. Các bản deploy cũ giữ code cũ, nên cần kiểm soát truy cập hoặc dọn các bản cũ không còn dùng. Không cấp production binding/secret cho code hoặc nhánh không tin cậy.

## Cấu hình tài khoản và dữ liệu

1. Bật xác minh hai bước cho các tài khoản quản lý GitHub, Cloudflare và Google/Firebase. Dùng mật khẩu admin riêng, đủ dài; chỉ cấp quyền quản trị cho người cần xử lý yêu cầu.
2. Firebase chỉ authorized các domain thực sự sử dụng. Giới hạn API key theo các API Firebase cần dùng; cấu hình web Firebase là công khai, khác với service-account private key hoặc token quản trị. Không đưa private key, token Cloudflare, mật khẩu hay `.env` lên Git.
3. Giữ `data/`, database, file tạo admin và bản sao lưu ngoài Git/public. Chỉ public output của `build:pages` hoặc `build:stem`. Sao lưu D1 theo nhu cầu vận hành và kiểm tra việc khôi phục, hạn chế người được truy cập dữ liệu phụ huynh.
4. Nếu bị spam phân tán, bổ sung Turnstile có xác minh token phía server và/hoặc quy tắc Cloudflare phù hợp. Rate limit trong ứng dụng không đủ để chặn mọi mạng bot. Turnstile hiện chưa được cài hoặc bật bởi thay đổi này.

## Khi nghi ngờ lộ tài khoản admin

Đổi mật khẩu và kiểm tra quyền truy cập Firebase/D1. Cookie admin D1 độc lập với ID token khách hàng: đổi mật khẩu Firebase không tự hủy các cookie admin đã cấp. Có thể buộc tất cả phiên admin đăng xuất bằng lệnh sau từ thư mục gốc, rồi đăng nhập lại trên thiết bị tin cậy:

```bash
npx wrangler d1 execute le-nga-books --remote --command="DELETE FROM admin_sessions;"
```

Lệnh này chỉ thu hồi phiên đăng nhập, không xóa đơn sách hoặc yêu cầu tư vấn. Nếu token Cloudflare hay service-account private key bị lộ, thu hồi/thay thế tại nơi cấp; xóa khỏi commit hiện tại không thu hồi được thông tin trong lịch sử Git.

## Kiểm tra trước khi cập nhật

```bash
npm test
npm run test:ui
npm audit --audit-level=moderate
npm --prefix stem-maths audit --audit-level=moderate
```

Hai project khóa dependency bằng lockfile. `overrides.undici` chọn dòng 7 đã có bản vá từ 7.30.1, tránh hạ Wrangler bằng `npm audit fix --force`. Chạy audit định kỳ vì kết quả thay đổi khi có advisory mới. Sau commit/push cần deploy lại cả hai project; không cần migration D1 mới cho những thay đổi bảo mật này. Các kiểm tra local không xác nhận được trạng thái MFA, quyền dashboard, Google login thật hoặc các bản deploy cũ.

Tài liệu: [Pages headers](https://developers.cloudflare.com/pages/configuration/headers/), [Preview và Access](https://developers.cloudflare.com/pages/configuration/preview-deployments/), [Firebase session revocation](https://firebase.google.com/docs/auth/admin/manage-sessions), [bản vá undici](https://github.com/advisories/GHSA-xjj6-f33q-929c).
