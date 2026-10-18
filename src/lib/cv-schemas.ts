import { z } from "zod";

// Shared by Server Actions (authoritative), the Gemini pipeline and the editor (types + flags).

const line = (label: string, max: number) =>
  z.string().trim().min(1, `${label} is required.`).max(max, `${label} must be at most ${max} characters.`);

/** http(s) only, so nothing like `javascript:` can reach a PDF link or an href. */
const httpUrl = z.httpUrl("Enter a full http(s) URL.").max(500);
const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

export const cvContentSchema = z.object({
  header: z.object({
    fullName: line("Name", 100),
    title: z.string().trim().max(120),
    email: z.email("Enter a valid email address.").max(200),
    location: z.string().trim().max(100),
    links: z.array(z.object({ label: line("Label", 40), url: httpUrl })).max(6),
  }),
  headline: z.string().trim().max(140),
  summary: z.string().trim().max(1500),
  skills: z
    .array(z.object({ group: line("Group", 60), items: z.array(line("Skill", 40)).max(30) }))
    .max(8, "At most 8 skill groups."),
  experience: z
    .array(
      z.object({
        /** Links the entry to the owner's saved experience; absent = typed by hand. */
        sourceId: z.string().max(60).optional(),
        role: line("Role", 100),
        company: line("Company", 100),
        period: line("Period", 60),
        bullets: z.array(line("Bullet", 400)).max(8, "At most 8 bullets per role."),
      }),
    )
    .max(15, "At most 15 roles."),
  projects: z
    .array(
      z.object({
        sourceId: z.string().max(60).optional(),
        title: line("Title", 100),
        technologies: z.array(line("Technology", 30)).max(10),
        liveLink: z.preprocess(emptyToUndefined, httpUrl.optional()),
        bullets: z.array(line("Bullet", 400)).max(4, "At most 4 bullets per project."),
      }),
    )
    .max(8, "At most 8 projects."),
  /** Not in the site data, so entered by hand here (never model-generated). */
  education: z
    .array(z.object({ institution: line("Institution", 120), qualification: line("Qualification", 160), period: z.string().trim().max(60) }))
    .max(6),
});

export type CvContent = z.infer<typeof cvContentSchema>;

/** What the model is allowed to return: only wording, selection and order. Facts are merged in from the source. */
export const cvModelOutputSchema = z.object({
  headline: z.string(),
  summary: z.string(),
  skills: z.array(z.object({ group: z.string(), items: z.array(z.string()) })),
  experience: z.array(z.object({ sourceId: z.string(), bullets: z.array(z.string()) })),
  projects: z.array(z.object({ sourceId: z.string(), bullets: z.array(z.string()) })),
});

export type CvModelOutput = z.infer<typeof cvModelOutputSchema>;

/** Snapshot of the owner's real data used to ground (and later check) a CV. */
export type CvSource = {
  profile: {
    fullName: string;
    title: string;
    location: string;
    email: string;
    summary: string;
    description: string;
    socials: { name: string; url: string }[];
  };
  about: string[];
  experience: { id: string; role: string; company: string; period: string; description: string }[];
  skills: string[];
  projects: { id: string; title: string; description: string; technologies: string[]; liveLink?: string; isPrivate: boolean }[];
};

export const generateInputSchema = z.object({
  jobTitle: line("Job title", 120),
  company: z.string().trim().max(120).optional(),
  jobDescription: z
    .string()
    .trim()
    .min(40, "Paste the full job description (at least 40 characters).")
    .max(8000, "The job description is too long (max 8000 characters)."),
  length: z.enum(["one-page", "two-page"]),
});

export type GenerateInput = z.infer<typeof generateInputSchema>;
