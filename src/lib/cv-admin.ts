import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { cvDocuments } from "@/db/schema";
import { getDefaultAppId } from "@/lib/app";
import { verifyOwner } from "@/lib/dal";
import { cvContentSchema, type CvContent, type CvSource } from "@/lib/cv-schemas";

// Every owner-facing function re-verifies the owner session itself (data access layer) and scopes
// every query by app_id, so a CV id can never be addressed across tenants.

const idSchema = z.uuid();

export type CvListItem = {
  id: string;
  title: string;
  jobTitle: string;
  company: string | null;
  isPublished: boolean;
  updatedAt: Date;
};

export async function listCvs(): Promise<CvListItem[]> {
  await verifyOwner();
  return getDb()
    .select({
      id: cvDocuments.id,
      title: cvDocuments.title,
      jobTitle: cvDocuments.jobTitle,
      company: cvDocuments.company,
      isPublished: cvDocuments.isPublished,
      updatedAt: cvDocuments.updatedAt,
    })
    .from(cvDocuments)
    .where(eq(cvDocuments.appId, await getDefaultAppId()))
    .orderBy(desc(cvDocuments.updatedAt));
}

export type CvRecord = {
  id: string;
  title: string;
  jobTitle: string;
  company: string | null;
  jobDescription: string;
  content: CvContent;
  source: CvSource;
  model: string | null;
  isPublished: boolean;
  updatedAt: Date;
};

export async function getCv(id: string): Promise<CvRecord | null> {
  await verifyOwner();
  if (!idSchema.safeParse(id).success) return null;
  const [row] = await getDb()
    .select()
    .from(cvDocuments)
    .where(and(eq(cvDocuments.id, id), eq(cvDocuments.appId, await getDefaultAppId())));
  return row ?? null;
}

export async function createCv(input: {
  jobTitle: string;
  company?: string;
  jobDescription: string;
  content: CvContent;
  source: CvSource;
  model: string;
}): Promise<string> {
  await verifyOwner();
  const [row] = await getDb()
    .insert(cvDocuments)
    .values({
      appId: await getDefaultAppId(),
      title: input.company ? `${input.jobTitle} at ${input.company}` : input.jobTitle,
      jobTitle: input.jobTitle,
      company: input.company || null,
      jobDescription: input.jobDescription,
      content: input.content,
      source: input.source,
      model: input.model,
    })
    .returning({ id: cvDocuments.id });
  return row.id;
}

/** Saves edited content; re-validated here even though the action already parsed it. */
export async function updateCvContent(id: string, content: CvContent): Promise<{ wasPublished: boolean } | null> {
  await verifyOwner();
  const parsed = cvContentSchema.parse(content);
  const [row] = await getDb()
    .update(cvDocuments)
    .set({ content: parsed, updatedAt: new Date() })
    .where(and(eq(cvDocuments.id, id), eq(cvDocuments.appId, await getDefaultAppId())))
    .returning({ wasPublished: cvDocuments.isPublished });
  return row ?? null;
}

/** Replaces content and the source snapshot after a regeneration. */
export async function replaceCvGeneration(id: string, content: CvContent, source: CvSource, model: string) {
  await verifyOwner();
  const [row] = await getDb()
    .update(cvDocuments)
    .set({ content: cvContentSchema.parse(content), source, model, updatedAt: new Date() })
    .where(and(eq(cvDocuments.id, id), eq(cvDocuments.appId, await getDefaultAppId())))
    .returning({ wasPublished: cvDocuments.isPublished });
  return row ?? null;
}

/** Publishing one CV un-publishes the others in the same atomic batch (one backs /resume.pdf). */
export async function setPublished(id: string, published: boolean): Promise<boolean> {
  await verifyOwner();
  if (!idSchema.safeParse(id).success) return false;
  const appId = await getDefaultAppId();
  const db = getDb();
  const [exists] = await db
    .select({ id: cvDocuments.id })
    .from(cvDocuments)
    .where(and(eq(cvDocuments.id, id), eq(cvDocuments.appId, appId)));
  if (!exists) return false;

  await db.batch([
    db.update(cvDocuments).set({ isPublished: false }).where(eq(cvDocuments.appId, appId)),
    ...(published ? [db.update(cvDocuments).set({ isPublished: true }).where(eq(cvDocuments.id, id))] : []),
  ]);
  return true;
}

export async function deleteCv(id: string): Promise<{ wasPublished: boolean } | null> {
  await verifyOwner();
  if (!idSchema.safeParse(id).success) return null;
  const [row] = await getDb()
    .delete(cvDocuments)
    .where(and(eq(cvDocuments.id, id), eq(cvDocuments.appId, await getDefaultAppId())))
    .returning({ wasPublished: cvDocuments.isPublished });
  return row ?? null;
}

/** Public: the CV the owner chose to publish as /resume.pdf (no session needed). */
export async function getPublishedCv(): Promise<{ title: string; content: CvContent } | null> {
  const [row] = await getDb()
    .select({ title: cvDocuments.title, content: cvDocuments.content })
    .from(cvDocuments)
    .where(and(eq(cvDocuments.appId, await getDefaultAppId()), eq(cvDocuments.isPublished, true)));
  return row ?? null;
}
