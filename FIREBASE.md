# Tài khoản khách hàng: email/mật khẩu và Google

Khách hàng dùng Firebase Authentication; chủ CLB dùng trang `/admin` với quyền cấp riêng trong D1. Mật khẩu admin tự đặt cũng được Firebase xác thực, nhưng khách đăng nhập không tự có quyền quản trị. Firebase lưu thông tin xác thực và mật khẩu; SQLite/D1 lưu liên kết UID với đơn hàng và D1 lưu quyền admin. Người chưa đăng nhập vẫn đặt sách như trước. Không tự gắn đơn cũ dựa vào số điện thoại hoặc email.

## Tạo Firebase (không cần Firestore)

1. Mở [Firebase Console](https://console.firebase.google.com/), tạo project cho CLB. Google Analytics không bắt buộc; có thể tắt. Firebase Authentication hỗ trợ gói Spark cho các phương thức này, nhưng có hạn mức riêng cho gửi email và xác thực; kiểm tra dashboard trước khi mở bán.
2. Project settings → General → Your apps → chọn biểu tượng Web `</>`, đăng ký ứng dụng. Không cần Firebase Hosting vì website chạy trên Cloudflare Pages.
3. Sao chép ba giá trị của web config: `apiKey`, `projectId`, `authDomain` (thường là `PROJECT_ID.firebaseapp.com`). Đây là cấu hình web công khai, không phải khóa service account. Không đưa private key/service account JSON vào frontend hoặc Git.
4. Build → Authentication → Get started → Sign-in method: bật **Email/Password** và **Google**. Với Google, chọn email hỗ trợ rồi lưu.
5. Authentication → Settings → Authorized domains: thêm tên miền Pages thật, ví dụ `le-nga-books.pages.dev`, và tên miền riêng nếu có. Thêm `localhost` khi thử trên máy; dự án mới không mặc định cho phép localhost. Tránh bật Google trên các preview domain chưa được duyệt.
6. Authentication → Settings: bật chính sách mật khẩu tối thiểu **12 ký tự** và bảo vệ chống dò email nếu giao diện cung cấp. Trong Templates, chỉnh tên người gửi, nội dung email xác minh/đặt lại mật khẩu và action URL về website thật theo hướng dẫn Firebase.

Không cần tạo OAuth client riêng hoặc lấy Google client secret nếu dùng Firebase Google provider. Popup Google được quản lý bởi Firebase SDK. Bật popup cho trang nếu trình duyệt chặn.

## Cấu hình Cloudflare Pages

Vì dự án dùng `wrangler.toml`, file này là nguồn cấu hình chính. Điền ba giá trị trong phần `[vars]`:

```text
FIREBASE_API_KEY = "giá trị apiKey"
FIREBASE_PROJECT_ID = "giá trị projectId"
FIREBASE_AUTH_DOMAIN = "giá trị authDomain"
```

Đây là cấu hình web public, có thể commit; không thêm service-account private key. Không đặt `FIREBASE_AUTH_DOMAIN` thành tên miền Pages; dùng authDomain chính Firebase cung cấp. Chạy `npm run check:pages` rồi redeploy để Function nhận cấu hình. Không sửa cùng các biến này ở dashboard vì Wrangler là nguồn cấu hình chính. Với preview dùng Firebase/D1 riêng và khai báo đầy đủ binding lẫn vars khi override environment. [Wrangler configuration](https://developers.cloudflare.com/pages/functions/wrangler-configuration/).

Với D1 đã tạo trước khi có tính năng này, bổ sung bảng liên kết:

```powershell
npx wrangler d1 execute le-nga-books --remote --file=database/customer-schema.sql
npm run pages:deploy
```

Database mới được khởi tạo từ `cloudflare/init.sql` đã có bảng này. API `/api/customer/config` trả cấu hình public; `/api/customer/me` và `/api/customer/orders` yêu cầu Firebase ID token. Server kiểm tra project và xác minh token qua Firebase, không tin UID do trình duyệt tự gửi.

## Chạy Node local

Đặt biến vào terminal trước khi chạy; `npm start` không tự đọc `.env`:

```powershell
$env:FIREBASE_API_KEY='apiKey của bạn'
$env:FIREBASE_PROJECT_ID='projectId của bạn'
$env:FIREBASE_AUTH_DOMAIN='projectId.firebaseapp.com'
npm start
```

Có thể lưu cấu hình vào `.env` (đã được Git ignore) và dùng `node --env-file=.env server.mjs`. Khởi động local tự tạo bảng `customer_orders`; không xóa dữ liệu cũ.

## Kiểm tra

Tạo tài khoản bằng email, kiểm tra email xác minh, đăng xuất và đăng nhập lại. Thử Google với tên miền đã authorized. Bấm “Quên mật khẩu” sau khi nhập email để nhận liên kết reset. Email đã tồn tại nên đăng nhập hoặc reset; nếu tài khoản Google trùng email, Firebase có thể yêu cầu xác thực lại bằng phương thức cũ; hệ thống không tự liên kết tài khoản dựa vào email.

Đặt một đơn khi đăng nhập, rồi mở “Tài khoản” → “Đơn sách của tôi”. Đăng nhập tài khoản khác phải không thấy đơn này; đơn đặt khi chưa đăng nhập không xuất hiện trong lịch sử tài khoản. Lịch sử hiển thị tối đa 50 đơn mới nhất. Chưa bắt buộc email verified để đặt sách; Google thường cung cấp email đã xác minh. Đăng xuất xóa phiên Firebase trên trình duyệt, không ảnh hưởng phiên admin.

Khi Firebase chưa cấu hình, hộp đăng nhập báo chưa sẵn sàng; đặt sách trực tiếp vẫn hoạt động. Kiểm thử tự động kiểm tra phân quyền và token lỗi bằng fixture, nhưng đăng nhập Google thật, email xác minh/reset chỉ kiểm tra được sau khi bạn tạo project và cấu hình dịch vụ.

Nguồn: [Firebase web setup](https://firebase.google.com/docs/auth/web/start), [Google sign-in](https://firebase.google.com/docs/auth/web/google-signin), [Email/password](https://firebase.google.com/docs/auth/web/password-auth), [Auth REST API](https://firebase.google.com/docs/reference/rest/auth).
