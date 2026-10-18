import "server-only";
import type { AppKind, AppStatus } from "@/db/schema";
import { TtlCache } from "@/lib/hub-cache";
import { HubLimiter } from "@/lib/hub-limiter";

/**
 * Per-instance hot-path state for the hub ("fast path"): everything here is in memory so a warm request
 * touches no database. Staleness is bounded by the TTLs below, and the instance that handles an owner
 * change invalidates its own entries immediately; other instances catch up within the TTL.
 *   - auth:    revoked / handed-over keys stop working within AUTH_TTL_MS everywhere (immediately locally)
 *   - config:  dashboard edits reach every client within CONFIG_TTL_MS (immediately locally)
 *   - limiter: limits hold across instances with a lag of about one request
 */
export const AUTH_TTL_MS = 15_000;
export const CONFIG_TTL_MS = 30_000;
export const RATE_WINDOW_MS = 60_000;
export const TELEMETRY_TENANT_WINDOW_MS = 60 * 60 * 1000;
export const TELEMETRY_GLOBAL_WINDOW_MS = 24 * 60 * 60 * 1000;

export type AuthRow = {
  keyId: string;
  keyName: string;
  keyPrefix: string;
  limit: number;
  appId: string;
  slug: string;
  appName: string;
  kind: AppKind;
  status: AppStatus;
};

export type ConfigSnapshot = {
  config: Record<string, unknown>;
  /** Short content hash: the basis of the ETag. */
  version: string;
  updatedAt: string | null;
};

type HubState = {
  auth: TtlCache<AuthRow>;
  limiter: HubLimiter;
  /** Telemetry event budgets (per tenant per hour, and across all tenants per day), decided in memory. */
  telemetryTenant: HubLimiter;
  telemetryGlobal: HubLimiter;
  config: TtlCache<ConfigSnapshot>;
  configInflight: Map<string, Promise<ConfigSnapshot>>;
  /** Bumped on every invalidation so a load that started before a save never repopulates the cache. */
  configGeneration: Map<string, number>;
};

// globalThis so dev hot reloads keep one instance of the state.
const g = globalThis as typeof globalThis & { __hubState?: HubState };

export const hubState: HubState = (g.__hubState ??= {
  auth: new TtlCache<AuthRow>({ maxEntries: 500, ttlMs: AUTH_TTL_MS }),
  limiter: new HubLimiter({ windowMs: RATE_WINDOW_MS, maxEntries: 5000 }),
  telemetryTenant: new HubLimiter({ windowMs: TELEMETRY_TENANT_WINDOW_MS, maxEntries: 1000 }),
  telemetryGlobal: new HubLimiter({ windowMs: TELEMETRY_GLOBAL_WINDOW_MS, maxEntries: 4 }),
  config: new TtlCache<ConfigSnapshot>({ maxEntries: 200, ttlMs: CONFIG_TTL_MS }),
  configInflight: new Map(),
  configGeneration: new Map(),
});

/** Called by owner actions (revoke key, change app status) so this instance stops trusting the key at once. */
export function invalidateAuth(match: { keyId?: string; appId?: string }) {
  hubState.auth.deleteWhere((row) => (match.keyId !== undefined && row.keyId === match.keyId) || (match.appId !== undefined && row.appId === match.appId));
}

/** Called after an owner saves config so this instance serves the new values immediately. */
export function invalidateConfig(appId: string) {
  hubState.config.delete(appId);
  hubState.configInflight.delete(appId);
  hubState.configGeneration.set(appId, (hubState.configGeneration.get(appId) ?? 0) + 1);
}
