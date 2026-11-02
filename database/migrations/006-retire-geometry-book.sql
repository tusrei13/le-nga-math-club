-- Retire the removed book without losing historical order items.
UPDATE products SET active=0, updated_at=CURRENT_TIMESTAMP
WHERE id='200-bai-hinh-vao-6'
AND NOT EXISTS (SELECT 1 FROM schema_versions WHERE version=6);
DELETE FROM product_media
WHERE product_id='200-bai-hinh-vao-6' AND kind='cover'
AND NOT EXISTS (SELECT 1 FROM schema_versions WHERE version=6);
INSERT OR IGNORE INTO schema_versions(version) VALUES(6);
