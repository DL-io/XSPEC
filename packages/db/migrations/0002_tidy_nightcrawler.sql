CREATE TABLE `fills` (
	`id` varchar(128) NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`order_id` varchar(128) NOT NULL,
	`market_id` varchar(128) NOT NULL,
	`venue_trade_id` varchar(255),
	`side` varchar(8) NOT NULL,
	`quantity` double NOT NULL,
	`price` double NOT NULL,
	`filled_at` timestamp NOT NULL,
	CONSTRAINT `fills_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `normalized_orderbooks` (
	`id` varchar(128) NOT NULL,
	`market_id` varchar(128) NOT NULL,
	`source` varchar(64) NOT NULL,
	`bids` json NOT NULL,
	`asks` json NOT NULL,
	`best_bid` double NOT NULL,
	`best_ask` double NOT NULL,
	`spread` double NOT NULL,
	`captured_at` timestamp NOT NULL,
	CONSTRAINT `normalized_orderbooks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `probability_estimates` (
	`id` varchar(128) NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`market_id` varchar(128) NOT NULL,
	`model_id` varchar(128) NOT NULL,
	`probability` double NOT NULL,
	`confidence_weight` double NOT NULL,
	`freshness_score` double NOT NULL,
	`evidence` json NOT NULL,
	`failure_reason` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `probability_estimates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reconciliation_runs` (
	`id` varchar(128) NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`ok` boolean NOT NULL,
	`severe` boolean NOT NULL,
	`mismatch_count` int NOT NULL,
	`payload` json NOT NULL,
	`checked_at` timestamp NOT NULL,
	CONSTRAINT `reconciliation_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `risk_events` (
	`id` varchar(128) NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`market_id` varchar(128),
	`gate` varchar(128) NOT NULL,
	`severity` varchar(16) NOT NULL,
	`reason` text NOT NULL,
	`payload` json NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `risk_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `fills_tenant_filled_idx` ON `fills` (`tenant_id`,`filled_at`);--> statement-breakpoint
CREATE INDEX `fills_order_filled_idx` ON `fills` (`order_id`,`filled_at`);--> statement-breakpoint
CREATE INDEX `fills_market_filled_idx` ON `fills` (`market_id`,`filled_at`);--> statement-breakpoint
CREATE INDEX `normalized_orderbooks_market_captured_idx` ON `normalized_orderbooks` (`market_id`,`captured_at`);--> statement-breakpoint
CREATE INDEX `normalized_orderbooks_source_captured_idx` ON `normalized_orderbooks` (`source`,`captured_at`);--> statement-breakpoint
CREATE INDEX `probability_estimates_tenant_market_created_idx` ON `probability_estimates` (`tenant_id`,`market_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `probability_estimates_model_created_idx` ON `probability_estimates` (`model_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `reconciliation_runs_tenant_checked_idx` ON `reconciliation_runs` (`tenant_id`,`checked_at`);--> statement-breakpoint
CREATE INDEX `reconciliation_runs_tenant_ok_checked_idx` ON `reconciliation_runs` (`tenant_id`,`ok`,`checked_at`);--> statement-breakpoint
CREATE INDEX `risk_events_tenant_created_idx` ON `risk_events` (`tenant_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `risk_events_tenant_gate_created_idx` ON `risk_events` (`tenant_id`,`gate`,`created_at`);--> statement-breakpoint
CREATE INDEX `risk_events_market_created_idx` ON `risk_events` (`market_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `order_state_transitions_order_created_idx` ON `order_state_transitions` (`order_id`,`created_at`);