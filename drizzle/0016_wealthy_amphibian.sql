ALTER TABLE `clinic_integrations` ADD `api_key_hash` text;--> statement-breakpoint
ALTER TABLE `clinic_integrations` ADD `api_enabled` integer DEFAULT 0 NOT NULL;