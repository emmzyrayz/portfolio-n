import "server-only";
import { after, connection } from "next/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { apiKeys, apps } from "@/db/schema";
import { hashApiKey } from "@/lib/hub-keys";
import { UNAUTHORIZED_BODY, parseHubHeaders } from "@/lib/hub-shape";
import { hitRateLimit } from "@/lib/rate-limit";

/**
 * The authoritative gateway check for every /api/hub/v1/* route. src/proxy.ts only does a cheap shape
 * check; the real verification lives here, next to the data, so there is no unauthenticated path
 * even if the proxy matcher drifts or is bypassed. Every hub route must be exported through withHub().
 */

const WINDOW_MS = 60_000;
/** Failed authentications allowed per IP per minute before it gets 429 instead of 401. */
const MAX_FAILURES_PER_IP = 30;

export type HubContext = {
  app: { id: string; slug: string; name: string };
  key: { id: string; name: string; prefix: string };
  rate: { limit: number; remaining: number };
};

const baseHeaders = { "Cache-Control": "no-store" };

// One generic 401 for every failure (missing, malformed, unknown, wrong tenant, revoked, inactive):
// nothing about tenants or keys can be enumerated.
const unauthorized = () => Response.json(UNAUTHORIZED_BODY, { status: 401, headers: { ...baseHeaders, "WWW-Authenticate": "Bearer" } });

const tooManyRequests = (retryAfterSeconds: number, extra: Record<string, string> = {}) =>
  Response.json(
    { error: { code: "rate_limited", message: "Too many requests. Slow down and retry later." } },
    { status: 429, headers: { ...baseHeaders, "Retry-After": String(retryAfterSeconds), ...extra } },
  );

function clientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

async function lookupKey(rawKey: string) {
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
    .where(and(eq(apiKeys.keyHash, hashApiKey(rawKey)), isNull(apiKeys.revokedAt)));
  return row ?? null;
}

export function withHub(handler: (ctx: HubContext, request: Request) => Promise<Response> | Response) {
  return async function hubRoute(request: Request): Promise<Response> {
    await connection(); // always request-time, never prerendered

    // Re-checked here even though the proxy already did: this wrapper must be safe on its own.
    const credentials = parseHubHeaders(request.headers);
    const row = credentials ? await lookupKey(credentials.key) : null;

    const authenticated =
      credentials !== null &&
      row !== null &&
      row.slug === credentials.appId && // the key must belong to the tenant named in x-app-id
      row.kind === "client" && // the owner's own site is never a hub tenant
      row.status === "active"; // handed-over / archived apps are cut off

    if (!authenticated) {
      // Count failures per IP so key-guessing gets slowed down. Valid keys are never blocked by this.
      const failure = await hitRateLimit(`hub-fail:ip:${clientIp(request)}`, MAX_FAILURES_PER_IP, WINDOW_MS);
      return failure.limited ? tooManyRequests(failure.retryAfterSeconds) : unauthorized();
    }

    const usage = await hitRateLimit(`hub:key:${row.keyId}`, row.limit, WINDOW_MS);
    const rateHeaders = { "X-RateLimit-Limit": String(row.limit), "X-RateLimit-Remaining": String(Math.max(0, row.limit - usage.count)) };
    if (usage.limited) return tooManyRequests(usage.retryAfterSeconds, rateHeaders);

    // last_used_at is informational: update at most once a minute, after the response is sent.
    after(async () => {
      try {
        await getDb().execute(sql`
          UPDATE api_keys SET last_used_at = now()
          WHERE id = ${row.keyId} AND (last_used_at IS NULL OR last_used_at < now() - interval '1 minute')
        `);
      } catch (error) {
        console.error("hub: could not update last_used_at", error);
      }
    });

    try {
      const response = await handler(
        {
          app: { id: row.appId, slug: row.slug, name: row.appName },
          key: { id: row.keyId, name: row.keyName, prefix: row.keyPrefix },
          rate: { limit: row.limit, remaining: Math.max(0, row.limit - usage.count) },
        },
        request,
      );
      for (const [name, value] of Object.entries({ ...baseHeaders, ...rateHeaders })) response.headers.set(name, value);
      return response;
    } catch (error) {
      console.error("hub handler failed:", error instanceof Error ? error.message : error); // never log headers/keys
      return Response.json({ error: { code: "internal_error", message: "Something went wrong." } }, { status: 500, headers: { ...baseHeaders, ...rateHeaders } });
    }
  };
}
