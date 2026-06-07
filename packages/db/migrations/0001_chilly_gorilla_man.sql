CREATE INDEX `api_clients_tenant_idx` ON `api_clients` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `api_keys_client_hash_idx` ON `api_keys` (`api_client_id`,`key_hash`);--> statement-breakpoint
CREATE INDEX `config_overrides_tenant_key_changed_idx` ON `config_overrides` (`tenant_id`,`key`,`changed_at`);--> statement-breakpoint
CREATE INDEX `decision_audits_tenant_created_idx` ON `decision_audits` (`tenant_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `decision_audits_tenant_outcome_created_idx` ON `decision_audits` (`tenant_id`,`final_outcome`,`created_at`);--> statement-breakpoint
CREATE INDEX `dossiers_market_generated_idx` ON `dossiers` (`market_id`,`generated_at`);--> statement-breakpoint
CREATE INDEX `market_features_market_window_computed_idx` ON `market_features` (`market_id`,`window`,`computed_at`);--> statement-breakpoint
CREATE INDEX `orders_tenant_created_idx` ON `orders` (`tenant_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `orders_tenant_venue_order_idx` ON `orders` (`tenant_id`,`venue_order_id`);--> statement-breakpoint
CREATE INDEX `portfolio_snapshots_tenant_captured_idx` ON `portfolio_snapshots` (`tenant_id`,`captured_at`);--> statement-breakpoint
CREATE INDEX `research_packs_tenant_created_idx` ON `research_packs` (`tenant_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `system_events_tenant_event_created_idx` ON `system_events` (`tenant_id`,`event_type`,`created_at`);--> statement-breakpoint
CREATE INDEX `system_events_event_created_idx` ON `system_events` (`event_type`,`created_at`);