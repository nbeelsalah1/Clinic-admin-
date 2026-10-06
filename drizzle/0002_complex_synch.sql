CREATE TABLE `identity_verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`session_id` text NOT NULL,
	`session_url_enc` text NOT NULL,
	`config_revision` text NOT NULL,
	`environment` text NOT NULL,
	`status` text DEFAULT 'Not Started' NOT NULL,
	`document_status` text DEFAULT 'Not Started' NOT NULL,
	`phone_status` text DEFAULT 'Not Started' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `verification_session_uq` ON `identity_verifications` (`session_id`);--> statement-breakpoint
CREATE INDEX `verification_user_date_idx` ON `identity_verifications` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `verification_limits` (
	`bucket` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`last_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `verification_settings` (
	`provider` text PRIMARY KEY NOT NULL,
	`api_key_enc` text NOT NULL,
	`workflow_id` text NOT NULL,
	`environment` text NOT NULL,
	`revision` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
