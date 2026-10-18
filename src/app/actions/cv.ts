"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { verifyOwner } from "@/lib/dal";
import { rateLimited } from "@/lib/rate-limit";
import { buildCvSource } from "@/lib/cv-source";
import { mergeModelOutput } from "@/lib/cv-ground";
import { CvGenerationError, generateCvWording } from "@/lib/gemini";
import { createCv, deleteCv, getCv, replaceCvGeneration, setPublished, updateCvContent } from "@/lib/cv-admin";
import { cvContentSchema, generateInputSchema, type GenerateInput } from "@/lib/cv-schemas";

export type CvState = {
  status: "idle" | "success" | "error";
  message?: string;
  /** Keyed by zod path, e.g. "jobDescription", "experience.0.role". */
  fieldErrors?: Record<string, string>;
  warnings?: string[];
};

const HOUR_MS = 60 * 60 * 1000;
const MAX_GENERATIONS_PER_HOUR = 10;

function zodErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) fieldErrors[issue.path.map(String).join(".")] ??= issue.message;
  return fieldErrors;
}

/** Rate-limit, read the owner's facts, call Gemini and merge. Never trusts the model for facts. */
async function runGeneration(userId: string, input: GenerateInput) {
  if (await rateLimited(`cv-generate:${userId}`, MAX_GENERATIONS_PER_HOUR, HOUR_MS)) {
    return { ok: false, error: "You've reached the hourly limit for CV generations. Please try again later." } as const;
  }
  const sourceResult = await buildCvSource();
  if (!sourceResult.ok) return { ok: false, error: sourceResult.message } as const;

  try {
    const { output, model } = await generateCvWording(sourceResult.source, input);
    const merged = mergeModelOutput(sourceResult.source, output);
    return { ok: true, source: sourceResult.source, merged, model, warnings: sourceResult.warnings } as const;
  } catch (error) {
    if (error instanceof CvGenerationError) return { ok: false, error: error.message } as const;
    throw error;
  }
}

export async function generateCvAction(_prev: CvState, formData: FormData): Promise<CvState> {
  const session = await verifyOwner(); // authorise first

  const parsed = generateInputSchema.safeParse({
    jobTitle: String(formData.get("jobTitle") ?? ""),
    company: String(formData.get("company") ?? "") || undefined,
    jobDescription: String(formData.get("jobDescription") ?? ""),
    length: String(formData.get("length") ?? "one-page"),
  });
  if (!parsed.success) {
    return { status: "error", message: "Please fix the highlighted fields.", fieldErrors: zodErrors(parsed.error.issues) };
  }

  const result = await runGeneration(session.userId, parsed.data);
  if (!result.ok) return { status: "error", message: result.error };

  const id = await createCv({
    jobTitle: parsed.data.jobTitle,
    company: parsed.data.company,
    jobDescription: parsed.data.jobDescription,
    content: result.merged.content,
    source: result.source,
    model: result.model,
  });
  revalidatePath("/dashboard/cv");
  redirect(`/dashboard/cv/${id}`);
}

export async function regenerateCvAction(id: string): Promise<void> {
  const session = await verifyOwner();
  const cv = await getCv(id);
  if (!cv) redirect("/dashboard/cv");

  const result = await runGeneration(session.userId, {
    jobTitle: cv.jobTitle,
    company: cv.company ?? undefined,
    jobDescription: cv.jobDescription,
    length: "one-page",
  });
  if (!result.ok) redirect(`/dashboard/cv/${id}?error=${encodeURIComponent(result.error)}`);

  // Education is typed by hand, so it survives a regeneration.
  const content = { ...result.merged.content, education: cv.content.education };
  await replaceCvGeneration(id, content, result.source, result.model);
  revalidatePath("/dashboard/cv");
  redirect(`/dashboard/cv/${id}?v=${Date.now()}`); // new key remounts the editor with the new content
}

export async function saveCvAction(id: string, _prev: CvState, formData: FormData): Promise<CvState> {
  await verifyOwner();

  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return { status: "error", message: "Malformed form data. Please reload and try again." };
  }
  const parsed = cvContentSchema.safeParse(raw);
  if (!parsed.success) {
    return { status: "error", message: "Please fix the highlighted fields.", fieldErrors: zodErrors(parsed.error.issues) };
  }

  try {
    const saved = await updateCvContent(id, parsed.data);
    if (!saved) return { status: "error", message: "This CV no longer exists." };
  } catch (error) {
    console.error("Saving CV failed:", error);
    return { status: "error", message: "Could not save. Please try again." };
  }
  revalidatePath("/dashboard/cv");
  return { status: "success", message: "Saved." };
}

export async function publishCvAction(id: string, publish: boolean): Promise<void> {
  await verifyOwner();
  await setPublished(id, publish);
  revalidatePath("/dashboard/cv");
  redirect(`/dashboard/cv/${id}`);
}

export async function deleteCvAction(id: string): Promise<void> {
  await verifyOwner();
  await deleteCv(id);
  revalidatePath("/dashboard/cv");
  redirect("/dashboard/cv");
}
