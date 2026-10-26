# STEM Maths: chương trình Toán offline lớp 3–9

Website mới ở thư mục `stem-maths/`, độc lập với giao diện bán sách. Hai website dùng chung D1 và trang quản trị tại `https://le-nga-books.pages.dev/admin`.

## Chạy trên máy

Tại thư mục gốc repository:

```powershell
npm ci
npm start
```

Mở `http://localhost:3000/stem/`. Database local tự thêm các bảng STEM. Không cần Firebase để gửi yêu cầu tư vấn. Trang quản trị local dùng tài khoản admin local như trước.

```powershell
npm run build:stem
```

Output nằm ở `stem-maths/dist-stem/`. Chỉ upload output, không upload nguồn hoặc database.

## Sửa lỗi Cloudflare `Missing script: build:stem`

Commit/push bản code này trước. Trong project **stem-maths-co-nga → Settings → Builds & deployments → Build configuration**, đặt:

- Production branch: `main`.
- Root directory: **`stem-maths`**.
- Framework preset: `None`.
- Build command: **`npm run build:stem`**.
- Build output directory: **`dist-stem`**.
- Biến build `NODE_VERSION`: **`24`**.

Root directory rất quan trọng: project mới phải đọc `stem-maths/wrangler.toml`, không đọc `wrangler.toml` của trang sách. Subproject có `package.json` và lockfile riêng để Cloudflare cài đúng dependency. Sau khi code mới có trên GitHub, nhấn Retry deployment.

`stem-maths/wrangler.toml` khai báo tên project, `nodejs_compat` và D1 binding `DB` dùng database `le-nga-books`. Nếu chuyển tài khoản/database, cập nhật ID D1 trong file này. Không cần thêm Firebase hoặc cấp lại quyền admin.

## Khởi tạo D1 dùng chung

Trước khi nhận yêu cầu thật, chạy tại thư mục gốc:

```powershell
npx wrangler d1 execute le-nga-books --remote --file=database/migrations/005-stem-maths.sql
```

Migration thêm chương trình, yêu cầu tư vấn và lịch sử xử lý, không sửa đơn sách. Chạy lại an toàn. Đồng thời deploy bản code mới của trang sách để admin có tab STEM Maths. Form cần D1 đã khởi tạo mới hoạt động.

Nếu gặp `too many terms in compound SELECT`, dùng bản migration mới đã tách dữ liệu chương trình thành từng lệnh `INSERT OR IGNORE`, rồi chạy lại lệnh trên. Không cần xóa database. Các chương trình đã có và yêu cầu tư vấn được giữ nguyên khi chạy lại.

## Chức năng

- Bốn nhu cầu cho lớp 3–9: củng cố, cơ bản, nâng cao, bồi dưỡng HSG.
- Mục tiêu thi chuyên chỉ dành cho lớp 6–9, kiểm tra ở cả trình duyệt và server.
- Form đồng bộ chương trình đang chọn, yêu cầu đồng ý cho CLB liên hệ.
- Mã yêu cầu riêng, chống gửi trùng, giới hạn 20 lần/IP/15 phút.
- Admin có tab STEM Maths: tìm kiếm, lọc, ghi chú nội bộ, lịch sử và chuyển trạng thái Mới → Đã liên hệ → Đang tư vấn → Đã xếp lớp/Đã hủy.
- Dùng phiên admin và CSRF hiện có. API công khai không cho đọc danh sách phụ huynh.

Các mục chương trình là nhóm nhu cầu để tư vấn, không phải danh sách lớp đang khai giảng hoặc xác nhận còn chỗ. Website không tự đặt học phí, lịch học, sĩ số hay cam kết học thử miễn phí. CLB cần xác nhận trước khi công bố. Chưa có gửi email/Zalo tự động hoặc nhận thanh toán học phí.

## Kiểm tra sau deploy

1. `/healthz` trên STEM trả `status: ok`.
2. `/api/stem/programs` có 28 chương trình (7 khối × 4 nhu cầu).
3. Chọn lớp 3 không có mục tiêu thi chuyên; lớp 7 có thể bật mục tiêu này.
4. Gửi yêu cầu thử; mở admin trang sách → STEM Maths để tìm phiếu.
5. Lưu ghi chú và chuyển trạng thái.

Trang sách giữ lệnh `npm run check:pages && npm run build:pages`, Root directory mặc định và output `dist`.

Tham khảo: [Cloudflare Pages monorepos](https://developers.cloudflare.com/pages/configuration/monorepos/), [D1 bindings](https://developers.cloudflare.com/pages/functions/bindings/).
