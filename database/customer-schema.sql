CREATE TABLE IF NOT EXISTS customer_orders (
 order_id TEXT PRIMARY KEY REFERENCES orders(id),
 customer_id TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_customer_orders_user ON customer_orders(customer_id);
INSERT OR IGNORE INTO schema_versions(version) VALUES(3);
