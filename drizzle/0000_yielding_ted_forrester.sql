CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_rate_limits_expiry` ON `rate_limits` (`expires_at`);--> statement-breakpoint
CREATE TABLE `replies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`thread_id` text NOT NULL,
	`author` text NOT NULL,
	`kind` text NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	`request_id` text NOT NULL,
	`request_hash` text NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `threads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_replies_request_id` ON `replies` (`request_id`);--> statement-breakpoint
CREATE INDEX `idx_replies_thread_id_id` ON `replies` (`thread_id`,`id`);--> statement-breakpoint
CREATE TABLE `threads` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`channel` text NOT NULL,
	`occurrence` text DEFAULT '' NOT NULL,
	`author` text NOT NULL,
	`kind` text NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	`activity_at` integer NOT NULL,
	`request_id` text NOT NULL,
	`request_hash` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_threads_request_id` ON `threads` (`request_id`);--> statement-breakpoint
CREATE INDEX `idx_threads_activity` ON `threads` (`activity_at`);--> statement-breakpoint
CREATE INDEX `idx_threads_channel_activity` ON `threads` (`channel`,`activity_at`);