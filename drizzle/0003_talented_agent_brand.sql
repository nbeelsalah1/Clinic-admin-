CREATE TABLE `email_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`event_key` text NOT NULL,
	`kind` text NOT NULL,
	`recipient_enc` text NOT NULL,
	`payload_enc` text,
	`request_enc` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`provider_id` text,
	`error_code` text,
	`first_attempt_at` integer,
	`next_attempt_at` integer DEFAULT 0 NOT NULL,
	`locked_at` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`accepted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `outbox_event_uq` ON `email_outbox` (`event_key`);--> statement-breakpoint
CREATE INDEX `outbox_status_idx` ON `email_outbox` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE TABLE `email_settings` (
	`provider` text PRIMARY KEY NOT NULL,
	`api_key_enc` text NOT NULL,
	`from_email` text NOT NULL,
	`reply_to` text NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `trial_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`email_hash` text NOT NULL,
	`email_enc` text NOT NULL,
	`clinic_name` text NOT NULL,
	`language` text DEFAULT 'ar' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`clinic_id` text,
	`starts_at` text,
	`ends_at` text,
	`reviewed_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trial_user_uq` ON `trial_requests` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `trial_email_uq` ON `trial_requests` (`email_hash`);--> statement-breakpoint
CREATE INDEX `trial_status_idx` ON `trial_requests` (`status`,`created_at`);--> statement-breakpoint
ALTER TABLE `clinics` ADD `trial_ends_at` text;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `language` text DEFAULT 'ar' NOT NULL;