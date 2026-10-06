CREATE TABLE `clinic_records` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic_id` text NOT NULL,
	`module` text NOT NULL,
	`patient_id` text,
	`data_enc` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`clinic_id`) REFERENCES `clinics`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `records_clinic_module_idx` ON `clinic_records` (`clinic_id`,`module`);--> statement-breakpoint
CREATE INDEX `records_patient_idx` ON `clinic_records` (`clinic_id`,`patient_id`);--> statement-breakpoint
CREATE TABLE `invoice_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic_id` text NOT NULL,
	`invoice_id` text NOT NULL,
	`amount` integer NOT NULL,
	`method` text NOT NULL,
	`request_key` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`clinic_id`) REFERENCES `clinics`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_request_uq` ON `invoice_payments` (`clinic_id`,`request_key`);--> statement-breakpoint
CREATE INDEX `payment_invoice_idx` ON `invoice_payments` (`clinic_id`,`invoice_id`);--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic_id` text NOT NULL,
	`patient_id` text NOT NULL,
	`number` text NOT NULL,
	`data_enc` text NOT NULL,
	`subtotal` integer NOT NULL,
	`tax` integer NOT NULL,
	`total` integer NOT NULL,
	`paid` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'issued' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`clinic_id`) REFERENCES `clinics`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoice_number_uq` ON `invoices` (`clinic_id`,`number`);--> statement-breakpoint
CREATE INDEX `invoice_clinic_idx` ON `invoices` (`clinic_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `medical_files` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic_id` text NOT NULL,
	`patient_id` text NOT NULL,
	`name_enc` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`object_key` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`clinic_id`) REFERENCES `clinics`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `files_clinic_patient_idx` ON `medical_files` (`clinic_id`,`patient_id`);--> statement-breakpoint
CREATE TABLE `stock_items` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic_id` text NOT NULL,
	`name` text NOT NULL,
	`batch` text NOT NULL,
	`quantity` integer DEFAULT 0 NOT NULL,
	`threshold` integer DEFAULT 5 NOT NULL,
	`expires` text,
	`supplier_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`clinic_id`) REFERENCES `clinics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `stock_clinic_idx` ON `stock_items` (`clinic_id`);--> statement-breakpoint
CREATE TABLE `stock_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic_id` text NOT NULL,
	`item_id` text NOT NULL,
	`delta` integer NOT NULL,
	`reason` text NOT NULL,
	`request_key` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`clinic_id`) REFERENCES `clinics`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `stock_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stock_request_uq` ON `stock_movements` (`clinic_id`,`request_key`);