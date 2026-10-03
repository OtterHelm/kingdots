CREATE TABLE `relay_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`body` text NOT NULL,
	`collected` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `relay_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `relay_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`nonce` text NOT NULL,
	`state` text NOT NULL,
	`snapshot` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
