import "server-only";
import { and, eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { getDb } from "@/db";
import {
  CONTENT_SECTIONS,
  contentSections,
  experiences,
  featuredProjects,
  siteProfile,
  skills,
  type ContentSection,
} from "@/db/schema";
import { getDefaultAppId } from "@/lib/app";
import { verifyOwner } from "@/lib/dal";
import {
  fallbackProfile,
  isCustomised,
  loadExperience,
  loadFeaturedProjects,
  loadProfile,
  loadSkills,
  type SiteProfile,
} from "@/lib/content";
import { fallbackProjects } from "@/content/projects";
import { skills as fallbackSkills } from "@/content/skills";
import { experience as fallbackExperience } from "@/content/experience";
import type { ExperienceInput, ProfileInput, ProjectsInput, SkillsInput } from "@/lib/content-schemas";

// Every function here re-verifies the owner session itself (data access layer),
// so a caller can never reach the DB by forgetting a check.

export type EditableProject = ProjectsInput[number];

/* ---------- Reads for the editors (never cached) ---------- */

export async function getSectionStatus(): Promise<Record<ContentSection, boolean>> {
  await verifyOwner();
  const appId = await getDefaultAppId();
  const entries = await Promise.all(CONTENT_SECTIONS.map(async (s) => [s, await isCustomised(appId, s)] as const));
  return Object.fromEntries(entries) as Record<ContentSection, boolean>;
}

export async function getEditableProfile(): Promise<SiteProfile> {
  await verifyOwner();
  return (await loadProfile(await getDefaultAppId())) ?? fallbackProfile;
}

export async function getEditableSkills() {
  await verifyOwner();
  return (await loadSkills(await getDefaultAppId())) ?? fallbackSkills;
}

export async function getEditableExperience() {
  await verifyOwner();
  return (await loadExperience(await getDefaultAppId())) ?? fallbackExperience;
}

export async function getEditableProjects(): Promise<EditableProject[]> {
  await verifyOwner();
  const rows = (await loadFeaturedProjects(await getDefaultAppId())) ?? fallbackProjects;
  return rows.map((p) => ({
    title: p.title,
    description: p.description,
    technologies: p.technologies,
    imageUrl: p.image,
    githubLink: p.githubLink,
    liveLink: p.liveLink,
  }));
}

/* ---------- Writes ---------- */

const markSection = (appId: string, section: ContentSection) =>
  getDb()
    .insert(contentSections)
    .values({ appId, section })
    .onConflictDoUpdate({ target: [contentSections.appId, contentSections.section], set: { updatedAt: new Date() } });

export async function saveProfile(input: ProfileInput) {
  await verifyOwner();
  const appId = await getDefaultAppId();
  const db = getDb();
  const values = { ...input, resumeUrl: input.resumeUrl ?? null, updatedAt: new Date() };
  await db.batch([
    db
      .insert(siteProfile)
      .values({ appId, ...values })
      .onConflictDoUpdate({ target: siteProfile.appId, set: values }),
    markSection(appId, "profile"),
  ]);
}

export async function saveSkills(input: SkillsInput) {
  await verifyOwner();
  const appId = await getDefaultAppId();
  const db = getDb();
  const queries: BatchItem<"pg">[] = [db.delete(skills).where(eq(skills.appId, appId))];
  if (input.length > 0) {
    // position is the array order, computed here, never trusted from the client
    queries.push(db.insert(skills).values(input.map((s, position) => ({ ...s, appId, position }))));
  }
  queries.push(markSection(appId, "skills"));
  await db.batch(queries as [BatchItem<"pg">, ...BatchItem<"pg">[]]);
}

export async function saveExperience(input: ExperienceInput) {
  await verifyOwner();
  const appId = await getDefaultAppId();
  const db = getDb();
  const queries: BatchItem<"pg">[] = [db.delete(experiences).where(eq(experiences.appId, appId))];
  if (input.length > 0) {
    queries.push(db.insert(experiences).values(input.map((e, position) => ({ ...e, appId, position }))));
  }
  queries.push(markSection(appId, "experience"));
  await db.batch(queries as [BatchItem<"pg">, ...BatchItem<"pg">[]]);
}

export async function saveProjects(input: ProjectsInput) {
  await verifyOwner();
  const appId = await getDefaultAppId();
  const db = getDb();
  const queries: BatchItem<"pg">[] = [db.delete(featuredProjects).where(eq(featuredProjects.appId, appId))];
  if (input.length > 0) {
    queries.push(
      db.insert(featuredProjects).values(
        input.map((p, position) => ({
          appId,
          position,
          title: p.title,
          description: p.description,
          technologies: p.technologies,
          imageUrl: p.imageUrl ?? null,
          githubLink: p.githubLink ?? null,
          liveLink: p.liveLink ?? null,
        })),
      ),
    );
  }
  queries.push(markSection(appId, "projects"));
  await db.batch(queries as [BatchItem<"pg">, ...BatchItem<"pg">[]]);
}

/** Back to the static defaults: drop the rows and the "customised" marker. */
export async function resetSection(section: ContentSection) {
  await verifyOwner();
  const appId = await getDefaultAppId();
  const db = getDb();
  const clear = {
    profile: () => db.delete(siteProfile).where(eq(siteProfile.appId, appId)),
    skills: () => db.delete(skills).where(eq(skills.appId, appId)),
    experience: () => db.delete(experiences).where(eq(experiences.appId, appId)),
    projects: () => db.delete(featuredProjects).where(eq(featuredProjects.appId, appId)),
  }[section]();
  await db.batch([
    clear,
    db.delete(contentSections).where(and(eq(contentSections.appId, appId), eq(contentSections.section, section))),
  ]);
}
