import "server-only";
import { after, connection } from "next/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { apiKeys, apps } from "@/db/schema";
import { hashApiKey } from "@/lib/hub-keys";
import { UNAUTHORIZED_BODY, parseHubHeaders } from "@/lib/hub-shape";
import { hubState, RATE_WINDOW_MS, type AuthRow } from "@/lib/hub-state";
import { hitRateLimit } from "@/lib/rate-limit";

/**
 * The authoritative gateway check for every /api/hub/v1/* route. src/proxy.ts only does a cheap shape
 * check; the real verification lives here, next to the data, so there is no unauthenticated path
 * even if the proxy matcher drifts or is bypassed. Every hub route must be exported through withHub().
 *
 * Fast path: a warm request makes NO database call. The key lookup is cached in memory for 15 s and the
 * rate-limit decision is made locally; the durable counter is written after the response (see
 * src/lib/hub-state.ts for the staleness trade-offs). Failures take the slow, strict path: they are never
 * cached and each one is counted per IP in the database.
 */

/** Failed authentications allowed per IP per minute before it gets 429 instead of 401. */
const MAX_FAILURES_PER_IP = 30;

export type HubContext = {
  app: { id: string; slug: string; name: string };
  key: { id: string; name: string; prefix: string };
  rate: { limit: number; remaining: number };
};

const noStore = { "Cache-Control": "no-store" };

// One generic 401 for every failure (missing, malformed, unknown, wrong tenant, revoked, inactive):
// nothing about tenants or keys can be enumerated.
const unauthorized = () => Response.json(UNAUTHORIZED_BODY, { status: 401, headers: { ...noStore, "WWW-Authenticate": "Bearer" } });

const tooManyRequests = (retryAfterSeconds: number, extra: Record<string, string> = {}) =>
  Response.json(
    { error: { code: "rate_limited", message: "Too many requests. Slow down and retry later." } },
    { status: 429, headers: { ...noStore, "Retry-After": String(retryAfterSeconds), ...extra } },
  );

function clientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

async function lookupKey(keyHash: string): Promise<AuthRow | null> {
  const [row] = await getDb()
    .select({
      keyId: apiKeys.id,
      keyName: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      limit: apiKeys.rateLimitPerMin,
      appId: apps.id,
      slug: apps.slug,
      appName: apps.name,
      kind: apps.kind,
      status: apps.status,
    })
    .from(apiKeys)
    .innerJoin(apps, eq(apps.id, apiKeys.appId))
    .where(and(eq(apiKeys.keyHash, keyHash), isNull(apiKeys.revokedAt)));
  return row ?? null;
}

const isActiveClient = (row: AuthRow) => row.kind === "client" && row.status === "active";

const ms = (from: number, to: number) => (to - from).toFixed(2);

export function withHub(handler: (ctx: HubContext, request: Request) => Promise<Response> | Response) {
  return async function hubRoute(request: Request): Promise<Response> {
    const t0 = performance.now();
    await connection(); // always request-time, never prerendered

    // Re-checked here even though the proxy already did: this wrapper must be safe on its own.
    const credentials = parseHubHeaders(request.headers);

    let row: AuthRow | null = null;
    if (credentials) {
      const keyHash = hashApiKey(credentials.key);
      row = hubState.auth.get(keyHash) ?? null; // warm path: no database call
      if (!row) {
        row = await lookupKey(keyHash);
        if (row && isActiveClient(row)) hubState.auth.set(keyHash, row); // only successes are cached
      }
    }

    if (
      !credentials ||
      !row ||
      row.slug !== credentials.appId || // the key must belong to the tenant named in x-app-id
      !isActiveClient(row) // the owner's own site is never a tenant; handed-over / archived apps are cut off
    ) {
      // Count failures per IP so key-guessing gets slowed down. Valid keys are never blocked by this.
      const failure = await hitRateLimit(`hub-fail:ip:${clientIp(request)}`, MAX_FAILURES_PER_IP, RATE_WINDOW_MS);
      return failure.limited ? tooManyRequests(failure.retryAfterSeconds) : unauthorized();
    }
    const tenant = row; // verified; a const so the narrowing survives into the closures below
    const tAuth = performance.now();

    // Instant local decision; the durable counter catches up after the response.
    const decision = hubState.limiter.take(tenant.keyId, tenant.limit);
    const rateHeaders = { "X-RateLimit-Limit": String(tenant.limit), "X-RateLimit-Remaining": String(decision.remaining) };
    if (!decision.allowed) return tooManyRequests(decision.retryAfterSeconds, rateHeaders);
    const tLimit = performance.now();

    after(async () => {
      try {
        const usage = await hitRateLimit(`hub:key:${tenant.keyId}`, tenant.limit, RATE_WINDOW_MS);
        hubState.limiter.syncGlobal(tenant.keyId, usage.count, Date.now() + usage.retryAfterSeconds * 1000);
        // last_used_at is informational: at most one write a minute.
        await getDb().execute(sql`
          UPDATE api_keys SET last_used_at = now()
          WHERE id = ${tenant.keyId} AND (last_used_at IS NULL OR last_used_at < now() - interval '1 minute')
        `);
      } catch (error) {
        console.error("hub: post-response bookkeeping failed", error instanceof Error ? error.message : error);
      }
    });

    try {
      const response = await handler(
        {
          app: { id: tenant.appId, slug: tenant.slug, name: tenant.appName },
          key: { id: tenant.keyId, name: tenant.keyName, prefix: tenant.keyPrefix },
          rate: { limit: tenant.limit, remaining: decision.remaining },
        },
        request,
      );
      const tEnd = performance.now();
      for (const [name, value] of Object.entries(rateHeaders)) response.headers.set(name, value);
      // Handlers may opt into caching (e.g. ETag-validated config); everything else is no-store.
      if (!response.headers.has("Cache-Control")) response.headers.set("Cache-Control", "no-store");
      response.headers.set(
        "Server-Timing",
        `auth;dur=${ms(t0, tAuth)}, limit;dur=${ms(tAuth, tLimit)}, handler;dur=${ms(tLimit, tEnd)}, total;dur=${ms(t0, tEnd)}`,
      );
      return response;
    } catch (error) {
      console.error("hub handler failed:", error instanceof Error ? error.message : error); // never log headers/keys
      return Response.json({ error: { code: "internal_error", message: "Something went wrong." } }, { status: 500, headers: { ...noStore, ...rateHeaders } });
    }
  };
}
