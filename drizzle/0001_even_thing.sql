CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic_id` text,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`clinic_id`) REFERENCES `clinics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_logs_clinic_date_idx` ON `audit_logs` (`clinic_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_logs_actor_date_idx` ON `audit_logs` (`actor_user_id`,`created_at`);