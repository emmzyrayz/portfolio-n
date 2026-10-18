import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { contentSections, experiences, featuredProjects, siteProfile, skills, type ContentSection } from "@/db/schema";
import { getDefaultAppId } from "@/lib/app";
import { aboutParagraphs, profile, type Profile, type Social, type SocialKey } from "@/content/profile";
import { skills as fallbackSkills, type Skill, type SkillIcon } from "@/content/skills";
import { experience as fallbackExperience, type Experience } from "@/content/experience";
import type { Project } from "@/content/projects";

/**
 * Public content readers. Each section is "customised" (a content_sections row
 * exists -> the DB wins, even when empty) or "default" (no row -> static
 * fallback from src/content). DB errors never get cached: loaders throw inside
 * the cached function and the thin wrappers below serve the static fallback.
 */

export type SiteProfile = Profile & { aboutParagraphs: string[] };

export const fallbackProfile: SiteProfile = { ...profile, aboutParagraphs };

/* ---------- Uncached loaders (shared with the dashboard) ---------- */

export async function isCustomised(appId: string, section: ContentSection) {
  const [row] = await getDb()
    .select({ section: contentSections.section })
    .from(contentSections)
    .where(and(eq(contentSections.appId, appId), eq(contentSections.section, section)));
  return Boolean(row);
}

/** null = never saved (use the static fallback). */
export async function loadProfile(appId: string): Promise<SiteProfile | null> {
  if (!(await isCustomised(appId, "profile"))) return null;
  const [row] = await getDb().select().from(siteProfile).where(eq(siteProfile.appId, appId));
  if (!row) return null;
  return {
    fullName: row.fullName,
    firstName: row.firstName,
    title: row.title,
    subtitle: row.subtitle,
    location: row.location,
    summary: row.summary,
    description: row.description,
    email: row.email,
    resumeUrl: row.resumeUrl ?? undefined,
    socials: row.socials.map((s) => ({ key: s.key as SocialKey, name: s.name, url: s.url })) satisfies Social[],
    aboutParagraphs: row.aboutParagraphs,
  };
}

export async function loadSkills(appId: string): Promise<Skill[] | null> {
  if (!(await isCustomised(appId, "skills"))) return null;
  const rows = await getDb().select().from(skills).where(eq(skills.appId, appId)).orderBy(asc(skills.position));
  return rows.map((r) => ({ name: r.name, icon: r.icon as SkillIcon, proficiency: r.proficiency }));
}

export async function loadExperience(appId: string): Promise<Experience[] | null> {
  if (!(await isCustomised(appId, "experience"))) return null;
  const rows = await getDb()
    .select()
    .from(experiences)
    .where(eq(experiences.appId, appId))
    .orderBy(asc(experiences.position));
  return rows.map((r) => ({ role: r.role, company: r.company, period: r.period, description: r.description }));
}

export async function loadFeaturedProjects(appId: string): Promise<Project[] | null> {
  if (!(await isCustomised(appId, "projects"))) return null;
  const rows = await getDb()
    .select()
    .from(featuredProjects)
    .where(eq(featuredProjects.appId, appId))
    .orderBy(asc(featuredProjects.position));
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    technologies: r.technologies,
    image: r.imageUrl ?? undefined,
    githubLink: r.githubLink ?? undefined,
    liveLink: r.liveLink ?? undefined,
    stars: r.stars,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

/* ---------- Cached readers ---------- */

async function cachedProfile() {
  "use cache";
  cacheLife("hours");
  cacheTag("content:profile");
  return loadProfile(await getDefaultAppId());
}

async function cachedSkills() {
  "use cache";
  cacheLife("hours");
  cacheTag("content:skills");
  return loadSkills(await getDefaultAppId());
}

async function cachedExperience() {
  "use cache";
  cacheLife("hours");
  cacheTag("content:experience");
  return loadExperience(await getDefaultAppId());
}

async function cachedFeaturedProjects() {
  "use cache";
  cacheLife("hours");
  cacheTag("content:projects");
  return loadFeaturedProjects(await getDefaultAppId());
}

/* ---------- Public API: DB content or static fallback ---------- */

async function orFallback<T>(read: () => Promise<T | null>, fallback: T): Promise<T> {
  try {
    return (await read()) ?? fallback;
  } catch (error) {
    console.error("Content read failed, serving static fallback:", error);
    return fallback;
  }
}

export const getProfile = () => orFallback(cachedProfile, fallbackProfile);
export const getSkills = () => orFallback(cachedSkills, fallbackSkills);
export const getExperience = () => orFallback(cachedExperience, fallbackExperience);

/** null = not customised, so the caller falls back to GitHub, then static placeholders. */
export async function getFeaturedProjects(): Promise<Project[] | null> {
  try {
    return await cachedFeaturedProjects();
  } catch (error) {
    console.error("Featured projects read failed:", error);
    return null;
  }
}
