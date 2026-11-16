-- Migration 012: đổi ảnh bìa Bộ Phân dạng Toán 9 sang ảnh thấy rõ mặt cô Nga.
-- Ảnh cũ bia-phan-dang-toan-9.jpg bị cắt mất nửa khuôn mặt ở mép trái.
-- An toàn khi chạy lại: chỉ đổi khi ảnh hiện tại vẫn là ảnh cũ; ảnh quản trị đã thay được giữ nguyên.
-- Với D1: deploy code và public/assets trước, rồi chạy:
--   npx wrangler d1 execute le-nga-books --remote --file=database/migrations/012-phan-dang-9-cover.sql

UPDATE product_media
SET url = '/assets/catalog/co-le-nga-voi-phan-dang-toan-9.jpg',
    alt = 'Cô Lê Nga giới thiệu Bộ Phân dạng Toán 9 (Tập 1 + Tập 2)'
WHERE product_id = 'phan-dang-9-bo-2-tap'
  AND kind = 'cover'
  AND url = '/assets/catalog/bia-phan-dang-toan-9.jpg'
  AND NOT EXISTS (SELECT 1 FROM schema_versions WHERE version = 12);

INSERT OR IGNORE INTO schema_versions(version) VALUES(12);
