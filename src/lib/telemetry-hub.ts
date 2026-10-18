import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { telemetryLogs, type TelemetryLevel } from "@/db/schema";
import { hubState, TELEMETRY_GLOBAL_WINDOW_MS, TELEMETRY_TENANT_WINDOW_MS } from "@/lib/hub-state";
import { hitRateLimit } from "@/lib/rate-limit";
import type { Level, TelemetryEvent } from "@/lib/telemetry-schemas";

// Compile-time guard that the zod enum and the DB column type cannot drift apart.
const _levelsMatch: Level extends TelemetryLevel ? (TelemetryLevel extends Level ? true : never) : never = true;
void _levelsMatch;

/** Events per tenant per hour. Sized so worst-case storage stays within a small Neon plan. */
export const TENANT_EVENTS_PER_HOUR = 500;
/** Events per day across ALL tenants: a safety valve against a runaway client filling the database. */
export const GLOBAL_EVENTS_PER_DAY = 10_000;

export const RETENTION_DAYS = 30;
/** Retention cleanup runs at most this often per server instance (opportunistic, no cron needed). */
export const PRUNE_EVERY_MS = 10 * 60 * 1000;
const PRUNE_BATCH = 5000;

const tenantKey = (appId: string) => `hub-tel:app:${appId}`;
const GLOBAL_KEY = "hub-tel:global";

export type TelemetryQuota = { ok: true } | { ok: false; scope: "tenant" | "global"; retryAfterSeconds: number };

/**
 * Instant, all-or-nothing decision from in-memory counters (no database on the hot path): `events`
 * units from the tenant's hourly budget and from the global daily budget, or neither. The durable
 * counters catch up after the response (see syncTelemetryCounters), so limits hold across instances
 * with a lag of about one request.
 */
export function reserveTelemetryQuota(appId: string, events: number): TelemetryQuota {
  const tenant = hubState.telemetryTenant.take(tenantKey(appId), TENANT_EVENTS_PER_HOUR, events);
  if (!tenant.allowed) return { ok: false, scope: "tenant", retryAfterSeconds: tenant.retryAfterSeconds };

  const global = hubState.telemetryGlobal.take(GLOBAL_KEY, GLOBAL_EVENTS_PER_DAY, events);
  if (!global.allowed) {
    hubState.telemetryTenant.refund(tenantKey(appId), events); // the tenant must not pay for a global rejection
    return { ok: false, scope: "global", retryAfterSeconds: global.retryAfterSeconds };
  }
  return { ok: true };
}

/** Writes the durable counters for ACCEPTED events and feeds the totals back to the local limiters. */
export async function syncTelemetryCounters(appId: string, events: number) {
  const [tenant, global] = await Promise.all([
    hitRateLimit(tenantKey(appId), TENANT_EVENTS_PER_HOUR, TELEMETRY_TENANT_WINDOW_MS, events),
    hitRateLimit(GLOBAL_KEY, GLOBAL_EVENTS_PER_DAY, TELEMETRY_GLOBAL_WINDOW_MS, events),
  ]);
  const now = Date.now();
  hubState.telemetryTenant.syncGlobal(tenantKey(appId), tenant.count, now + tenant.retryAfterSeconds * 1000);
  hubState.telemetryGlobal.syncGlobal(GLOBAL_KEY, global.count, now + global.retryAfterSeconds * 1000);
}

/** One multi-row insert. created_at is the server's own clock, never anything the client sent. */
export async function writeTelemetry(appId: string, keyId: string, events: TelemetryEvent[]) {
  await getDb()
    .insert(telemetryLogs)
    .values(
      events.map((e) => ({
        appId,
        keyId,
        eventType: e.event_type,
        level: e.level,
        message: e.message,
        payload: e.payload ?? null,
      })),
    );
}

const g = globalThis as typeof globalThis & { __telemetryLastPrune?: number };

/** Deletes up to 5,000 rows older than 30 days, at most once per PRUNE_EVERY_MS per instance. */
export async function maybePruneTelemetry() {
  const now = Date.now();
  if (now - (g.__telemetryLastPrune ?? 0) < PRUNE_EVERY_MS) return;
  g.__telemetryLastPrune = now;
  await getDb().execute(sql`
    DELETE FROM telemetry_logs WHERE id IN (
      SELECT id FROM telemetry_logs
      WHERE created_at < now() - make_interval(days => ${RETENTION_DAYS})
      ORDER BY created_at LIMIT ${PRUNE_BATCH}
    )
  `);
}
