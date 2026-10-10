# CLB Toán Cô Lê Nga

Landing page bán 10 đầu sách, đặt sách COD và gửi yêu cầu tư vấn. Dữ liệu lưu trong SQLite; frontend và API chạy chung bằng Node.js.

## Chạy dự án

Cần Node.js **22.13 trở lên** (máy hiện tại có Node.js 24). Không cần cài thêm package.

```powershell
npm run db:init
npm start
```

Mở `http://localhost:3000`. Không mở trực tiếp `index.html` bằng `file://`, vì trang cần gọi API.

Database tự tạo ở `data/landing.sqlite`, gồm 15 bảng và dữ liệu mẫu 10 sách với ảnh bìa trong `public/assets/books`. `npm start` cũng tự khởi tạo nếu chưa có database.

## Trang quản trị

Chạy `npm run admin:create` trong terminal để tự đặt tên đăng nhập và mật khẩu (tối thiểu 15 ký tự). Khởi động lại server rồi mở `http://localhost:3000/admin` để quản lý đơn sách và yêu cầu tư vấn. Dùng `npm run admin:reset` nếu cần đặt lại mật khẩu. Xem [ADMIN.md](ADMIN.md) để biết cách sử dụng và cấu hình triển khai.

## Biến môi trường

- `PORT`: cổng server, mặc định `3000`.
- `DATABASE_PATH`: đường dẫn SQLite, mặc định `data/landing.sqlite`.
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
