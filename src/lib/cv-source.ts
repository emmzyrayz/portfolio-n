import "server-only";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { featuredProjects } from "@/db/schema";
import { getDefaultAppId } from "@/lib/app";
import { getEditableExperience, getEditableProfile, getEditableSkills, getSectionStatus } from "@/lib/content-admin";
import { verifyOwner } from "@/lib/dal";
import type { CvSource } from "@/lib/cv-schemas";

export type CvSourceResult =
  | { ok: true; source: CvSource; warnings: string[] }
  | { ok: false; message: string };

/**
 * The owner's real facts for CV grounding, read server-side. Blocks generation while the profile or
 * experience are still the built-in placeholders: a tailored CV is only as true as its source.
 */
export async function buildCvSource(): Promise<CvSourceResult> {
  await verifyOwner();
  const status = await getSectionStatus();

  const missing = [!status.profile && "Hero, About & Contact", !status.experience && "Experience"].filter(Boolean);
  if (missing.length > 0) {
    return {
      ok: false,
      message: `Your ${missing.join(" and ")} still use the built-in placeholder content. Edit and save ${
        missing.length > 1 ? "them" : "it"
      } in the dashboard first, so the CV is built from your real details.`,
    };
  }

  const warnings: string[] = [];
  if (!status.skills) warnings.push("Skills still use the default list; check it is accurate.");
  if (!status.projects) warnings.push("No featured projects saved yet, so none will be included.");

  const [profile, experience, skills] = await Promise.all([getEditableProfile(), getEditableExperience(), getEditableSkills()]);

  let projects: CvSource["projects"] = [];
  if (status.projects) {
    const rows = await getDb()
      .select()
      .from(featuredProjects)
      .where(eq(featuredProjects.appId, await getDefaultAppId()))
      .orderBy(asc(featuredProjects.position));
    projects = rows.map((r, i) => ({
      id: `proj-${i}`,
      title: r.title,
      description: r.description,
      technologies: r.technologies,
      // never a GitHub link: only the live URL, same rule as the public site
      liveLink: r.liveLink ?? undefined,
      isPrivate: r.isPrivate,
    }));
  }

  const source: CvSource = {
    profile: {
      fullName: profile.fullName,
      title: `${profile.title} ${profile.subtitle}`.trim(),
      location: profile.location,
      email: profile.email,
      summary: profile.summary,
      description: profile.description,
      socials: profile.socials.map((s) => ({ name: s.name, url: s.url })),
    },
    about: profile.aboutParagraphs,
    experience: experience.map((e, i) => ({ id: `exp-${i}`, role: e.role, company: e.company, period: e.period, description: e.description })),
    skills: skills.map((s) => s.name),
    projects,
  };
  return { ok: true, source, warnings };
}
