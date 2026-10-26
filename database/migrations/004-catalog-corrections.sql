-- Apply once. Existing orders retain their original price snapshots.
UPDATE products SET price_vnd=299000,updated_at=CURRENT_TIMESTAMP
WHERE id IN ('toan-6-tap-1','toan-6-tap-2','toan-7-tap-1','toan-7-tap-2','toan-8-tap-1','toan-8-tap-2','toan-9-tap-1','toan-9-tap-2','70-de-vao-6','200-bai-hinh-vao-6')
AND NOT EXISTS (SELECT 1 FROM schema_versions WHERE version=4);
UPDATE site_content SET value_json=json_set(value_json,'$.shipping_vnd',0,'$.gifts_with_order',json('false'),'$.delivery_days','','$.return_days',0,'$.price_note','299.000đ/cuốn. Phí vận chuyển được CLB xác nhận riêng.'),updated_at=CURRENT_TIMESTAMP
WHERE key='sales_policy' AND NOT EXISTS (SELECT 1 FROM schema_versions WHERE version=4);
UPDATE site_content SET value_json=json_set(value_json,'$.qualification','','$.experience_years',0,'$.quote',''),updated_at=CURRENT_TIMESTAMP
WHERE key='author' AND NOT EXISTS (SELECT 1 FROM schema_versions WHERE version=4);
UPDATE gifts SET active=0 WHERE id IN ('video','zalo','practice') AND NOT EXISTS (SELECT 1 FROM schema_versions WHERE version=4);
UPDATE testimonials SET published=0 WHERE is_composite=1 AND NOT EXISTS (SELECT 1 FROM schema_versions WHERE version=4);
UPDATE achievements SET published=0 WHERE is_composite=1 AND NOT EXISTS (SELECT 1 FROM schema_versions WHERE version=4);
UPDATE faqs SET answer='Phụ huynh nên xem trang mẫu và liên hệ CLB để chọn sách phù hợp với kiến thức hiện tại của con.' WHERE id='foundation' AND NOT EXISTS (SELECT 1 FROM schema_versions WHERE version=4);
UPDATE faqs SET answer='Vui lòng liên hệ CLB để xác nhận nội dung lời giải và tài liệu đi kèm của cuốn sách bạn chọn.' WHERE id='solutions' AND NOT EXISTS (SELECT 1 FROM schema_versions WHERE version=4);
UPDATE faqs SET answer='CLB sẽ xác nhận phí vận chuyển và thời gian giao theo địa chỉ nhận sách trước khi gửi đơn.' WHERE id='delivery' AND NOT EXISTS (SELECT 1 FROM schema_versions WHERE version=4);
INSERT OR IGNORE INTO schema_versions(version) VALUES(4);
