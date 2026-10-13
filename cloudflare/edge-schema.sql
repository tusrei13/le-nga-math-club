CREATE TABLE IF NOT EXISTS edge_rate_limits (
 key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_edge_rate_expiry ON edge_rate_limits(expires_at);
