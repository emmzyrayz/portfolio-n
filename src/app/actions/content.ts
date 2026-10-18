"use server";

import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";
import type { z } from "zod";
import { verifyOwner } from "@/lib/dal";
import {
  resetSection as resetSectionInDb,
  saveExperience,
  saveProfile,
  saveProjects,
  saveSkills,
} from "@/lib/content-admin";
import { experienceSchema, profileSchema, projectsSchema, skillsSchema } from "@/lib/content-schemas";
import { CONTENT_SECTIONS, type ContentSection } from "@/db/schema";

export type ContentState = {
  status: "idle" | "success" | "error";
  message?: string;
  /** Keyed by zod path: "email", "socials.0.url" (profile) or "2.name" (list sections). */
  fieldErrors?: Record<string, string>;
};

function refreshPublicSite(section: ContentSection) {
  updateTag(`content:${section}`); // expire the "use cache" entries (read-your-own-writes)
  if (section === "profile") {
    // Navbar, footer and metadata live in the root layout and use the profile.
    revalidatePath("/", "layout");
  } else {
    revalidatePath("/");
  }
}

async function saveSection<S extends z.ZodType>(
  section: ContentSection,
  schema: S,
  formData: FormData,
  save: (input: z.output<S>) => Promise<{ message: string; fieldErrors?: Record<string, string> } | void>,
): Promise<ContentState> {
  await verifyOwner(); // authorise first, from the cookie, never from the client

  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return { status: "error", message: "Malformed form data. Please reload and try again." };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[issue.path.join(".")] ??= issue.message;
    return { status: "error", message: "Please fix the highlighted fields.", fieldErrors };
  }

  try {
    const rejected = await save(parsed.data);
    if (rejected) return { status: "error", message: rejected.message, fieldErrors: rejected.fieldErrors };
  } catch (error) {
    console.error(`Saving ${section} failed:`, error);
    return { status: "error", message: "Could not save. Please try again." };
  }

  refreshPublicSite(section);
  return { status: "success", message: "Saved. The public site is updated." };
}

export async function saveProfileAction(_prev: ContentState, formData: FormData) {
  return saveSection("profile", profileSchema, formData, saveProfile);
}

export async function saveSkillsAction(_prev: ContentState, formData: FormData) {
  return saveSection("skills", skillsSchema, formData, saveSkills);
}

export async function saveExperienceAction(_prev: ContentState, formData: FormData) {
  return saveSection("experience", experienceSchema, formData, saveExperience);
}

export async function saveProjectsAction(_prev: ContentState, formData: FormData) {
  return saveSection("projects", projectsSchema, formData, saveProjects);
}

/** Drops the saved content so the section serves the static defaults again. */
export async function resetSectionAction(section: string) {
  await verifyOwner();
  if (!(CONTENT_SECTIONS as readonly string[]).includes(section)) return;
  await resetSectionInDb(section as ContentSection);
  refreshPublicSite(section as ContentSection);
  redirect(`/dashboard/edit/${section}?reset=${Date.now()}`);
}
