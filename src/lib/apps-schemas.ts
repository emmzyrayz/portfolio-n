import { z } from "zod";
import { APP_SLUG_MAX, APP_SLUG_PATTERN } from "@/lib/hub-shape";

// Shared by the Server Actions (authoritative) and the forms (hints only).

export const MAX_ACTIVE_KEYS = 5;

/** Slugs that would collide with routes, the owner's own tenant, or look official. */
export const RESERVED_SLUGS = ["portfolio", "api", "hub", "admin", "www", "internal", "dashboard", "login", "app", "apps", "system", "root", "test"];

export const registerAppSchema = z.object({
  name: z.string().trim().min(2, "Enter the client or project name.").max(80, "Name is too long."),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Use at least 3 characters.")
    .max(APP_SLUG_MAX, `Use at most ${APP_SLUG_MAX} characters.`)
    .regex(APP_SLUG_PATTERN, "Lowercase letters, numbers and single hyphens only (e.g. acme-store).")
    .refine((s) => !RESERVED_SLUGS.includes(s), "That identifier is reserved."),
});

export const createKeySchema = z.object({
  name: z.string().trim().min(2, "Name the key (e.g. production, staging).").max(60, "Name is too long."),
  rateLimitPerMin: z.coerce.number().int("Whole numbers only.").min(1, "At least 1 request per minute.").max(1000, "At most 1000 requests per minute."),
});

export const idSchema = z.uuid();
