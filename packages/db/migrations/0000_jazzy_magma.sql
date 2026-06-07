CREATE TABLE `api_clients` (
	`id` varchar(128) NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`name` varchar(255) NOT NULL,
	`scopes` json NOT NULL,
	`rate_limit_per_minute` int NOT NULL,
	CONSTRAINT `api_clients_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `api_keys` (
	`id` varchar(128) NOT NULL,
	`api_client_id` varchar(128) NOT NULL,
	`key_hash` varchar(255) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `api_keys_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `calibration_records` (
	`id` varchar(128) NOT NULL,
	`market_id` varchar(128) NOT NULL,
	`predicted_probability` double NOT NULL,
	`outcome` int NOT NULL,
	`brier_score` double NOT NULL,
	`directional_accuracy` boolean NOT NULL,
	`sharpness` double NOT NULL,
	`model_recommendations` json NOT NULL,
	`resolved_at` timestamp NOT NULL,
	CONSTRAINT `calibration_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `config_overrides` (
	`id` varchar(128) NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`key` varchar(255) NOT NULL,
	`value` json NOT NULL,
	`actor_id` varchar(64) NOT NULL,
	`old_value` json,
	`changed_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `config_overrides_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `decision_audits` (
	`id` varchar(128) NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`market_id` varchar(128) NOT NULL,
	`payload` json NOT NULL,
	`final_outcome` varchar(16) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `decision_audits_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `dossiers` (
	`id` varchar(128) NOT NULL,
	`market_id` varchar(128) NOT NULL,
	`payload` json NOT NULL,
	`generated_at` timestamp NOT NULL,
	`freshness_expires_at` timestamp NOT NULL,
	CONSTRAINT `dossiers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `market_features` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`market_id` varchar(128) NOT NULL,
	`window` varchar(8) NOT NULL,
	`payload` json NOT NULL,
	`computed_at` timestamp NOT NULL,
	CONSTRAINT `market_features_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `market_memory` (
	`id` varchar(128) NOT NULL,
	`market_id` varchar(128) NOT NULL,
	`embedding` json NOT NULL,
	`text` text NOT NULL,
	`outcome` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `market_memory_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `markets` (
	`id` varchar(128) NOT NULL,
	`source` varchar(64) NOT NULL,
	`external_id` varchar(255) NOT NULL,
	`slug` varchar(255) NOT NULL,
	`question` text NOT NULL,
	`resolution_criteria` text NOT NULL,
	`resolution_date` timestamp NOT NULL,
	`status` varchar(32) NOT NULL,
	`best_bid` double NOT NULL,
	`best_ask` double NOT NULL,
	`spread` double NOT NULL,
	`spread_bps` double NOT NULL,
	`midpoint` double NOT NULL,
	`total_liquidity` double NOT NULL,
	`volume_24h` double NOT NULL,
	`category` varchar(128) NOT NULL,
	`tags` json NOT NULL,
	`scanned_at` timestamp NOT NULL,
	CONSTRAINT `markets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `order_state_transitions` (
	`id` varchar(128) NOT NULL,
	`order_id` varchar(128) NOT NULL,
	`from_state` varchar(64),
	`to_state` varchar(64) NOT NULL,
	`reason` text NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `order_state_transitions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` varchar(128) NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`market_id` varchar(128) NOT NULL,
	`venue_order_id` varchar(255),
	`side` varchar(8) NOT NULL,
	`quantity` double NOT NULL,
	`limit_price` double NOT NULL,
	`state` varchar(64) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `orders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `playbooks` (
	`id` varchar(128) NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`name` varchar(255) NOT NULL,
	`enabled` boolean NOT NULL,
	`payload` json NOT NULL,
	CONSTRAINT `playbooks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `portfolio_snapshots` (
	`id` varchar(128) NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`payload` json NOT NULL,
	`captured_at` timestamp NOT NULL,
	CONSTRAINT `portfolio_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `positions` (
	`id` varchar(128) NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`market_id` varchar(128) NOT NULL,
	`venue` varchar(64) NOT NULL,
	`side` varchar(8) NOT NULL,
	`quantity` double NOT NULL,
	`average_price` double NOT NULL,
	`market_value` double NOT NULL,
	`category` varchar(128) NOT NULL,
	CONSTRAINT `positions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `research_packs` (
	`id` varchar(128) NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`title` varchar(255) NOT NULL,
	`market_ids` json NOT NULL,
	`html` text NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `research_packs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `system_events` (
	`id` varchar(128) NOT NULL,
	`tenant_id` varchar(64),
	`severity` varchar(16) NOT NULL,
	`event_type` varchar(128) NOT NULL,
	`payload` json NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `system_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tenant_users` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`user_id` varchar(64) NOT NULL,
	`role` varchar(64) NOT NULL,
	CONSTRAINT `tenant_users_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tenants` (
	`id` varchar(64) NOT NULL,
	`name` varchar(255) NOT NULL,
	`plan` varchar(64) NOT NULL,
	`live_enabled` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tenants_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `usage_metrics` (
	`id` varchar(128) NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`api_client_id` varchar(128),
	`route` varchar(128) NOT NULL,
	`units` int NOT NULL,
	`recorded_at` timestamp NOT NULL,
	CONSTRAINT `usage_metrics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` varchar(64) NOT NULL,
	`email` varchar(255) NOT NULL,
	`display_name` varchar(255) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE INDEX `markets_source_status_idx` ON `markets` (`source`,`status`);
