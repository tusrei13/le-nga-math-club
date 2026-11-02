-- Set the nine book-specific reading samples once; retain later admin changes.
-- Deploy the PDF assets before applying this file to a live D1 database.
INSERT INTO product_media(product_id,kind,url,alt)
SELECT id,'sample','/assets/books%20preview/PHAN%20DANG%20TOAN%206-TAP1-BAN-DOC-THU.pdf','Bản đọc thử ' || title FROM products
WHERE id='toan-6-tap-1' AND NOT EXISTS (SELECT 1 FROM schema_versions WHERE version=7)
ON CONFLICT(product_id,kind) DO UPDATE SET url=excluded.url,alt=excluded.alt;
INSERT INTO product_media(product_id,kind,url,alt)
SELECT id,'sample','/assets/books%20preview/PHAN%20DANG%20TOAN%206-TAP2-BAN-DOC-THU.pdf','Bản đọc thử ' || title FROM products
WHERE id='toan-6-tap-2' AND NOT EXISTS (SELECT 1 FROM schema_versions WHERE version=7)
ON CONFLICT(product_id,kind) DO UPDATE SET url=excluded.url,alt=excluded.alt;
INSERT INTO product_media(product_id,kind,url,alt)
SELECT id,'sample','/assets/books%20preview/PHAN%20DANG%20TOAN%207-TAP1-BAN-DOC-THU.pdf','Bản đọc thử ' || title FROM products
WHERE id='toan-7-tap-1' AND NOT EXISTS (SELECT 1 FROM schema_versions WHERE version=7)
ON CONFLICT(product_id,kind) DO UPDATE SET url=excluded.url,alt=excluded.alt;
INSERT INTO product_media(product_id,kind,url,alt)
SELECT id,'sample','/assets/books%20preview/PHAN%20DANG%20TOAN%207-TAP2-BAN-DOC-THU.pdf','Bản đọc thử ' || title FROM products
WHERE id='toan-7-tap-2' AND NOT EXISTS (SELECT 1 FROM schema_versions WHERE version=7)
ON CONFLICT(product_id,kind) DO UPDATE SET url=excluded.url,alt=excluded.alt;
INSERT INTO product_media(product_id,kind,url,alt)
SELECT id,'sample','/assets/books%20preview/PHAN%20DANG%20TOAN%208-TAP1-BAN-DOC-THU.pdf','Bản đọc thử ' || title FROM products
WHERE id='toan-8-tap-1' AND NOT EXISTS (SELECT 1 FROM schema_versions WHERE version=7)
ON CONFLICT(product_id,kind) DO UPDATE SET url=excluded.url,alt=excluded.alt;
INSERT INTO product_media(product_id,kind,url,alt)
SELECT id,'sample','/assets/books%20preview/PHAN%20DANG%20TOAN%208-TAP2-BAN-DOC-THU.pdf','Bản đọc thử ' || title FROM products
WHERE id='toan-8-tap-2' AND NOT EXISTS (SELECT 1 FROM schema_versions WHERE version=7)
ON CONFLICT(product_id,kind) DO UPDATE SET url=excluded.url,alt=excluded.alt;
INSERT INTO product_media(product_id,kind,url,alt)
SELECT id,'sample','/assets/books%20preview/PHAN%20DANG%20TOAN%209-TAP1-BAN-DOC-THU.pdf','Bản đọc thử ' || title FROM products
WHERE id='toan-9-tap-1' AND NOT EXISTS (SELECT 1 FROM schema_versions WHERE version=7)
ON CONFLICT(product_id,kind) DO UPDATE SET url=excluded.url,alt=excluded.alt;
INSERT INTO product_media(product_id,kind,url,alt)
SELECT id,'sample','/assets/books%20preview/PHAN%20DANG%20TOAN%209-TAP2-BAN-DOC-THU.pdf','Bản đọc thử ' || title FROM products
WHERE id='toan-9-tap-2' AND NOT EXISTS (SELECT 1 FROM schema_versions WHERE version=7)
ON CONFLICT(product_id,kind) DO UPDATE SET url=excluded.url,alt=excluded.alt;
INSERT INTO product_media(product_id,kind,url,alt)
SELECT id,'sample','/assets/books%20preview/70%20DE%20BUT%20TOC%20THI%20VAO%20LOP%206%20CLC-BAN-DOC-THU.pdf','Bản đọc thử ' || title FROM products
WHERE id='70-de-vao-6' AND NOT EXISTS (SELECT 1 FROM schema_versions WHERE version=7)
ON CONFLICT(product_id,kind) DO UPDATE SET url=excluded.url,alt=excluded.alt;
INSERT OR IGNORE INTO schema_versions(version) VALUES(7);
