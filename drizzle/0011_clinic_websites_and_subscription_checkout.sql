CREATE TABLE `qredit_subscription_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`subscription_id` text NOT NULL,
	`user_id` text NOT NULL,
	`client_reference` text NOT NULL,
	`order_reference` text,
	`payment_reference` text,
	`checkout_url` text,
	`amount_ils` integer NOT NULL,
	`status` text DEFAULT 'creating' NOT NULL,
	`provider_status` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`paid_at` text,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `qredit_sub_client_ref_uq` ON `qredit_subscription_payments` (`client_reference`);--> statement-breakpoint
CREATE UNIQUE INDEX `qredit_sub_payment_ref_uq` ON `qredit_subscription_payments` (`payment_reference`);--> statement-breakpoint
CREATE UNIQUE INDEX `qredit_sub_order_ref_uq` ON `qredit_subscription_payments` (`order_reference`);--> statement-breakpoint
CREATE INDEX `qredit_sub_owner_date_idx` ON `qredit_subscription_payments` (`user_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `clinics` ADD `public_slug` text;--> statement-breakpoint
ALTER TABLE `clinics` ADD `public_description` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `clinics` ADD `public_phone` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `clinics` ADD `public_address` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `clinics` ADD `public_booking_url` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `clinics` ADD `public_enabled` integer DEFAULT false NOT NULL;