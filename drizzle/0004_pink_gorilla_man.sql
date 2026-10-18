CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" text NOT NULL,
	"rate_limit_per_min" integer DEFAULT 60 NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "kind" text DEFAULT 'client' NOT NULL;--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "status_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_key_hash_idx" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "api_keys_app_idx" ON "api_keys" USING btree ("app_id");--> statement-breakpoint
-- The owner's own site must never be reachable through the hub: mark it internal before any hub use.
UPDATE "apps" SET "kind" = 'internal' WHERE "slug" = 'portfolio';--> statement-breakpoint
-- Default contract tenants (idempotent; names can be edited later in the dashboard).
INSERT INTO "apps" ("slug", "name", "kind", "status") VALUES
	('de-geogold', 'De Geogold', 'client', 'active'),
	('client-staging', 'Client Staging', 'client', 'active'),
	('lab-project', 'Lab Project', 'client', 'active')
ON CONFLICT ("slug") DO NOTHING;