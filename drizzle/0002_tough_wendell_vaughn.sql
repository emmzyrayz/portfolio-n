ALTER TABLE "featured_projects" ADD COLUMN "repo_full_name" text;--> statement-breakpoint
ALTER TABLE "featured_projects" ADD COLUMN "is_private" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "featured_projects" ADD COLUMN "stars" integer DEFAULT 0 NOT NULL;