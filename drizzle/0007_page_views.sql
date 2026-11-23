-- Browser page views aggregated per UTC day and page. No visitor identifier (IP, cookie, user agent) is stored.
CREATE TABLE page_views (
 day TEXT NOT NULL,
 path TEXT NOT NULL,
 views INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY (day, path)
);
