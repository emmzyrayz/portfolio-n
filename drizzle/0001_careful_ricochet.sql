CREATE TABLE "content_sections" (
	"app_id" uuid NOT NULL,
	"section" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_sections_app_id_section_pk" PRIMARY KEY("app_id","section")
);
--> statement-breakpoint
CREATE TABLE "experiences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"role" text NOT NULL,
	"company" text NOT NULL,
	"period" text NOT NULL,
	"description" text NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "featured_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"technologies" text[] DEFAULT '{}'::text[] NOT NULL,
	"image_url" text,
	"github_link" text,
	"live_link" text,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_profile" (
	"app_id" uuid PRIMARY KEY NOT NULL,
	"first_name" text NOT NULL,
	"full_name" text NOT NULL,
	"title" text NOT NULL,
	"subtitle" text NOT NULL,
	"location" text NOT NULL,
	"summary" text NOT NULL,
	"description" text NOT NULL,
	"email" text NOT NULL,
	"resume_url" text,
	"socials" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"about_paragraphs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"name" text NOT NULL,
	"icon" text NOT NULL,
	"proficiency" integer NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_sections" ADD CONSTRAINT "content_sections_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiences" ADD CONSTRAINT "experiences_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "featured_projects" ADD CONSTRAINT "featured_projects_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_profile" ADD CONSTRAINT "site_profile_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "experiences_app_position_idx" ON "experiences" USING btree ("app_id","position");--> statement-breakpoint
CREATE INDEX "featured_projects_app_position_idx" ON "featured_projects" USING btree ("app_id","position");--> statement-breakpoint
CREATE INDEX "skills_app_position_idx" ON "skills" USING btree ("app_id","position");