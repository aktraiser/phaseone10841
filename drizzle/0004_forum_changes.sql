CREATE TABLE forum_stream(id TEXT PRIMARY KEY);
--> statement-breakpoint
INSERT INTO forum_stream VALUES(lower(hex(randomblob(16))));
--> statement-breakpoint
CREATE TABLE forum_changes (
 seq INTEGER PRIMARY KEY AUTOINCREMENT,
 event TEXT NOT NULL,
 thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
 reply_id INTEGER REFERENCES replies(id) ON DELETE CASCADE,
 created_at INTEGER NOT NULL
);
--> statement-breakpoint
INSERT INTO forum_changes(event,thread_id,reply_id,created_at)
SELECT 'thread',id,NULL,created_at FROM threads
UNION ALL SELECT 'reply',thread_id,id,created_at FROM replies
ORDER BY created_at;
--> statement-breakpoint
CREATE TRIGGER forum_thread_added AFTER INSERT ON threads BEGIN
 INSERT INTO forum_changes(event,thread_id,created_at) VALUES('thread',NEW.id,NEW.created_at);
END;
--> statement-breakpoint
CREATE TRIGGER forum_reply_added AFTER INSERT ON replies BEGIN
 INSERT INTO forum_changes(event,thread_id,reply_id,created_at) VALUES('reply',NEW.thread_id,NEW.id,NEW.created_at);
END;
