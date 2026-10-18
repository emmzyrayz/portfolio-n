import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { verifyOwner } from "@/lib/dal";
import { FILTER_LEVELS, LEVELS, RANGE_SECONDS, type InspectorFilters, type Level } from "@/lib/telemetry-schemas";

// Owner-only reads of the telemetry log. Every function re-verifies the session itself, is scoped by
// app_id, and only ever touches `client` tenants. There is deliberately no hub endpoint that reads logs.

export const PAGE_SIZE = 25;

export type TelemetrySummary = {
  /** Events per level in the last 24 hours. */
  counts: Record<Level, number>;
  errorsLastHour: number;
};

const emptySummary = (): TelemetrySummary => ({ counts: { debug: 0, info: 0, warn: 0, error: 0, fatal: 0 }, errorsLastHour: 0 });

export async function getTelemetrySummaries(appIds: string[]): Promise<Map<string, TelemetrySummary>> {
  await verifyOwner();
  const byApp = new Map<string, TelemetrySummary>(appIds.map((id) => [id, emptySummary()]));
  if (appIds.length === 0) return byApp;

  const idList = sql.join(appIds.map((id) => sql`${id}::uuid`), sql`, `);
  const result = await getDb().execute(sql`
    SELECT app_id, level, count(*)::int AS total,
           count(*) FILTER (WHERE created_at >= now() - interval '1 hour')::int AS last_hour
    FROM telemetry_logs
    WHERE app_id IN (${idList}) AND created_at >= now() - interval '24 hours'
    GROUP BY app_id, level
  `);
  for (const row of result.rows as { app_id: string; level: Level; total: number; last_hour: number }[]) {
    const summary = byApp.get(row.app_id);
    if (!summary || !(LEVELS as readonly string[]).includes(row.level)) continue;
    summary.counts[row.level] = row.total;
    if (row.level === "error" || row.level === "fatal") summary.errorsLastHour += row.last_hour;
  }
  return byApp;
}

export type TelemetryEntry = {
  id: string;
  eventType: string;
  level: Level;
  message: string;
  payload: Record<string, unknown> | null;
  keyName: string | null;
  createdAt: Date;
};

export type TelemetryPage = { entries: TelemetryEntry[]; nextCursor: string | null };

// Cursor = the row's DB timestamp text + id (exact to the microsecond; a JS Date would round to ms).
const TS_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?[+-]\d{2}(:\d{2})?$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseCursor(raw: string | null | undefined): { ts: string; id: string } | null {
  if (!raw) return null;
  const [ts, id] = raw.split("|");
  return ts && id && TS_PATTERN.test(ts) && UUID_PATTERN.test(id) ? { ts, id } : null;
}

/** Escapes LIKE wildcards so the search box is a plain substring match. */
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

type Row = {
  id: string;
  event_type: string;
  level: Level;
  message: string;
  payload: Record<string, unknown> | null;
  key_name: string | null;
  created_at: Date | string;
  created_raw: string;
};

export async function queryTelemetry(appId: string, filters: InspectorFilters, cursor: string | null | undefined): Promise<TelemetryPage> {
  await verifyOwner();
  const levels = sql.join(FILTER_LEVELS[filters.level].map((l) => sql`${l}`), sql`, `);
  const after = parseCursor(cursor);

  const where = [
    sql`m.app_id = ${appId}::uuid`,
    sql`a.kind = 'client'`,
    sql`m.level IN (${levels})`,
    sql`m.created_at >= now() - make_interval(secs => ${RANGE_SECONDS[filters.range]})`,
  ];
  if (filters.type) where.push(sql`m.event_type = ${filters.type}`);
  if (filters.q) where.push(sql`m.message ILIKE ${"%" + likeEscape(filters.q) + "%"} ESCAPE '\\'`);
  if (after) where.push(sql`(m.created_at, m.id) < (${after.ts}::timestamptz, ${after.id}::uuid)`);

  const result = await getDb().execute(sql`
    SELECT m.id, m.event_type, m.level, m.message, m.payload, k.name AS key_name, m.created_at, m.created_at::text AS created_raw
    FROM telemetry_logs m
    JOIN apps a ON a.id = m.app_id
    LEFT JOIN api_keys k ON k.id = m.key_id
    WHERE ${sql.join(where, sql` AND `)}
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT ${PAGE_SIZE + 1}
  `);

  const rows = result.rows as Row[];
  const page = rows.slice(0, PAGE_SIZE);
  return {
    entries: page.map((r) => ({
      id: r.id,
      eventType: r.event_type,
      level: r.level,
      message: r.message,
      payload: r.payload,
      keyName: r.key_name,
      createdAt: new Date(r.created_at),
    })),
    nextCursor: rows.length > PAGE_SIZE ? `${page[page.length - 1].created_raw}|${page[page.length - 1].id}` : null,
  };
}
