ALTER TABLE `appointments` ADD `doctor_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `memberships_clinic_email_uq` ON `clinic_memberships` (`clinic_id`,lower("email"));