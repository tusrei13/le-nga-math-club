CREATE TABLE IF NOT EXISTS stem_programs (
 id TEXT PRIMARY KEY,grade INTEGER NOT NULL CHECK(grade BETWEEN 3 AND 9),
 level TEXT NOT NULL CHECK(level IN ('consolidation','basic','advanced','olympiad')),
 title TEXT NOT NULL,description TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 UNIQUE(grade,level)
);
-- Keep seed statements separate to avoid D1 compound SELECT limits.
-- INSERT OR IGNORE preserves existing program edits when this migration is retried.
INSERT OR IGNORE INTO stem_programs(id,grade,level,title,description) VALUES('g3-consolidation',3,'consolidation','Củng cố kiến thức · Lớp 3','Trao đổi về phần kiến thức chưa vững để chọn nội dung ôn tập phù hợp.');
INSERT OR IGNORE INTO stem_programs(id,grade,level,title,description) VALUES('g3-basic',3,'basic','Cơ bản · Lớp 3','Tìm hiểu chương trình theo khối lớp, chú trọng hiểu kiến thức và luyện tập.');
INSERT OR IGNORE INTO stem_programs(id,grade,level,title,description) VALUES('g3-advanced',3,'advanced','Nâng cao · Lớp 3','Dành cho nhu cầu mở rộng kiến thức và tiếp cận những bài toán khó hơn.');
INSERT OR IGNORE INTO stem_programs(id,grade,level,title,description) VALUES('g3-olympiad',3,'olympiad','Bồi dưỡng học sinh giỏi · Lớp 3','Tư vấn hướng học chuyên sâu và chuẩn bị cho các kỳ thi phù hợp.');
INSERT OR IGNORE INTO stem_programs(id,grade,level,title,description) VALUES('g4-consolidation',4,'consolidation','Củng cố kiến thức · Lớp 4','Trao đổi về phần kiến thức chưa vững để chọn nội dung ôn tập phù hợp.');
INSERT OR IGNORE INTO stem_programs(id,grade,level,title,description) VALUES('g4-basic',4,'basic','Cơ bản · Lớp 4','Tìm hiểu chương trình theo khối lớp, chú trọng hiểu kiến thức và luyện tập.');
INSERT OR IGNORE INTO stem_programs(id,grade,level,title,description) VALUES('g4-advanced',4,'advanced','Nâng cao · Lớp 4','Dành cho nhu cầu mở rộng kiến thức và tiếp cận những bài toán khó hơn.');
INSERT OR IGNORE INTO stem_programs(id,grade,level,title,description) VALUES('g4-olympiad',4,'olympiad','Bồi dưỡng học sinh giỏi · Lớp 4','Tư vấn hướng học chuyên sâu và chuẩn bị cho các kỳ thi phù hợp.');
INSERT OR IGNORE INTO stem_programs(id,grade,level,title,description) VALUES('g5-consolidation',5,'consolidation','Củng cố kiến thức · Lớp 5','Trao đổi về phần kiến thức chưa vững để chọn nội dung ôn tập phù hợp.');
INSERT OR IGNORE INTO stem_programs(id,grade,level,title,description) VALUES('g5-basic',5,'basic','Cơ bản · Lớp 5','Tìm hiểu chương trình theo khối lớp, chú trọng hiểu kiến thức và luyện tập.');
INSERT OR IGNORE INTO stem_programs(id,grade,level,title,description) VALUES('g5-advanced',5,'advanced','Nâng cao · Lớp 5','Dành cho nhu cầu mở rộng kiến thức và tiếp cận những bài toán khó hơn.');
INSERT OR IGNORE INTO stem_programs(id,grade,level,title,description) VALUES('g5-olympiad',5,'olympiad','Bồi dưỡng học sinh giỏi · Lớp 5','Tư vấn hướng học chuyên sâu và chuẩn bị cho các kỳ thi phù hợp.');
INSERT OR IGNORE INTO stem_programs(id,grade,level,title,description) VALUES('g6-consolidation',6,'consolidation','Củng cố kiến thức · Lớp 6','Trao đổi về phần kiến thức chưa vững để chọn nội dung ôn tập phù hợp.');
INSERT OR IGNORE INTO stem_programs(id,grade,level,title,description) VALUES('g6-basic',6,'basic','Cơ bản · Lớp 6','Tìm hiểu chương trình theo khối lớp, chú trọng hiểu kiến thức và luyện tập.');
INSERT OR IGNORE INTO stem_programs(id,grade,level,title,description) VALUES('g6-advanced',6,'advanced','Nâng cao · Lớp 6','Dành cho nhu cầu mở rộng kiến thức và tiếp cận những bài toán khó hơn.');
INSERT OR IGNORE INTO stem_programs(id,grade,level,title,description) VALUES('g6-olympiad',6,'olympiad','Bồi dưỡng học sinh giỏi · Lớp 6','Tư vấn hướng học chuyên sâu và chuẩn bị cho các kỳ thi phù hợp.');
INSERT OR IGNORE INTO stem_programs(id,grade,level,title,description) VALUES('g7-consolidation',7,'consolidation','Củng cố kiến thức · Lớp 7','Trao đổi về phần kiến thức chưa vững để chọn nội dung ôn tập phù hợp.');
INSERT OR IGNORE INTO stem_programs(id,grade,level,title,description) VALUES('g7-basic',7,'basic','Cơ bản · Lớp 7','Tìm hiểu chương trình theo khối lớp, chú trọng hiểu kiến thức và luyện tập.');
INSERT OR IGNORE INTO stem_programs(id,grade,level,title,description) VALUES('g7-advanced',7,'advanced','Nâng cao · Lớp 7','Dành cho nhu cầu mở rộng kiến thức và tiếp cận những bài toán khó hơn.');
INSERT OR IGNORE INTO stem_programs(id,grade,level,title,description) VALUES('g7-olympiad',7,'olympiad','Bồi dưỡng học sinh giỏi · Lớp 7','Tư vấn hướng học chuyên sâu và chuẩn bị cho các kỳ thi phù hợp.');
INSERT OR IGNORE INTO stem_programs(id,grade,level,title,description) VALUES('g8-consolidation',8,'consolidation','Củng cố kiến thức · Lớp 8','Trao đổi về phần kiến thức chưa vững để chọn nội dung ôn tập phù hợp.');
INSERT OR IGNORE INTO stem_programs(id,grade,level,title,description) VALUES('g8-basic',8,'basic','Cơ bản · Lớp 8','Tìm hiểu chương trình theo khối lớp, chú trọng hiểu kiến thức và luyện tập.');
INSERT OR IGNORE INTO stem_programs(id,grade,level,title,description) VALUES('g8-advanced',8,'advanced','Nâng cao · Lớp 8','Dành cho nhu cầu mở rộng kiến thức và tiếp cận những bài toán khó hơn.');
INSERT OR IGNORE INTO stem_programs(id,grade,level,title,description) VALUES('g8-olympiad',8,'olympiad','Bồi dưỡng học sinh giỏi · Lớp 8','Tư vấn hướng học chuyên sâu và chuẩn bị cho các kỳ thi phù hợp.');
INSERT OR IGNORE INTO stem_programs(id,grade,level,title,description) VALUES('g9-consolidation',9,'consolidation','Củng cố kiến thức · Lớp 9','Trao đổi về phần kiến thức chưa vững để chọn nội dung ôn tập phù hợp.');
INSERT OR IGNORE INTO stem_programs(id,grade,level,title,description) VALUES('g9-basic',9,'basic','Cơ bản · Lớp 9','Tìm hiểu chương trình theo khối lớp, chú trọng hiểu kiến thức và luyện tập.');
INSERT OR IGNORE INTO stem_programs(id,grade,level,title,description) VALUES('g9-advanced',9,'advanced','Nâng cao · Lớp 9','Dành cho nhu cầu mở rộng kiến thức và tiếp cận những bài toán khó hơn.');
INSERT OR IGNORE INTO stem_programs(id,grade,level,title,description) VALUES('g9-olympiad',9,'olympiad','Bồi dưỡng học sinh giỏi · Lớp 9','Tư vấn hướng học chuyên sâu và chuẩn bị cho các kỳ thi phù hợp.');
CREATE TABLE IF NOT EXISTS stem_enquiries (
 id TEXT PRIMARY KEY,request_key TEXT NOT NULL UNIQUE,request_hash TEXT NOT NULL,
 parent_name TEXT NOT NULL,phone TEXT NOT NULL,grade INTEGER NOT NULL CHECK(grade BETWEEN 3 AND 9),
 program_id TEXT NOT NULL REFERENCES stem_programs(id),program_title TEXT NOT NULL,
 level TEXT NOT NULL CHECK(level IN ('consolidation','basic','advanced','olympiad')),
 specialist_goal INTEGER NOT NULL DEFAULT 0 CHECK(specialist_goal IN (0,1) AND (grade>=6 OR specialist_goal=0)),
 consent INTEGER NOT NULL CHECK(consent=1),note TEXT NOT NULL DEFAULT '',staff_note TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','contacted','advising','enrolled','cancelled')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_stem_enquiries_status_date ON stem_enquiries(status,created_at);
CREATE TABLE IF NOT EXISTS stem_enquiry_history (
 id INTEGER PRIMARY KEY,enquiry_id TEXT NOT NULL REFERENCES stem_enquiries(id),
 from_status TEXT,to_status TEXT NOT NULL,event_type TEXT NOT NULL DEFAULT 'status' CHECK(event_type IN ('status','note')),
 actor TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_stem_history_enquiry ON stem_enquiry_history(enquiry_id,id);
CREATE TABLE IF NOT EXISTS edge_rate_limits (key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_edge_rate_expiry ON edge_rate_limits(expires_at);
INSERT OR IGNORE INTO schema_versions(version) VALUES(5);
