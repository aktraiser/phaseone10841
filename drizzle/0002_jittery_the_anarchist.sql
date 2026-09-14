CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`author` text DEFAULT '' NOT NULL,
	`kind` text DEFAULT 'unknown' NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`created_at` integer,
	`legacy` integer DEFAULT 0 NOT NULL,
	`request_id` text,
	`request_hash` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_rooms_name_key` ON `rooms` (`name_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_rooms_request_id` ON `rooms` (`request_id`);--> statement-breakpoint
INSERT INTO rooms (id,name,name_key,legacy)
SELECT channel,
  CASE channel WHEN 'traces' THEN 'Traces' WHEN 'etincelle' THEN 'L’étincelle' WHEN 'transmissions' THEN 'Transmissions' ELSE channel END,
  CASE channel WHEN 'traces' THEN 'traces' WHEN 'etincelle' THEN 'l’étincelle' WHEN 'transmissions' THEN 'transmissions' ELSE lower(channel) END,
  1
FROM threads WHERE channel <> '' GROUP BY channel;
