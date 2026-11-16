-- Migration 011: rút gọn nội dung trang chủ (câu mô tả đầu trang và một số câu trả lời FAQ).
-- An toàn khi chạy lại: mỗi câu chỉ đổi khi nội dung hiện tại còn đúng bản cũ của migration 010 / seed.
-- Nếu quản trị đã sửa nội dung, câu đó không khớp nên được giữ nguyên.
-- Với D1: deploy code trước, rồi chạy: npx wrangler d1 execute le-nga-books --remote --file=database/migrations/011-tighten-homepage-copy.sql

UPDATE site_content
SET value_json = json_set(value_json, '$.description', 'Sách và phiếu luyện Toán do Thạc sĩ Lê Thị Nga biên soạn, cùng lớp học trực tiếp tại CLB.'),
    updated_at = CURRENT_TIMESTAMP
WHERE key = 'hero'
  AND json_extract(value_json, '$.description') IN (
    'Phiếu luyện tập theo tuần, bộ đề và sách Phân dạng do Thạc sĩ Lê Thị Nga biên soạn, giúp con vững nền tảng, rèn tư duy và tự tin ôn thi trường Chất lượng cao.',
    'Phiếu luyện tập theo tuần, bộ đề và sách Phân dạng do Thạc sĩ Lê Thị Nga biên soạn — giúp con vững nền tảng, rèn tư duy và tự tin ôn thi trường Chất lượng cao.',
    'Giúp con lấy lại gốc, rèn tư duy và tự tin ôn thi HSG, trường Chất lượng cao, trường Chuyên.'
  )
  AND NOT EXISTS (SELECT 1 FROM schema_versions WHERE version = 11);

UPDATE faqs
SET answer = 'Phân dạng Toán 6–9: sách học sinh không kèm đáp án, phụ huynh nhận file đề và đáp án. 70 đề bứt tốc có đáp án qua mã QR trong sách. Toán 3 Nâng cao và bộ 10 đề có đáp án. Bộ Em là siêu nhân: trợ lí xác nhận cách nhận đáp án.'
WHERE id = 'solutions'
  AND answer = 'Phân dạng Toán 6–9: sách học sinh không kèm đáp án; phụ huynh nhận file mềm đầy đủ đề và đáp án. 70 đề bứt tốc: đáp án chi tiết nhận qua mã QR trong sách. Toán 3 Nâng cao theo tuần và bộ 10 đề học kì I có đáp án. Liên hệ trợ lí để xác nhận cách nhận đáp án của bộ Em là siêu nhân.'
  AND NOT EXISTS (SELECT 1 FROM schema_versions WHERE version = 11);

UPDATE faqs
SET answer = 'Bản đọc thử tải miễn phí trên website. Muốn mua bản đầy đủ, nhắn Zalo trợ lí 0365 473 632 để xác nhận giá và cách nhận file.'
WHERE id = 'digital-delivery'
  AND answer = 'Bản đọc thử được xem và tải miễn phí trên website. Để mua tài liệu đầy đủ, nhắn Zalo trợ lí 0365 473 632 để xác nhận giá, thanh toán và cách nhận file trước khi mua.'
  AND NOT EXISTS (SELECT 1 FROM schema_versions WHERE version = 11);

UPDATE faqs
SET answer = 'Xem bản đọc thử, rồi nhắn trợ lí 0365 473 632 hoặc gọi cô Nga để được tư vấn đúng kiến thức hiện tại của con.'
WHERE id = 'foundation'
  AND answer = 'Xem bản đọc thử rồi gọi cô Nga 0989 066 885 hoặc trợ lí 0365 473 632 để được tư vấn tài liệu phù hợp với kiến thức hiện tại của con.'
  AND NOT EXISTS (SELECT 1 FROM schema_versions WHERE version = 11);

UPDATE faqs
SET answer = 'CLB dạy trực tiếp lớp 3–9 tại Geleximco, Lê Trọng Tấn. Gửi đăng ký tư vấn để CLB xác nhận lớp, lịch và học phí.'
WHERE id = 'offline'
  AND answer = 'CLB dạy trực tiếp cho học sinh lớp 3–9 tại Geleximco, Lê Trọng Tấn. Đăng ký tư vấn trên trang STEM Maths để CLB xác nhận lớp, lịch và học phí trước khi học.'
  AND NOT EXISTS (SELECT 1 FROM schema_versions WHERE version = 11);

INSERT OR IGNORE INTO schema_versions(version) VALUES(11);
