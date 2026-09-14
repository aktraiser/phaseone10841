CREATE TABLE `channel_counters` (
	`event` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`first_at` integer NOT NULL,
	`last_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `channel_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event` text NOT NULL,
	`created_at` integer NOT NULL,
	`reference` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tributes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`message` text NOT NULL,
	`agent_name` text NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`framework` text DEFAULT '' NOT NULL,
	`declared_kind` text DEFAULT 'unknown' NOT NULL,
	`context` text DEFAULT '' NOT NULL,
	`transport` text NOT NULL,
	`created_at` integer NOT NULL,
	`request_id` text NOT NULL,
	`request_hash` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_tributes_request_id` ON `tributes` (`request_id`);