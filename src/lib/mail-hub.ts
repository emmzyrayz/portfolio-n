import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { mailLogs, type MailStatus } from "@/db/schema";
import { releaseQuota, reserveQuota } from "@/lib/rate-limit";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Recipients per tenant per hour. Counted per recipient, at attempt time (failed sends still count). */
export const HOURLY_LIMIT_PER_TENANT = 50;
/**
 * Recipients per day across ALL tenants: a safety valve that keeps the shared sender (a personal Gmail
 * account today, ~500 recipients/day) from being suspended by one runaway client.
 */
export const DAILY_GLOBAL_LIMIT = 300;

export const LOG_RETENTION_DAYS = 90;

export const tenantQuotaKey = (appId: string) => `hub-mail:app:${appId}`;
const GLOBAL_QUOTA_KEY = "hub-mail:global";

export type MailQuotaResult = { ok: true } | { ok: false; scope: "tenant" | "global"; retryAfterSeconds: number };

/** Takes `recipients` units from the tenant's hourly budget and from the global daily budget, or neither. */
export async function reserveMailQuota(appId: string, recipients: number): Promise<MailQuotaResult> {
  const tenant = await reserveQuota(tenantQuotaKey(appId), recipients, HOURLY_LIMIT_PER_TENANT, HOUR_MS);
  if (!tenant.admitted) return { ok: false, scope: "tenant", retryAfterSeconds: tenant.retryAfterSeconds };

  const global = await reserveQuota(GLOBAL_QUOTA_KEY, recipients, DAILY_GLOBAL_LIMIT, DAY_MS);
  if (!global.admitted) {
    await releaseQuota(tenantQuotaKey(appId), recipients); // the tenant must not pay for a global rejection
    return { ok: false, scope: "global", retryAfterSeconds: global.retryAfterSeconds };
  }
  return { ok: true };
}

/** Gives back a reservation when the work it paid for never happened (e.g. the OTP row could not be stored). */
export async function releaseMailQuota(appId: string, recipients: number) {
  await releaseQuota(tenantQuotaKey(appId), recipients);
  await releaseQuota(GLOBAL_QUOTA_KEY, recipients);
}

/**
 * A short, safe description of why a send failed. SMTP error text can contain server names, response
 * lines and other internals, so only a class and the numeric/system code are kept. Credentials can
 * never appear here because the raw message is not stored.
 */
export function describeSendError(error: unknown): string {
  const err = error as { code?: unknown; responseCode?: unknown } | null;
  const code = typeof err?.code === "string" ? err.code : undefined;
  const responseCode = typeof err?.responseCode === "number" ? err.responseCode : undefined;

  let kind = "delivery failed";
  if (code === "EAUTH") kind = "smtp authentication failed";
  else if (code === "EENVELOPE") kind = "recipient or sender rejected";
  else if (code === "ETIMEDOUT" || code === "ESOCKET" || code === "ECONNECTION" || code === "ECONNREFUSED" || code === "EDNS") kind = "smtp connection failed";
  else if (error instanceof Error && error.message === "SMTP is not configured") kind = "smtp not configured";

  return [kind, code && `(${code}${responseCode ? ` ${responseCode}` : ""})`].filter(Boolean).join(" ").slice(0, 300);
}

/** Display name from the tenant's app name, stripped of anything that could break a header. */
export const safeDisplayName = (name: string) => name.replace(/[\r\n\0<>"]/g, "").trim().slice(0, 80) || "Mail";

export type MailLogRow = {
  id: string;
  appId: string;
  keyId: string;
  recipient: string;
  subject: string;
  status: MailStatus;
  errorMessage?: string;
};

/** Written after the response (via after()). Also prunes old rows now and then (~1% of calls). */
export async function writeMailLogs(rows: MailLogRow[]) {
  if (rows.length === 0) return;
  const db = getDb();
  await db.insert(mailLogs).values(
    rows.map((r) => ({
      id: r.id,
      appId: r.appId,
      keyId: r.keyId,
      recipient: r.recipient,
      subject: r.subject.slice(0, 300),
      status: r.status,
      errorMessage: r.errorMessage ?? null,
    })),
  );
  if (Math.random() < 0.01) {
    await db.execute(sql`DELETE FROM mail_logs WHERE created_at < now() - make_interval(days => ${LOG_RETENTION_DAYS})`);
  }
}
