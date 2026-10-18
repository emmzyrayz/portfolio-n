import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { apps } from "@/db/schema";

export const DEFAULT_APP_SLUG = "portfolio";

let cached: string | undefined;

/** Id of the default (portfolio) tenant; created on first use. */
export async function getDefaultAppId() {
  if (cached) return cached;
  const db = getDb();
  await db
    .insert(apps)
    .values({ slug: DEFAULT_APP_SLUG, name: "Portfolio", kind: "internal" })
    .onConflictDoNothing({ target: apps.slug });
  const [row] = await db.select({ id: apps.id }).from(apps).where(eq(apps.slug, DEFAULT_APP_SLUG));
  return (cached = row.id);
}
