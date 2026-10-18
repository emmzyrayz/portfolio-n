CREATE TABLE "telemetry_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"key_id" uuid,
	"event_type" text NOT NULL,
	"level" text NOT NULL,
	"message" text NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "telemetry_logs" ADD CONSTRAINT "telemetry_logs_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telemetry_logs" ADD CONSTRAINT "telemetry_logs_key_id_api_keys_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "telemetry_app_level_created_idx" ON "telemetry_logs" USING btree ("app_id","level","created_at");--> statement-breakpoint
CREATE INDEX "telemetry_app_created_idx" ON "telemetry_logs" USING btree ("app_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "telemetry_created_idx" ON "telemetry_logs" USING btree ("created_at");