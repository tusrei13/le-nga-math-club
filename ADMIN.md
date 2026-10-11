# Trang quản trị CLB Toán Cô Lê Nga

Địa chỉ: **http://localhost:3000/admin**. Trang có đăng nhập, danh sách đơn sách/tư vấn, tìm theo tên/điện thoại/mã, lọc trạng thái, phân trang, xem chi tiết và lịch sử, cập nhật trạng thái, các số đếm cần xử lý và đăng xuất.

## Bắt đầu

Nếu server đang chạy bản cũ, nhấn **Ctrl + C** trong terminal đó. Tại thư mục dự án, chạy:

```powershell
npm run admin:create
```

Nhập tên đăng nhập, hoặc Enter để dùng `admin`. Sau đó nhập mật khẩu 15–256 ký tự và nhập lại để xác nhận. Mật khẩu không hiện trong terminal. Dùng một cụm từ dễ nhớ nhưng riêng tư; không truyền mật khẩu trong tham số lệnh hoặc commit vào Git.

```powershell
npm start
```

Mở `/admin`, đăng nhập bằng tài khoản vừa tạo. Khi chưa có tài khoản, trang chỉ hiện hướng dẫn tạo tài khoản. Không có mật khẩu mặc định hoặc API đăng ký công khai. Không cần `ADMIN_API_TOKEN` để đăng nhập trên giao diện.

Lệnh tạo tài khoản dùng cùng `DATABASE_PATH` với server. Nếu dùng database tùy chỉnh, đặt biến này trước khi chạy cả hai lệnh. Có thể tạo thêm tài khoản bằng cách chạy lại lệnh với tên khác.

## Cách xử lý yêu cầu

Thanh điều hướng navy phía trên cho phép chuyển giữa Đơn sách và Tư vấn; mục đang chọn có dấu trang vàng. Tên tài khoản, chữ cái đại diện, liên kết “Xem trang bán sách” và nút “Đăng xuất” được hiển thị trực tiếp trên thanh này.

Trên máy tính, danh sách phiếu nằm bên trái và chi tiết được mở ngay bên phải. Phiếu hiển thị bìa sách, tổng tiền và trạng thái; đơn mới có vạch vàng. Trên điện thoại, chọn “Mở phiếu” để xem chi tiết toàn màn hình, rồi bấm “Đóng” để quay về danh sách.

- **Đơn sách:** xem họ tên, điện thoại, lớp, địa chỉ, ghi chú, từng cuốn/số lượng/giá, quà tặng, tổng tiền và lịch sử. Chuyển lần lượt Mới nhận → Chờ giao → Đang giao → Hoàn tất. Có thể hủy khi đang Mới nhận hoặc Chờ giao.
- **Tư vấn:** xem thông tin phụ huynh và ghi chú. Chuyển Chưa liên hệ → Đã liên hệ → Đã tư vấn. Có thể hủy trước khi kết thúc.
- **Tìm kiếm:** tên, số điện thoại hoặc mã yêu cầu; có thể kết hợp lọc trạng thái. Dòng nhắc việc mở nhanh các đơn chờ xác nhận, đơn đang giao và tư vấn mới.
- **Làm mới:** lấy các đơn/tư vấn và số đếm mới nhất. Trang hiện chưa gửi thông báo email hoặc tự cập nhật nền.

Khi nhiều người cùng xử lý, frontend gửi `expected_status`; nếu trạng thái đã thay đổi, server trả 409 để tránh ghi đè dựa trên thông tin cũ. Đóng chi tiết rồi mở lại để lấy trạng thái mới.

## Đặt lại mật khẩu

```powershell
npm run admin:reset
```

Nhập tên tài khoản hiện có và mật khẩu mới. Việc đặt lại mật khẩu thu hồi tất cả phiên của tài khoản đó. Chưa có chức năng quên mật khẩu qua email; người có quyền chạy lệnh trên máy chủ thực hiện việc khôi phục.

## Lưu trữ và phiên đăng nhập

Migration `database/admin-schema.sql` bổ sung `admin_users` và `admin_sessions`, nâng schema lên v2, tổng cộng 15 bảng. Đơn hàng và dữ liệu cũ vẫn giữ nguyên khi khởi tạo lại.

Mật khẩu dùng scrypt với salt ngẫu nhiên; database không lưu mật khẩu nguyên văn. Cookie phiên `HttpOnly`, `SameSite=Strict`; token phiên trong database được lưu dưới dạng hash. Phiên có hạn tối đa 8 giờ và kết thúc sau 30 phút không có yêu cầu xác thực. Tải lại trang vẫn đăng nhập nếu phiên còn hiệu lực. Đăng xuất thu hồi phiên trên server.

Các thao tác thay đổi bằng cookie cần `X-CSRF-Token` và nguồn cùng website. Frontend giữ token xác nhận trong bộ nhớ, không lưu mật khẩu hoặc token đăng nhập vào localStorage. Login bị giới hạn sau 5 lần sai trong 15 phút theo IP; bộ đếm này nằm trong tiến trình và mất khi server khởi động lại.

Khi triển khai thật, phục vụ trang qua **HTTPS** và đặt `NODE_ENV=production` để cookie có cờ `Secure`; hoặc đặt `ADMIN_COOKIE_SECURE=true` nếu môi trường chạy dùng tên khác. Nếu thử bằng HTTP localhost, để chế độ phát triển. `ADMIN_API_TOKEN` vẫn được hỗ trợ riêng cho tích hợp API cũ, không được đưa vào mã frontend.

Thiết kế mật khẩu và cookie tham khảo [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) và [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).

## API mới

| Method | Endpoint | Mục đích |
| --- | --- | --- |
| GET | `/api/auth/session` | Trạng thái phiên, tên tài khoản và CSRF token nếu đã đăng nhập |
| POST | `/api/auth/login` | `{ "username": "...", "password": "..." }`; trả cookie phiên |
| POST | `/api/auth/logout` | Thu hồi phiên; yêu cầu CSRF khi dùng cookie |
| GET | `/api/admin/summary` | Số lượng theo trạng thái cho đơn và tư vấn |
| GET | `/api/admin/orders/:id` | Đơn, sách, quà, lịch sử và trạng thái tiếp theo |
| GET | `/api/admin/consultations/:id` | Tư vấn, lịch sử và trạng thái tiếp theo |

API danh sách nhận thêm `q` và `status`, cùng `limit`, `offset`. API cập nhật trạng thái nhận thêm `expected_status`. Tất cả dữ liệu cá nhân cần phiên đăng nhập hoặc Bearer token hợp lệ.

## Kiểm tra

`npm test` bao gồm kiểm tra tài khoản/phiên, đăng nhập sai, cookie, chống CSRF, nguồn ngoài, giới hạn đăng nhập, đăng xuất, hạn phiên, bộ lọc và xung đột trạng thái. `npm run test:ui` kiểm tra bằng trình duyệt ẩn việc đăng nhập, tìm kiếm, xem chi tiết, đổi trạng thái, tải lại trang và đăng xuất, trên desktop/mobile. Các kiểm tra dùng database tạm; tài khoản test không được tạo trong database thật.
