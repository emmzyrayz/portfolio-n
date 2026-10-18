import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/** Tenant registry. The portfolio itself is the default app (slug "portfolio"). */
export const apps = pgTable("apps", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appId: uuid("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull().default("owner"),
    createdAt: createdAt(),
  },
  (t) => [unique("users_app_email_unique").on(t.appId, t.email)],
);

export const otpCodes = pgTable(
  "otp_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appId: uuid("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    /** HMAC of the code; the plain code is never stored. */
    codeHash: text("code_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [index("otp_codes_app_email_idx").on(t.appId, t.email)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appId: uuid("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** Fixed-window counters; DB-backed because in-memory limits don't survive serverless. */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  count: integer("count").notNull().default(0),
});

/* ---------- Portfolio content (Phase 3) ---------- */

export const CONTENT_SECTIONS = ["profile", "skills", "experience", "projects"] as const;
export type ContentSection = (typeof CONTENT_SECTIONS)[number];

/**
 * A row means "the owner has saved this section", so the DB wins even when a list
 * is empty. No row means the static fallback in src/content is used.
 */
export const contentSections = pgTable(
  "content_sections",
  {
    appId: uuid("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    section: text("section").$type<ContentSection>().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.appId, t.section] })],
);

export type SocialRow = { key: string; name: string; url: string };

export const siteProfile = pgTable("site_profile", {
  appId: uuid("app_id")
    .primaryKey()
    .references(() => apps.id, { onDelete: "cascade" }),
  firstName: text("first_name").notNull(),
  fullName: text("full_name").notNull(),
  title: text("title").notNull(),
  subtitle: text("subtitle").notNull(),
  location: text("location").notNull(),
  summary: text("summary").notNull(),
  description: text("description").notNull(),
  email: text("email").notNull(),
  resumeUrl: text("resume_url"),
  socials: jsonb("socials").$type<SocialRow[]>().notNull().default([]),
  aboutParagraphs: jsonb("about_paragraphs").$type<string[]>().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const skills = pgTable(
  "skills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appId: uuid("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    icon: text("icon").notNull(),
    proficiency: integer("proficiency").notNull(),
    position: integer("position").notNull(),
  },
  (t) => [index("skills_app_position_idx").on(t.appId, t.position)],
);

export const experiences = pgTable(
  "experiences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appId: uuid("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    company: text("company").notNull(),
    period: text("period").notNull(),
    description: text("description").notNull(),
    position: integer("position").notNull(),
  },
  (t) => [index("experiences_app_position_idx").on(t.appId, t.position)],
);

export const featuredProjects = pgTable(
  "featured_projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appId: uuid("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    technologies: text("technologies").array().notNull().default(sql`'{}'::text[]`),
    imageUrl: text("image_url"),
    githubLink: text("github_link"),
    liveLink: text("live_link"),
    /** "owner/name" when imported from GitHub; null for manual projects. */
    repoFullName: text("repo_full_name"),
    isPrivate: boolean("is_private").notNull().default(false),
    stars: integer("stars").notNull().default(0),
    position: integer("position").notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("featured_projects_app_position_idx").on(t.appId, t.position)],
);
