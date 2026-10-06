CREATE TABLE `clinic_branch_memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic_id` text NOT NULL,
	`branch_id` text NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`clinic_id`) REFERENCES `clinics`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`branch_id`) REFERENCES `clinic_branches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `branch_member_uq` ON `clinic_branch_memberships` (`clinic_id`,`branch_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `branch_member_user_idx` ON `clinic_branch_memberships` (`clinic_id`,`user_id`,`active`);--> statement-breakpoint
CREATE TABLE `clinic_branches` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic_id` text NOT NULL,
	`name` text NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`clinic_id`) REFERENCES `clinics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `branch_name_uq` ON `clinic_branches` (`clinic_id`,`name`);--> statement-breakpoint
CREATE INDEX `branch_clinic_active_idx` ON `clinic_branches` (`clinic_id`,`status`);--> statement-breakpoint
CREATE TABLE `qredit_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic_id` text NOT NULL,
	`branch_id` text,
	`invoice_id` text NOT NULL,
	`client_reference` text NOT NULL,
	`order_reference` text,
	`payment_reference` text,
	`checkout_url` text,
	`amount` integer NOT NULL,
	`currency` text DEFAULT 'ILS' NOT NULL,
	`status` text DEFAULT 'creating' NOT NULL,
	`provider_status` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`paid_at` text,
	FOREIGN KEY (`clinic_id`) REFERENCES `clinics`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `qredit_client_ref_uq` ON `qredit_payments` (`client_reference`);--> statement-breakpoint
CREATE UNIQUE INDEX `qredit_payment_ref_uq` ON `qredit_payments` (`payment_reference`);--> statement-breakpoint
CREATE UNIQUE INDEX `qredit_order_ref_uq` ON `qredit_payments` (`order_reference`);--> statement-breakpoint
CREATE INDEX `qredit_invoice_idx` ON `qredit_payments` (`clinic_id`,`branch_id`,`invoice_id`,`status`);--> statement-breakpoint
ALTER TABLE `clinic_records` ADD `branch_id` text;--> statement-breakpoint
ALTER TABLE `invoice_payments` ADD `branch_id` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `branch_id` text;--> statement-breakpoint
ALTER TABLE `medical_files` ADD `branch_id` text;--> statement-breakpoint
ALTER TABLE `stock_items` ADD `branch_id` text;--> statement-breakpoint
ALTER TABLE `stock_movements` ADD `branch_id` text;