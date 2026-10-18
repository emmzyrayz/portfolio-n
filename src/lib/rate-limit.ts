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
export async function hitRateLimit(key: string, max: number, windowMs: number): Promise<RateLimitResult> {
  const windowSeconds = windowMs / 1000;
  const result = await getDb().execute(sql`
    INSERT INTO rate_limits (key, window_start, count)
    VALUES (${key}, now(), 1)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) THEN 1 ELSE rate_limits.count + 1 END,
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
