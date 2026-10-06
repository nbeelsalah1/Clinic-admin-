ALTER TABLE `appointments` ADD `branch_id` text;--> statement-breakpoint
ALTER TABLE `audit_logs` ADD `branch_id` text;--> statement-breakpoint
CREATE INDEX `audit_logs_branch_date_idx` ON `audit_logs` (`clinic_id`,`branch_id`,`created_at`);