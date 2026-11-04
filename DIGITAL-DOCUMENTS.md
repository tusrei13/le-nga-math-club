# Tài liệu số: bản đọc thử công khai

Tất cả 29 PDF trong `public/assets/documents/previews/` là bản đọc thử đã được chủ CLB cho phép chia sẻ công khai. Không phải bản đầy đủ để bán. Danh mục có 15 nhóm, bao gồm nhóm Toán 3 quyển 1–4.

## Cách hoạt động

- Khách mở **Đọc thử PDF** ngay, không cần đăng nhập, tài khoản, chuyển khoản hoặc quyền tải.
- Bộ nhiều file mở danh sách để chọn từng bản; bộ một file mở PDF trong tab mới.
- Giữ bộ lọc lớp và phân trang 6 nhóm/trang.
- Không hiển thị giá tạm hay nút mua cho bản đọc thử.
- URL file là công khai. Ai có đường dẫn đều xem/tải được.
- Không gọi Supabase và không cần SUPABASE_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY hoặc SUPABASE_URL.

## Cấu trúc và cập nhật

Giữ PDF trong `public/assets/documents/previews/lop-N/ten-bo/`.
Danh mục và ánh xạ từng file nằm trong `digital-catalog.mjs`: id, lớp, tên, số file, nhãn file, URL public và dung lượng.
Khi thêm/thay file, cập nhật danh mục tương ứng rồi commit PDF cùng code.

Build kiểm tra file có thật, định dạng PDF và giới hạn 25 MiB mỗi file. File trong `public/` được chép vào `dist/` khi build Pages.

## Triển khai thay đổi này

1. Commit và push code cùng thư mục PDF; Cloudflare Pages trang sách build như cũ.
2. Không cần chạy migration database mới. Đọc thử không phụ thuộc bảng tài liệu của migration 008.
3. Nếu đã gỡ khóa Supabase, giữ nguyên trạng thái đó. Nếu còn khóa, xóa khỏi Variables and Secrets của Pages rồi deploy lại; thu hồi khóa ở Supabase nếu không có ứng dụng khác sử dụng.
4. Kiểm tra một nhóm nhiều file, một nhóm một file và bộ lọc lớp trên website sau deploy.

Không đổi bucket sang Public; website dùng các bản PDF đã chép vào public. Chưa cần xóa bucket hoặc project.

## Đơn tài liệu cũ

Bảng đơn cũ được giữ nguyên để tra cứu trong admin. Trang quản trị hiển thị danh sách bản đọc thử và lịch sử đơn cũ; không còn form nhận tiền, mở bán hay đường dẫn bucket.

API tạo đơn tài liệu và API cấp link tải riêng tư trả HTTP 410. Admin không thể xác nhận thanh toán mới; chỉ có thể hủy đơn chờ hoặc thu hồi trạng thái quyền cũ. Không có yêu cầu ký link Supabase, kể cả khi secret cũ còn tồn tại.

Nếu đã có người thanh toán thật, chủ CLB cần liên hệ xử lý riêng; việc đổi sang đọc thử không tự hoàn tiền.

Migration 008 là lịch sử schema, không sửa hoặc xóa dữ liệu đơn đã có. Khi sau này có bản đầy đủ để bán, phải xây lại luồng bán với đúng file, giá và kho riêng tư; không dùng PDF đọc thử làm bản đầy đủ.

## Kiểm tra

```powershell
npm test
npm run test:ui
npm run test:ui:digital
npm run build:pages
```
