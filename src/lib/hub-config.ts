import "server-only";
import { createHash } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { appConfig } from "@/db/schema";
import { hubState, type ConfigSnapshot } from "@/lib/hub-state";

/** Reads one tenant's whole config in a single query. Always scoped by app_id. */
async function loadSnapshot(appId: string): Promise<ConfigSnapshot> {
  const rows = await getDb()
    .select({ key: appConfig.key, value: appConfig.value, updatedAt: appConfig.updatedAt })
    .from(appConfig)
    .where(eq(appConfig.appId, appId))
    .orderBy(asc(appConfig.key));

  const config: Record<string, unknown> = {};
  let latest: Date | null = null;
  for (const row of rows) {
    config[row.key] = row.value;
    if (!latest || row.updatedAt > latest) latest = row.updatedAt;
  }
  const version = createHash("sha256").update(JSON.stringify(config)).digest("hex").slice(0, 16);
  return { config, version, updatedAt: latest ? latest.toISOString() : null };
}

/**
 * Cached snapshot (30 s TTL, invalidated at once on the instance that saves). Concurrent misses share
 * one query, and a load that began before an invalidation never repopulates the cache with old data.
 */
export async function getConfigSnapshot(appId: string): Promise<ConfigSnapshot> {
  const cached = hubState.config.get(appId);
  if (cached) return cached;

  const inflight = hubState.configInflight.get(appId);
  if (inflight) return inflight;

  const generation = hubState.configGeneration.get(appId) ?? 0;
  const load = loadSnapshot(appId)
    .then((snapshot) => {
      if ((hubState.configGeneration.get(appId) ?? 0) === generation) hubState.config.set(appId, snapshot);
      return snapshot;
    })
    .finally(() => {
      if (hubState.configInflight.get(appId) === load) hubState.configInflight.delete(appId);
    });
  hubState.configInflight.set(appId, load);
  return load;
}

/** Subset of the config by key; unknown keys are simply absent. */
export function pickKeys(config: Record<string, unknown>, keys: string[]) {
  const picked: Record<string, unknown> = {};
  for (const key of keys) if (Object.hasOwn(config, key)) picked[key] = config[key];
  return picked;
}

/** Weak ETag: the content version, plus a short hash of the requested key subset when filtering. */
export function etagFor(version: string, keys?: string[]) {
  if (!keys) return `W/"${version}"`;
  return `W/"${version}-${createHash("sha1").update([...keys].sort().join(",")).digest("hex").slice(0, 6)}"`;
}

/** True when an If-None-Match header (a list, possibly weak or `*`) matches this ETag. */
export function etagMatches(ifNoneMatch: string | null, etag: string) {
  if (!ifNoneMatch) return false;
  const strip = (v: string) => v.trim().replace(/^W\//, "");
  return ifNoneMatch.split(",").some((candidate) => candidate.trim() === "*" || strip(candidate) === strip(etag));
}
