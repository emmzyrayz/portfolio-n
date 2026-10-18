import "server-only";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { getDb } from "@/db";
import { apiKeys, apps, type AppStatus } from "@/db/schema";
import { verifyOwner } from "@/lib/dal";
import { MAX_ACTIVE_KEYS } from "@/lib/apps-schemas";
import { generateApiKey } from "@/lib/hub-keys";

// Every function re-verifies the owner session itself (data access layer). Only `client` tenants can
// be touched here: the owner's own `internal` app is invisible to this module on purpose.

export type AdminKey = {
  id: string;
  name: string;
  prefix: string;
  rateLimitPerMin: number;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

export type AdminApp = {
  id: string;
  slug: string;
  name: string;
  status: AppStatus;
  statusChangedAt: Date | null;
  createdAt: Date;
  keys: AdminKey[];
};

export async function listClientApps(): Promise<AdminApp[]> {
  await verifyOwner();
  const db = getDb();
  const rows = await db.select().from(apps).where(eq(apps.kind, "client")).orderBy(asc(apps.createdAt));
  if (rows.length === 0) return [];

  const keys = await db
    .select({
      id: apiKeys.id,
      appId: apiKeys.appId,
      name: apiKeys.name,
      prefix: apiKeys.keyPrefix,
      rateLimitPerMin: apiKeys.rateLimitPerMin,
      lastUsedAt: apiKeys.lastUsedAt,
      revokedAt: apiKeys.revokedAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(inArray(apiKeys.appId, rows.map((r) => r.id)))
    .orderBy(desc(apiKeys.createdAt));

  return rows.map((app) => ({
    id: app.id,
    slug: app.slug,
    name: app.name,
    status: app.status,
    statusChangedAt: app.statusChangedAt,
    createdAt: app.createdAt,
    keys: keys
      .filter((k) => k.appId === app.id)
      .map((k) => ({
        id: k.id,
        name: k.name,
        prefix: k.prefix,
        rateLimitPerMin: k.rateLimitPerMin,
        lastUsedAt: k.lastUsedAt,
        revokedAt: k.revokedAt,
        createdAt: k.createdAt,
      })),
  }));
}

export type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string; field?: string };

export async function registerApp(input: { name: string; slug: string }): Promise<Result> {
  await verifyOwner();
  const inserted = await getDb()
    .insert(apps)
    .values({ name: input.name, slug: input.slug, kind: "client", status: "active" })
    .onConflictDoNothing({ target: apps.slug })
    .returning({ id: apps.id });
  if (inserted.length === 0) return { ok: false, field: "slug", message: "That identifier is already taken." };
  return { ok: true };
}

/** The raw key is returned exactly once. Only its HMAC is stored. */
export async function createKey(
  appId: string,
  input: { name: string; rateLimitPerMin: number },
): Promise<Result<{ rawKey: string; prefix: string; appSlug: string }>> {
  await verifyOwner();
  const db = getDb();
  const [app] = await db
    .select({ slug: apps.slug, status: apps.status })
    .from(apps)
    .where(and(eq(apps.id, appId), eq(apps.kind, "client")));
  if (!app) return { ok: false, message: "That project no longer exists." };
  if (app.status !== "active") return { ok: false, message: "Reactivate this project before creating keys for it." };

  const [{ active }] = await db
    .select({ active: sql<number>`count(*)::int` })
    .from(apiKeys)
    .where(and(eq(apiKeys.appId, appId), isNull(apiKeys.revokedAt)));
  if (active >= MAX_ACTIVE_KEYS) return { ok: false, message: `At most ${MAX_ACTIVE_KEYS} active keys per project. Revoke one first.` };

  const key = generateApiKey();
  await db.insert(apiKeys).values({
    appId,
    name: input.name,
    keyHash: key.hash,
    keyPrefix: key.prefix,
    rateLimitPerMin: input.rateLimitPerMin,
  });
  return { ok: true, rawKey: key.raw, prefix: key.prefix, appSlug: app.slug };
}

export async function revokeKey(keyId: string): Promise<boolean> {
  await verifyOwner();
  const db = getDb();
  const clientApps = db.select({ id: apps.id }).from(apps).where(eq(apps.kind, "client"));
  const revoked = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, keyId), isNull(apiKeys.revokedAt), inArray(apiKeys.appId, clientApps)))
    .returning({ id: apiKeys.id });
  return revoked.length > 0;
}

/**
 * Handing over or archiving a project cuts it off: every active key is revoked in the same atomic
 * batch, so a client that has left can never call the hub. Reactivating does not restore old keys.
 */
export async function setAppStatus(appId: string, status: AppStatus): Promise<boolean> {
  await verifyOwner();
  const db = getDb();
  const [app] = await db.select({ id: apps.id }).from(apps).where(and(eq(apps.id, appId), eq(apps.kind, "client")));
  if (!app) return false;

  const queries: BatchItem<"pg">[] = [
    db.update(apps).set({ status, statusChangedAt: new Date() }).where(and(eq(apps.id, appId), eq(apps.kind, "client"))),
  ];
  if (status !== "active") {
    queries.push(db.update(apiKeys).set({ revokedAt: new Date() }).where(and(eq(apiKeys.appId, appId), isNull(apiKeys.revokedAt))));
  }
  await db.batch(queries as [BatchItem<"pg">, ...BatchItem<"pg">[]]);
  return true;
}
