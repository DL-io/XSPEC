-- Align normalized_orderbooks with schema.ts:
-- Remove stale columns that were added by older migrations but are not in current schema
ALTER TABLE `normalized_orderbooks` DROP COLUMN IF EXISTS `token_id`;
--> statement-breakpoint
ALTER TABLE `normalized_orderbooks` DROP COLUMN IF EXISTS `bid_depth_1pct`;
--> statement-breakpoint
ALTER TABLE `normalized_orderbooks` DROP COLUMN IF EXISTS `ask_depth_1pct`;
--> statement-breakpoint
-- Align probability_estimates with schema.ts:
-- Add columns that schema.ts expects
ALTER TABLE `probability_estimates` ADD COLUMN IF NOT EXISTS `tenant_id` varchar(64) NOT NULL DEFAULT 'system';
--> statement-breakpoint
ALTER TABLE `probability_estimates` ADD COLUMN IF NOT EXISTS `model_id` varchar(128) NOT NULL DEFAULT 'unknown';
--> statement-breakpoint
ALTER TABLE `probability_estimates` ADD COLUMN IF NOT EXISTS `confidence_weight` double NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `probability_estimates` ADD COLUMN IF NOT EXISTS `freshness_score` double NOT NULL DEFAULT 0;
--> statement-breakpoint
-- Remove columns that schema.ts no longer defines
ALTER TABLE `probability_estimates` DROP COLUMN IF EXISTS `confidence`;
--> statement-breakpoint
ALTER TABLE `probability_estimates` DROP COLUMN IF EXISTS `freshness_expires_at`;
