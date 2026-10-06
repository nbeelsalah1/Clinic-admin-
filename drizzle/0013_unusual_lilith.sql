ALTER TABLE `clinics` ADD `contact_phone` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `clinics` ADD `contact_email` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `clinics` ADD `contact_address` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `clinics` ADD `default_appointment_minutes` integer DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE `clinics` ADD `invoice_prefix` text DEFAULT 'INV' NOT NULL;--> statement-breakpoint
ALTER TABLE `clinics` ADD `invoice_footer` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `clinics` ADD `default_tax_bps` integer DEFAULT 0 NOT NULL;