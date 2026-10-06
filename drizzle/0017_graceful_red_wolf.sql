CREATE TABLE `lab_samples` (
	`code` text PRIMARY KEY NOT NULL,
	`clinic_id` text NOT NULL,
	`record_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`clinic_id`) REFERENCES `clinics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lab_record_uq` ON `lab_samples` (`clinic_id`,`record_id`);