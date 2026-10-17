import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";

/**
 * Fixed-window counter in Postgres. Returns true when `key` has exceeded `max`
 * hits inside `windowMs`. One atomic upsert per call.
 */
export async function rateLimited(key: string, max: number, windowMs: number) {
  const windowSeconds = windowMs / 1000;
  const result = await getDb().execute(sql`
    INSERT INTO rate_limits (key, window_start, count)
    VALUES (${key}, now(), 1)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) THEN 1 ELSE rate_limits.count + 1 END,
      window_start = CASE WHEN rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) THEN now() ELSE rate_limits.window_start END
    RETURNING count
  `);
  return Number(result.rows[0]?.count ?? 0) > max;
}
