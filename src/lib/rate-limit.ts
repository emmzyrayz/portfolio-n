import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";

export type RateLimitResult = {
  /** True when this hit pushed the counter past `max`. */
  limited: boolean;
  /** Hits in the current window, including this one. */
  count: number;
  /** Seconds until the window resets (at least 1). */
  retryAfterSeconds: number;
};

/**
 * Fixed-window counter in Postgres: one atomic upsert per call. Use `rateLimited()` when only a
 * yes/no is needed, `hitRateLimit()` when the caller also wants the count (e.g. for headers).
 */
export async function hitRateLimit(key: string, max: number, windowMs: number, cost = 1): Promise<RateLimitResult> {
  const windowSeconds = windowMs / 1000;
  const result = await getDb().execute(sql`
    INSERT INTO rate_limits (key, window_start, count)
    VALUES (${key}, now(), ${cost})
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) THEN ${cost} ELSE rate_limits.count + ${cost} END,
      window_start = CASE WHEN rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) THEN now() ELSE rate_limits.window_start END
    RETURNING count, EXTRACT(EPOCH FROM (window_start + make_interval(secs => ${windowSeconds}) - now())) AS retry_after
  `);
  const row = result.rows[0] as { count: number | string; retry_after: number | string } | undefined;
  const count = Number(row?.count ?? 0);
  return { limited: count > max, count, retryAfterSeconds: Math.max(1, Math.ceil(Number(row?.retry_after ?? windowSeconds))) };
}

/** Yes/no form of `hitRateLimit`. */
export async function rateLimited(key: string, max: number, windowMs: number) {
  return (await hitRateLimit(key, max, windowMs)).limited;
}

export type QuotaResult = { admitted: true } | { admitted: false; retryAfterSeconds: number };

/**
 * Exact all-or-nothing quota: takes `cost` units from a fixed-window budget of `max`, or takes nothing.
 * Each statement is a single atomic conditional write, so concurrent callers can never overspend.
 * (hitRateLimit counts a hit even when it rejects, which is wrong for "5 recipients or none".)
 */
export async function reserveQuota(key: string, cost: number, max: number, windowMs: number): Promise<QuotaResult> {
  if (cost > max) return { admitted: false, retryAfterSeconds: Math.ceil(windowMs / 1000) };
  const db = getDb();
  const windowSeconds = windowMs / 1000;

  // 1) inside the current window and enough budget left
  const increment = await db.execute(sql`
    UPDATE rate_limits SET count = count + ${cost}
    WHERE key = ${key} AND window_start >= now() - make_interval(secs => ${windowSeconds}) AND count + ${cost} <= ${max}
    RETURNING count
  `);
  if (increment.rows.length > 0) return { admitted: true };

  // 2) the window has ended: start a new one
  const reset = await db.execute(sql`
    UPDATE rate_limits SET count = ${cost}, window_start = now()
    WHERE key = ${key} AND window_start < now() - make_interval(secs => ${windowSeconds})
    RETURNING count
  `);
  if (reset.rows.length > 0) return { admitted: true };

  // 3) first use of this key
  const created = await db.execute(sql`
    INSERT INTO rate_limits (key, window_start, count) VALUES (${key}, now(), ${cost})
    ON CONFLICT (key) DO NOTHING
    RETURNING count
  `);
  if (created.rows.length > 0) return { admitted: true };

  // Out of budget (or lost a race to the insert/reset above): report when the window ends.
  const status = await db.execute(sql`
    SELECT EXTRACT(EPOCH FROM (window_start + make_interval(secs => ${windowSeconds}) - now())) AS retry_after
    FROM rate_limits WHERE key = ${key}
  `);
  const retry = Number((status.rows[0] as { retry_after: number | string } | undefined)?.retry_after ?? windowSeconds);
  return { admitted: false, retryAfterSeconds: Math.max(1, Math.ceil(retry)) };
}

/** Gives back units taken by reserveQuota (used when a second budget rejects the same request). */
export async function releaseQuota(key: string, cost: number) {
  await getDb().execute(sql`UPDATE rate_limits SET count = GREATEST(count - ${cost}, 0) WHERE key = ${key}`);
}
