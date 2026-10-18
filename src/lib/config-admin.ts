import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { getDb } from "@/db";
import { appConfig, apps } from "@/db/schema";
import { verifyOwner } from "@/lib/dal";
import type { ConfigEntry } from "@/lib/config-schemas";
import { invalidateConfig } from "@/lib/hub-state";

// Owner-only. Every function re-verifies the session, only touches `client` tenants, and scopes by app_id.

/** Order-independent JSON text, so equal values compare equal whatever key order the editor produced. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export type ConfigRow = ConfigEntry & { updatedAt: Date };

export async function listConfig(appIds: string[]): Promise<Map<string, ConfigRow[]>> {
  await verifyOwner();
  const byApp = new Map<string, ConfigRow[]>();
  if (appIds.length === 0) return byApp;
  const rows = await getDb()
    .select({ appId: appConfig.appId, key: appConfig.key, value: appConfig.value, updatedAt: appConfig.updatedAt })
    .from(appConfig)
    .where(inArray(appConfig.appId, appIds))
    .orderBy(appConfig.key);
  for (const row of rows) byApp.set(row.appId, [...(byApp.get(row.appId) ?? []), { key: row.key, value: row.value, updatedAt: row.updatedAt }]);
  return byApp;
}

export type SaveConfigResult = { ok: true; changed: number; removed: number } | { ok: false; message: string };

/**
 * Applies the desired key set as one atomic batch: new or changed keys are upserted, keys that are no
 * longer listed are deleted, untouched keys keep their updated_at. Afterwards this instance drops its
 * cached copy so clients see the change immediately here and within the cache TTL elsewhere.
 */
export async function saveAppConfig(appId: string, desired: ConfigEntry[]): Promise<SaveConfigResult> {
  await verifyOwner();
  const db = getDb();
  const [app] = await db
    .select({ status: apps.status })
    .from(apps)
    .where(and(eq(apps.id, appId), eq(apps.kind, "client")));
  if (!app) return { ok: false, message: "That project no longer exists." };
  if (app.status !== "active") return { ok: false, message: "Reactivate this project before editing its config." };

  const existing = await db.select({ key: appConfig.key, value: appConfig.value }).from(appConfig).where(eq(appConfig.appId, appId));
  const current = new Map(existing.map((row) => [row.key, canonical(row.value)]));
  const wanted = new Set(desired.map((entry) => entry.key));

  const changed = desired.filter((entry) => current.get(entry.key) !== canonical(entry.value));
  const removed = existing.map((row) => row.key).filter((key) => !wanted.has(key));
  if (changed.length === 0 && removed.length === 0) return { ok: true, changed: 0, removed: 0 };

  const queries: BatchItem<"pg">[] = [];
  if (removed.length > 0) queries.push(db.delete(appConfig).where(and(eq(appConfig.appId, appId), inArray(appConfig.key, removed))));
  if (changed.length > 0) {
    queries.push(
      db
        .insert(appConfig)
        .values(changed.map((entry) => ({ appId, key: entry.key, value: entry.value })))
        .onConflictDoUpdate({
          target: [appConfig.appId, appConfig.key],
          set: { value: sql`excluded.value`, updatedAt: sql`now()` },
        }),
    );
  }
  await db.batch(queries as [BatchItem<"pg">, ...BatchItem<"pg">[]]);

  invalidateConfig(appId);
  return { ok: true, changed: changed.length, removed: removed.length };
}
