import "server-only";
import { and, asc, eq } from "drizzle-orm";
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
import { fetchGithubRepos, type GithubRepo, type GithubReposResult } from "@/lib/github-repos";
import {
  fallbackProfile,
  isCustomised,
  loadExperience,
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

export type EditableProjects = {
  /** Rows the owner has saved (visible on the portfolio), in display order. */
  saved: EditableProject[];
  customised: boolean;
  github: GithubReposResult;
};

export async function getEditableProjects(): Promise<EditableProjects> {
  await verifyOwner();
  const appId = await getDefaultAppId();
  const db = getDb();
  const [customised, github] = await Promise.all([isCustomised(appId, "projects"), fetchGithubRepos()]);

  let saved: EditableProject[];
  if (customised) {
    const rows = await db
      .select()
      .from(featuredProjects)
      .where(eq(featuredProjects.appId, appId))
      .orderBy(asc(featuredProjects.position));
    saved = rows.map((r) => ({
      title: r.title,
      description: r.description,
      technologies: r.technologies,
      imageUrl: r.imageUrl ?? undefined,
      // a private repo never carries a GitHub link, even if one slipped into the row
      githubLink: r.isPrivate ? undefined : (r.githubLink ?? undefined),
      liveLink: r.liveLink ?? undefined,
      repo: r.repoFullName ?? undefined,
      isPrivate: r.isPrivate,
    }));
  } else if (github.status === "ok") {
    saved = []; // nothing chosen yet: the owner picks from their repositories
  } else {
    saved = fallbackProjects.map((p) => ({
      title: p.title,
      description: p.description,
      technologies: p.technologies,
      imageUrl: p.image,
      githubLink: p.githubLink,
      liveLink: p.liveLink,
      isPrivate: false,
    }));
  }
  return { saved, customised, github };
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

export type ProjectsSaveError = { message: string; fieldErrors?: Record<string, string> };

function isGithubHosted(url: string) {
  try {
    const host = new URL(url).hostname;
    return host === "opengraph.githubassets.com" || host.endsWith("githubusercontent.com");
  } catch {
    return false;
  }
}

/**
 * Repo-linked rows are re-checked against GitHub: privacy, stars and dates come from GitHub,
 * never from the browser. A private repo can never save a GitHub link or a GitHub-hosted image.
 */
export async function saveProjects(input: ProjectsInput): Promise<ProjectsSaveError | void> {
  await verifyOwner();
  const appId = await getDefaultAppId();
  const db = getDb();

  let repos = new Map<string, GithubRepo>();
  if (input.some((p) => p.repo)) {
    const github = await fetchGithubRepos();
    if (github.status !== "ok") {
      return { message: "Could not verify your GitHub repositories, so nothing was saved. Please try again in a moment." };
    }
    repos = new Map(github.repos.map((r) => [r.fullName.toLowerCase(), r]));
  }

  const fieldErrors: Record<string, string> = {};
  const now = new Date();
  const rows = input.map((p, position) => {
    const gh = p.repo ? repos.get(p.repo.toLowerCase()) : undefined;
    if (p.repo && !gh) fieldErrors[`${position}.title`] = "This repository was not found on your GitHub account.";

    const isPrivate = gh?.isPrivate ?? false; // authoritative, not the client's claim
    let githubLink = p.githubLink ?? null;
    let imageUrl = p.imageUrl ?? null;
    if (isPrivate) {
      githubLink = null;
      if (imageUrl && isGithubHosted(imageUrl)) imageUrl = null;
      if (!p.liveLink) {
        fieldErrors[`${position}.liveLink`] = "A private project needs a live URL: it is the only link visitors will get.";
      }
    }

    return {
      appId,
      position, // array order, computed here, never trusted from the client
      title: p.title,
      description: p.description,
      technologies: p.technologies,
      imageUrl,
      githubLink,
      liveLink: p.liveLink ?? null,
      repoFullName: gh?.fullName ?? null,
      isPrivate,
      stars: gh?.stars ?? 0,
      createdAt: gh ? new Date(gh.createdAt) : now,
      updatedAt: gh ? new Date(gh.updatedAt) : now,
    };
  });

  if (Object.keys(fieldErrors).length > 0) return { message: "Please fix the highlighted fields.", fieldErrors };

  const queries: BatchItem<"pg">[] = [db.delete(featuredProjects).where(eq(featuredProjects.appId, appId))];
  if (rows.length > 0) queries.push(db.insert(featuredProjects).values(rows));
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
