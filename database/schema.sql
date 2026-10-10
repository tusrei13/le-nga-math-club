PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS schema_versions (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS products (
 id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
 category TEXT NOT NULL CHECK(category IN ('phan-dang','thi-vao-6')),
 grade INTEGER NOT NULL CHECK(grade BETWEEN 2 AND 9), volume INTEGER CHECK(volume IN (1,2)),
 description TEXT NOT NULL, price_vnd INTEGER NOT NULL CHECK(price_vnd > 0),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)), sort_order INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS product_media (
 id INTEGER PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id),
 kind TEXT NOT NULL CHECK(kind IN ('cover','sample')), url TEXT NOT NULL, alt TEXT NOT NULL DEFAULT '',
 UNIQUE(product_id,kind)
);
CREATE TABLE IF NOT EXISTS site_content (
 key TEXT PRIMARY KEY, value_json TEXT NOT NULL CHECK(json_valid(value_json)), updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS gifts (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('video','community','practice')), resource_url TEXT,
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)), sort_order INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS faqs (
 id TEXT PRIMARY KEY, question TEXT NOT NULL, answer TEXT NOT NULL,
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)), sort_order INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS testimonials (
 id TEXT PRIMARY KEY, quote TEXT NOT NULL, display_name TEXT NOT NULL, context TEXT NOT NULL,
 is_composite INTEGER NOT NULL DEFAULT 1 CHECK(is_composite IN (0,1)), published INTEGER NOT NULL DEFAULT 0 CHECK(published IN (0,1)), sort_order INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS achievements (
 id TEXT PRIMARY KEY, metric TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL,
 is_composite INTEGER NOT NULL DEFAULT 1 CHECK(is_composite IN (0,1)), published INTEGER NOT NULL DEFAULT 0 CHECK(published IN (0,1)), sort_order INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS orders (
 id TEXT PRIMARY KEY, request_key TEXT NOT NULL UNIQUE, request_hash TEXT NOT NULL,
 parent_name TEXT NOT NULL, phone TEXT NOT NULL, grade INTEGER NOT NULL CHECK(grade BETWEEN 2 AND 9),
 address TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
 subtotal_vnd INTEGER NOT NULL CHECK(subtotal_vnd > 0), shipping_vnd INTEGER NOT NULL CHECK(shipping_vnd >= 0),
 total_vnd INTEGER NOT NULL CHECK(total_vnd = subtotal_vnd + shipping_vnd),
 payment_method TEXT NOT NULL DEFAULT 'cod' CHECK(payment_method = 'cod'),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','shipping','completed','cancelled')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS order_items (
 id INTEGER PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), product_id TEXT NOT NULL REFERENCES products(id),
 title TEXT NOT NULL, unit_price_vnd INTEGER NOT NULL CHECK(unit_price_vnd > 0),
 quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 20), UNIQUE(order_id,product_id)
);
CREATE TABLE IF NOT EXISTS order_gifts (
 order_id TEXT NOT NULL REFERENCES orders(id), gift_id TEXT NOT NULL REFERENCES gifts(id),
 title TEXT NOT NULL, PRIMARY KEY(order_id,gift_id)
);
CREATE TABLE IF NOT EXISTS consultations (
 id TEXT PRIMARY KEY, request_key TEXT NOT NULL UNIQUE, request_hash TEXT NOT NULL,
 parent_name TEXT NOT NULL, phone TEXT NOT NULL, grade INTEGER NOT NULL CHECK(grade BETWEEN 2 AND 9),
 note TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','contacted','resolved','cancelled')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS request_history (
 id INTEGER PRIMARY KEY, order_id TEXT REFERENCES orders(id), consultation_id TEXT REFERENCES consultations(id),
 from_status TEXT, to_status TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK((order_id IS NULL) != (consultation_id IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_orders_status_date ON orders(status,created_at);
CREATE INDEX IF NOT EXISTS idx_consultations_status_date ON consultations(status,created_at);
INSERT OR IGNORE INTO schema_versions(version) VALUES(1);
