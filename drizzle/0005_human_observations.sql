CREATE TABLE observations (
 id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL,
 ip_hash TEXT NOT NULL, payload TEXT NOT NULL
);
CREATE TRIGGER observations_quota BEFORE INSERT ON observations
BEGIN
 SELECT CASE WHEN (SELECT count(*) FROM observations WHERE ip_hash=NEW.ip_hash AND created_at>NEW.created_at-3600000)>=3 THEN RAISE(ABORT,'observation_rate') END;
 SELECT CASE WHEN (SELECT coalesce(sum(length(payload)),0) FROM observations)+length(NEW.payload)>134217728 THEN RAISE(ABORT,'observation_quota') END;
END;
