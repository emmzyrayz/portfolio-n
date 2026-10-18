CREATE TABLE "cv_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"title" text NOT NULL,
	"job_title" text NOT NULL,
	"company" text,
	"job_description" text NOT NULL,
	"content" jsonb NOT NULL,
	"source" jsonb NOT NULL,
	"model" text,
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cv_documents" ADD CONSTRAINT "cv_documents_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cv_documents_app_updated_idx" ON "cv_documents" USING btree ("app_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cv_documents_one_published_idx" ON "cv_documents" USING btree ("app_id") WHERE "cv_documents"."is_published";