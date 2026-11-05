# Danh mục theo bản mẫu tháng 11/2026

Nguồn đối chiếu: bản HTML mẫu và tài nguyên người dùng cung cấp tháng 11/2026. Nội dung chạy thật nằm trong reference-catalog.mjs, index.html, catalog-ui.js và migration 010; tài nguyên cần cho website được lưu tại public/assets/catalog. Thư mục mẫu gốc đã xóa, không cần cho build và được bỏ qua trong Git.

## Danh mục và giá

Có 21 mục: 9 sản phẩm sách giấy (4 tập Siêu nhân, 70 đề, 4 bộ Phân dạng lớp 6–9) và 12 mục tài liệu lớp 3–5. Một mục có thể là một cuốn, một bộ hoặc combo; không so số mục này với số tập sách.

- Phân dạng Toán 6, 7, 8: 269.000đ/bộ 2 tập, giá gốc 299.000đ; ưu đãi đến hết 30/11/2026 giờ Việt Nam.
- Phân dạng Toán 9 và bộ Siêu nhân: Liên hệ theo mẫu, không nhận đơn có giá chưa xác định.
- 70 đề bứt tốc: 249.000đ/cuốn, miễn phí vận chuyển khi đặt trước. Đơn có thêm sách khác vẫn được CLB xác nhận phí giao hàng; không quảng cáo freeship toàn bộ danh mục.
- Toán 3 theo tuần: 49.000đ/quyển hoặc 149.000đ/bộ 4 quyển.
- Toán 5 Bộ 1: 199.000đ/bộ, mua lẻ 79.000đ/tập qua trợ lí; Bộ 2: 149.000đ/bộ; combo: 299.000đ.
- Các giá, quy cách và mô tả khác theo reference-catalog.mjs. Mục chưa xác định là sách giấy hay PDF được ghi liên hệ để xác nhận hình thức nhận.

Các ưu đãi có giá gốc được gắn thời hạn tháng 11/2026 theo tiêu đề chương trình trong mẫu; riêng bộ 10 đề Toán 3 đến hết 15/12/2026. Hết hạn, server trả về giá gốc và bỏ nhãn giảm giá. Giá quản trị chỉnh khác giá ưu đãi được giữ nguyên.

## Đặt hàng và bản đọc thử

- Chỉ sách giấy có giá xác định mới đặt được bằng form COD hiện tại; giá được tính phía server.
- PDF đầy đủ và mục cần báo giá đặt qua Zalo trợ lí 0365 473 632. Trợ lí xác nhận giá, thanh toán và cách gửi file; chưa có cổng thanh toán hoặc giao PDF tự động.
- PDF đọc thử mở miễn phí, không yêu cầu đăng nhập hoặc thanh toán. Tệp công khai trong public/assets/catalog đều là tài nguyên mẫu, ảnh hoặc video được cung cấp trong nguồn.
- Kho 17 nhóm / 31 PDF đọc thử hiện có được giữ lại. Danh mục tài liệu đầy đủ phân trang 6 mục/trang.
- Không khôi phục Supabase, bucket riêng hoặc các API thanh toán/ký link đã ngừng hoạt động.
- Bản mẫu còn thiếu cách nhận đáp án Siêu nhân và cách giao PDF sau mua: giao diện hướng dẫn liên hệ trợ lí, không tự điền một quy trình chưa có.

## Dữ liệu và lịch sử

Migration 010 thêm các ID bộ Phân dạng riêng và ngừng bán 8 ID sách lẻ trước đây; không đổi tên/giá trong order_items hoặc xóa đơn cũ. Chạy lại không ghi đè chỉnh sửa quản trị.

Do bảng products cũ yêu cầu giá dương, các mục hỏi giá giữ giá lưu trữ tương thích, nhưng API luôn trả price_vnd=null và orderable=false theo danh mục chuẩn. Không dùng giá lưu trữ đó để hiển thị hoặc nhận đơn. Các tài liệu PDF cũng không được nhận vào form COD dù có giá niêm yết.

SQLite tự cập nhật khi khởi động. D1 đã deploy cần áp dụng migration bên dưới; chỉ thay HTML sẽ không cập nhật dữ liệu D1.

## Triển khai

1. Commit/push code cùng public/assets/catalog và các file mới; build trang sách bằng npm run build:pages và STEM bằng npm run build:stem.
2. Khi bản build đã thành công, chạy từ thư mục gốc:
   npx wrangler d1 execute le-nga-books --remote --file=database/migrations/010-reference-catalog.sql
3. Kiểm tra /api/landing có 21 mục, giá bộ lớp 6 là 269000 trong thời gian ưu đãi, các mục hỏi giá có price_vnd=null; thử đơn 70 đề và bộ lớp 6.
4. Kiểm tra số trợ lí, liên kết Zalo, ba PDF đọc thử của bộ Toán 6 và hai video bổ sung. STEM phải có ảnh tác giả và thông tin lớp học mới.

## Kiểm tra

npm test
npm run test:ui:reference
npm run test:ui
npm run test:ui:videos
npm run test:ui:digital

Ảnh kiểm tra tham chiếu được lưu dưới data/reference-*.png (không commit).
