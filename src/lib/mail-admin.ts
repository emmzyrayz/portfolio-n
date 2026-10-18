import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import type { MailStatus } from "@/db/schema";
import { verifyOwner } from "@/lib/dal";
import { tenantQuotaKey } from "@/lib/mail-hub";

// Owner-only read of the mail audit log. Re-verifies the session itself and is scoped by app_id.
// There is deliberately no hub endpoint that exposes any of this to clients.

export const RECENT_PER_APP = 25;

export type MailEntry = {
  id: string;
  recipient: string;
  subject: string;
  status: MailStatus;
  errorMessage: string | null;
  keyName: string | null;
  createdAt: Date;
};

export type AppMail = {
  recent: MailEntry[];
  /** Recipients counted against this hour's quota (failed attempts count too). */
  usedThisHour: number;
  /** When the current quota window ends, or null if no window is active. */
  windowEndsAt: Date | null;
};

type Row = {
  id: string;
  app_id: string;
  recipient: string;
  subject: string;
  status: MailStatus;
  error_message: string | null;
  key_name: string | null;
  created_at: Date | string;
};

export async function listRecentMail(appIds: string[]): Promise<Map<string, AppMail>> {
  await verifyOwner();
  const byApp = new Map<string, AppMail>(appIds.map((id) => [id, { recent: [], usedThisHour: 0, windowEndsAt: null }]));
  if (appIds.length === 0) return byApp;

  const db = getDb();
  const idList = sql.join(appIds.map((id) => sql`${id}::uuid`), sql`, `);

  const logs = await db.execute(sql`
    SELECT t.id, t.app_id, t.recipient, t.subject, t.status, t.error_message, k.name AS key_name, t.created_at
    FROM (
      SELECT *, row_number() OVER (PARTITION BY app_id ORDER BY created_at DESC) AS rn
      FROM mail_logs WHERE app_id IN (${idList})
    ) t
    LEFT JOIN api_keys k ON k.id = t.key_id
    WHERE t.rn <= ${RECENT_PER_APP}
    ORDER BY t.created_at DESC
  `);
  for (const r of logs.rows as Row[]) {
    byApp.get(r.app_id)?.recent.push({
      id: r.id,
      recipient: r.recipient,
      subject: r.subject,
      status: r.status,
      errorMessage: r.error_message,
      keyName: r.key_name,
      createdAt: new Date(r.created_at),
    });
  }

  // The authoritative quota counter (what the hub actually enforces), only while its window is active.
  const keyToApp = new Map(appIds.map((id) => [tenantQuotaKey(id), id]));
  const keyList = sql.join([...keyToApp.keys()].map((k) => sql`${k}`), sql`, `);
  const quota = await db.execute(sql`
    SELECT key, count, window_start + interval '1 hour' AS ends_at
    FROM rate_limits
    WHERE key IN (${keyList}) AND window_start >= now() - interval '1 hour'
  `);
  for (const r of quota.rows as { key: string; count: number | string; ends_at: Date | string }[]) {
    const entry = byApp.get(keyToApp.get(r.key) ?? "");
    if (entry) {
      entry.usedThisHour = Number(r.count);
      entry.windowEndsAt = new Date(r.ends_at);
    }
  }
  return byApp;
}
