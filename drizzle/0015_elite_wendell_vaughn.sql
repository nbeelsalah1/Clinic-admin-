CREATE TABLE `clinic_integrations` (
	`clinic_id` text PRIMARY KEY NOT NULL,
	`whatsapp_phone_id` text,
	`whatsapp_token_enc` text,
	`whatsapp_app_secret_enc` text,
	`verify_token_hash` text,
	`whatsapp_enabled` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`clinic_id`) REFERENCES `clinics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `whatsapp_phone_id_uq` ON `clinic_integrations` (`whatsapp_phone_id`);--> statement-breakpoint
CREATE TABLE `patient_portal_access` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic_id` text NOT NULL,
	`patient_id` text NOT NULL,
	`email_hash` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`clinic_id`) REFERENCES `clinics`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `portal_patient_uq` ON `patient_portal_access` (`clinic_id`,`patient_id`);--> statement-breakpoint
CREATE INDEX `portal_email_idx` ON `patient_portal_access` (`email_hash`,`active`);--> statement-breakpoint
CREATE TABLE `public_booking_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic_id` text NOT NULL,
	`user_id` text NOT NULL,
	`email_hash` text NOT NULL,
	`data_enc` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`request_key` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`clinic_id`) REFERENCES `clinics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `booking_request_key_uq` ON `public_booking_requests` (`user_id`,`request_key`);--> statement-breakpoint
CREATE INDEX `booking_clinic_status_idx` ON `public_booking_requests` (`clinic_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `whatsapp_events` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic_id` text NOT NULL,
	`sender_hash` text NOT NULL,
	`status` text DEFAULT 'received' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`clinic_id`) REFERENCES `clinics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `whatsapp_clinic_idx` ON `whatsapp_events` (`clinic_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `workflow_limits` (
	`bucket` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL
);
