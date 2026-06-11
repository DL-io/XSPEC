-- Align normalized_orderbooks and probability_estimates with schema.ts
-- Uses INFORMATION_SCHEMA + PREPARE for MySQL 5.7 compatibility (no DROP COLUMN IF EXISTS)

-- Drop token_id from normalized_orderbooks if it exists
SET @_s1 = (SELECT IF(COUNT(*) > 0, 'ALTER TABLE `normalized_orderbooks` DROP COLUMN `token_id`', 'SELECT 1') FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'normalized_orderbooks' AND COLUMN_NAME = 'token_id')
--> statement-breakpoint
PREPARE _stmt1 FROM @_s1
--> statement-breakpoint
EXECUTE _stmt1
--> statement-breakpoint
DEALLOCATE PREPARE _stmt1
--> statement-breakpoint
-- Drop bid_depth_1pct from normalized_orderbooks if it exists
SET @_s2 = (SELECT IF(COUNT(*) > 0, 'ALTER TABLE `normalized_orderbooks` DROP COLUMN `bid_depth_1pct`', 'SELECT 1') FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'normalized_orderbooks' AND COLUMN_NAME = 'bid_depth_1pct')
--> statement-breakpoint
PREPARE _stmt2 FROM @_s2
--> statement-breakpoint
EXECUTE _stmt2
--> statement-breakpoint
DEALLOCATE PREPARE _stmt2
--> statement-breakpoint
-- Drop ask_depth_1pct from normalized_orderbooks if it exists
SET @_s3 = (SELECT IF(COUNT(*) > 0, 'ALTER TABLE `normalized_orderbooks` DROP COLUMN `ask_depth_1pct`', 'SELECT 1') FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'normalized_orderbooks' AND COLUMN_NAME = 'ask_depth_1pct')
--> statement-breakpoint
PREPARE _stmt3 FROM @_s3
--> statement-breakpoint
EXECUTE _stmt3
--> statement-breakpoint
DEALLOCATE PREPARE _stmt3
--> statement-breakpoint
-- Add tenant_id to probability_estimates if it does not exist
SET @_s4 = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `probability_estimates` ADD COLUMN `tenant_id` varchar(64) NOT NULL DEFAULT ''system''', 'SELECT 1') FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'probability_estimates' AND COLUMN_NAME = 'tenant_id')
--> statement-breakpoint
PREPARE _stmt4 FROM @_s4
--> statement-breakpoint
EXECUTE _stmt4
--> statement-breakpoint
DEALLOCATE PREPARE _stmt4
--> statement-breakpoint
-- Add model_id to probability_estimates if it does not exist
SET @_s5 = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `probability_estimates` ADD COLUMN `model_id` varchar(128) NOT NULL DEFAULT ''unknown''', 'SELECT 1') FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'probability_estimates' AND COLUMN_NAME = 'model_id')
--> statement-breakpoint
PREPARE _stmt5 FROM @_s5
--> statement-breakpoint
EXECUTE _stmt5
--> statement-breakpoint
DEALLOCATE PREPARE _stmt5
--> statement-breakpoint
-- Add confidence_weight to probability_estimates if it does not exist
SET @_s6 = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `probability_estimates` ADD COLUMN `confidence_weight` double NOT NULL DEFAULT 0', 'SELECT 1') FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'probability_estimates' AND COLUMN_NAME = 'confidence_weight')
--> statement-breakpoint
PREPARE _stmt6 FROM @_s6
--> statement-breakpoint
EXECUTE _stmt6
--> statement-breakpoint
DEALLOCATE PREPARE _stmt6
--> statement-breakpoint
-- Add freshness_score to probability_estimates if it does not exist
SET @_s7 = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `probability_estimates` ADD COLUMN `freshness_score` double NOT NULL DEFAULT 0', 'SELECT 1') FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'probability_estimates' AND COLUMN_NAME = 'freshness_score')
--> statement-breakpoint
PREPARE _stmt7 FROM @_s7
--> statement-breakpoint
EXECUTE _stmt7
--> statement-breakpoint
DEALLOCATE PREPARE _stmt7
--> statement-breakpoint
-- Drop confidence from probability_estimates if it exists
SET @_s8 = (SELECT IF(COUNT(*) > 0, 'ALTER TABLE `probability_estimates` DROP COLUMN `confidence`', 'SELECT 1') FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'probability_estimates' AND COLUMN_NAME = 'confidence')
--> statement-breakpoint
PREPARE _stmt8 FROM @_s8
--> statement-breakpoint
EXECUTE _stmt8
--> statement-breakpoint
DEALLOCATE PREPARE _stmt8
--> statement-breakpoint
-- Drop freshness_expires_at from probability_estimates if it exists
SET @_s9 = (SELECT IF(COUNT(*) > 0, 'ALTER TABLE `probability_estimates` DROP COLUMN `freshness_expires_at`', 'SELECT 1') FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'probability_estimates' AND COLUMN_NAME = 'freshness_expires_at')
--> statement-breakpoint
PREPARE _stmt9 FROM @_s9
--> statement-breakpoint
EXECUTE _stmt9
--> statement-breakpoint
DEALLOCATE PREPARE _stmt9
