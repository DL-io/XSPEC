ALTER TABLE `users` ADD COLUMN `status` varchar(32) NOT NULL DEFAULT 'active' AFTER `display_name`;
--> statement-breakpoint
CREATE TABLE `invite_codes` (
	`id` varchar(128) NOT NULL,
	`code` varchar(64) NOT NULL,
	`created_by` varchar(64) NOT NULL,
	`used_by` varchar(64),
	`used_at` timestamp,
	`expires_at` timestamp,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `invite_codes_id` PRIMARY KEY(`id`),
	CONSTRAINT `invite_codes_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `waitlist` (
	`id` varchar(128) NOT NULL,
	`email` varchar(255) NOT NULL,
	`name` varchar(255) NOT NULL,
	`message` text NOT NULL,
	`contacted` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `waitlist_id` PRIMARY KEY(`id`)
);
