import { z } from "zod";

// Shared by the Server Actions (authoritative) and the editors (types only).

const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optional = <T extends z.ZodType>(schema: T) => z.preprocess(emptyToUndefined, schema.optional());

const text = (label: string, max: number) =>
  z.string().trim().min(1, `${label} is required.`).max(max, `${label} must be at most ${max} characters.`);

/** http(s) only, so a `javascript:` URL can never end up in an href. */
const httpUrl = z.httpUrl("Enter a full http(s) URL.").max(500);

/** Full https URL or a site-relative path such as /images/shot.png or /resume.pdf. */
const urlOrPath = z.union(
  [httpUrl, z.string().max(500).regex(/^\/(?!\/)[^\s\\]*$/)],
  { error: "Enter a full http(s) URL or a path starting with a single /." },
);

export const SOCIAL_KEYS = ["github", "linkedin", "x", "reddit", "facebook"] as const;
export const SKILL_ICONS = [
  "git",
  "javascript",
  "sass",
  "nestjs",
  "tailwind",
  "nextjs",
  "github",
  "react",
  "nodejs",
  "mongodb",
] as const;

export const profileSchema = z.object({
  firstName: text("First name", 60),
  fullName: text("Full name", 100),
  title: text("Title", 60),
  subtitle: text("Subtitle", 60),
  location: text("Location", 100),
  summary: text("Summary", 300),
  description: text("Description", 1000),
  email: z.email("Enter a valid email address.").max(200),
  resumeUrl: optional(urlOrPath),
  socials: z
    .array(z.object({ key: z.enum(SOCIAL_KEYS), name: text("Name", 40), url: httpUrl }))
    .max(10, "At most 10 social links."),
  aboutParagraphs: z.array(text("Paragraph", 2000)).max(8, "At most 8 paragraphs."),
});

export const skillsSchema = z
  .array(
    z.object({
      name: text("Name", 50),
      icon: z.enum(SKILL_ICONS),
      proficiency: z.coerce.number().int("Whole numbers only.").min(0).max(100),
    }),
  )
  .max(40, "At most 40 skills.");

export const experienceSchema = z
  .array(
    z.object({
      role: text("Role", 100),
      company: text("Company", 100),
      period: text("Period", 60),
      description: text("Description", 2000),
    }),
  )
  .max(30, "At most 30 entries.");

export const projectsSchema = z
  .array(
    z.object({
      title: text("Title", 100),
      description: text("Description", 1000),
      technologies: z.array(text("Technology", 30)).max(10, "At most 10 technologies."),
      imageUrl: optional(urlOrPath),
      githubLink: optional(httpUrl),
      liveLink: optional(httpUrl),
    }),
  )
  .max(30, "At most 30 projects.");

export type ProfileInput = z.infer<typeof profileSchema>;
export type SkillsInput = z.infer<typeof skillsSchema>;
export type ExperienceInput = z.infer<typeof experienceSchema>;
export type ProjectsInput = z.infer<typeof projectsSchema>;
