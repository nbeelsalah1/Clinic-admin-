CREATE TABLE `appointments` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic_id` text NOT NULL,
	`patient_id` text,
	`patient_name_enc` text NOT NULL,
	`service` text NOT NULL,
	`doctor_name` text NOT NULL,
	`starts_at` text NOT NULL,
	`duration_minutes` integer DEFAULT 20 NOT NULL,
	`status` text DEFAULT 'upcoming' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`clinic_id`) REFERENCES `clinics`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `appointments_clinic_start_idx` ON `appointments` (`clinic_id`,`starts_at`);--> statement-breakpoint
CREATE TABLE `clinics` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`license_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clinics_owner_user_uq` ON `clinics` (`owner_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `clinics_license_uq` ON `clinics` (`license_id`);--> statement-breakpoint
CREATE TABLE `licenses` (
	`id` text PRIMARY KEY NOT NULL,
	`subscription_id` text NOT NULL,
	`key_hash` text NOT NULL,
	`key_hint` text NOT NULL,
	`status` text DEFAULT 'issued' NOT NULL,
	`clinic_id` text,
	`issued_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`expires_at` text NOT NULL,
	`activated_at` text,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`clinic_id`) REFERENCES `clinics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `licenses_hash_uq` ON `licenses` (`key_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `licenses_subscription_uq` ON `licenses` (`subscription_id`);--> statement-breakpoint
CREATE TABLE `clinic_memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic_id` text NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`clinic_id`) REFERENCES `clinics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `memberships_clinic_user_uq` ON `clinic_memberships` (`clinic_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `memberships_user_idx` ON `clinic_memberships` (`user_id`);--> statement-breakpoint
CREATE TABLE `patients` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic_id` text NOT NULL,
	`full_name_enc` text NOT NULL,
	`identity_number_enc` text,
	`phone_enc` text NOT NULL,
	`email_enc` text,
	`address_enc` text,
	`gender` text,
	`birth_date` text,
	`history_enc` text,
	`allergies_enc` text,
	`medications_enc` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`clinic_id`) REFERENCES `clinics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `patients_clinic_date_idx` ON `patients` (`clinic_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `platform_users` (
	`user_id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`role` text DEFAULT 'super_admin' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sms_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic_id` text NOT NULL,
	`recipient_ciphertext` text NOT NULL,
	`status` text NOT NULL,
	`provider_message_id` text,
	`error_code` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`clinic_id`) REFERENCES `clinics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sms_logs_clinic_date_idx` ON `sms_logs` (`clinic_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `sms_settings` (
	`clinic_id` text PRIMARY KEY NOT NULL,
	`gateway_url` text NOT NULL,
	`sender_id` text NOT NULL,
	`token_ciphertext` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`clinic_id`) REFERENCES `clinics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic_name` text NOT NULL,
	`contact_email` text NOT NULL,
	`plan` text NOT NULL,
	`term` text NOT NULL,
	`amount_ils` integer NOT NULL,
	`paid_amount_ils` integer,
	`payment_status` text DEFAULT 'pending' NOT NULL,
	`payment_reference` text,
	`paid_at` text,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `subscriptions_status_date_idx` ON `subscriptions` (`payment_status`,`created_at`);