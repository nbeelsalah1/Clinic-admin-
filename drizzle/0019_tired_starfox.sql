CREATE TABLE `ai_provider_settings` (
	`provider` text PRIMARY KEY NOT NULL,
	`api_key_enc` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
