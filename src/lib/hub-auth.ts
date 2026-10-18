import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { tenantOtps, tenantSessions, tenantUsers } from "@/db/schema";
import * as core from "@/lib/hub-auth-crypto";

/**
 * Tenant end-user auth: OTP codes, users, sessions. Everything is scoped by the tenant id that comes from
 * the authenticated API key (never from the request body), so one tenant can neither see nor use another's
 * users, codes or tokens. Secret: HUB_JWT_SECRET only (kept separate from SESSION_SECRET on purpose).
 */

function secret() {
  const value = process.env.HUB_JWT_SECRET;
  if (!value || value.length < 32) throw new Error("HUB_JWT_SECRET must be set (32+ characters)");
  return value;
}

export { OTP_TTL_SECONDS } from "@/lib/hub-auth-crypto";

/** Per (tenant, email) limits in a 10-minute window. Counter keys hold a hash, never the address. */
export const REQUEST_LIMIT = 3;
export const VERIFY_LIMIT = 10;
export const AUTH_WINDOW_MS = 10 * 60 * 1000;
export const emailCounterKey = (kind: "req" | "ver", appId: string, email: string) =>
  `hub-auth:${kind}:${appId}:${createHash("sha256").update(email).digest("hex").slice(0, 32)}`;

/**
 * Issues a new code and invalidates the previous unconsumed ones for this (tenant, email) in ONE atomic
 * step. The neon-http driver has no interactive db.transaction(); batch() is its transaction: Neon runs
 * every statement in a single transaction and rolls all of them back if any fails.
 */
export async function createOtp(appId: string, email: string): Promise<string> {
  const code = core.generateOtp();
  const db = getDb();
  await db.batch([
    db
      .update(tenantOtps)
      .set({ consumedAt: new Date() })
      .where(and(eq(tenantOtps.appId, appId), eq(tenantOtps.email, email), isNull(tenantOtps.consumedAt))),
    db.insert(tenantOtps).values({
      appId,
      email,
      codeHash: core.hashOtp(secret(), appId, email, code),
      expiresAt: new Date(Date.now() + core.OTP_TTL_SECONDS * 1000),
    }),
  ]);
  return code;
}

export type TenantUserView = { id: string; email: string; role: string; metadata: Record<string, unknown>; createdAt: Date };

export type VerifyResult = { ok: true; token: string; expiresAt: Date; user: TenantUserView } | { ok: false };

const DUMMY_HASH = "0".repeat(64);

/**
 * Checks a code. Every failure (no such email, wrong, expired, locked, already used) is the same `ok:false`.
 * The attempt is burned atomically BEFORE comparing, so concurrent guesses cannot exceed 5 per code.
 */
export async function verifyOtp(appId: string, email: string, code: string): Promise<VerifyResult> {
  const db = getDb();

  // The live-code conditions are repeated in the OUTER where: under READ COMMITTED a concurrent updater
  // re-checks only the outer predicate after waiting for the row lock, not the subquery, so without this
  // parallel guesses could push `attempts` past the cap.
  const claimed = await db.execute(sql`
    UPDATE tenant_otps SET attempts = attempts + 1
    WHERE id = (
      SELECT id FROM tenant_otps
      WHERE app_id = ${appId} AND email = ${email} AND consumed_at IS NULL
        AND expires_at > now() AND attempts < ${core.OTP_MAX_ATTEMPTS}
      ORDER BY created_at DESC LIMIT 1
    )
    AND consumed_at IS NULL AND expires_at > now() AND attempts < ${core.OTP_MAX_ATTEMPTS}
    RETURNING id, code_hash
  `);
  const row = claimed.rows[0] as { id: string; code_hash: string } | undefined;

  // compare even when there is no live code, so "no code" and "wrong code" cost the same
  const matches = core.otpMatches(secret(), appId, email, code, row?.code_hash ?? DUMMY_HASH);
  if (!row || !matches) return { ok: false };

  // single use, even under concurrent submissions of the right code
  const consumed = await db
    .update(tenantOtps)
    .set({ consumedAt: new Date() })
    .where(and(eq(tenantOtps.id, row.id), isNull(tenantOtps.consumedAt)))
    .returning({ id: tenantOtps.id });
  if (consumed.length === 0) return { ok: false };

  // open sign-up: proving control of the inbox creates the user on first success
  const [user] = await db
    .insert(tenantUsers)
    .values({ appId, email })
    .onConflictDoUpdate({ target: [tenantUsers.appId, tenantUsers.email], set: { updatedAt: sql`now()` } })
    .returning({ id: tenantUsers.id, email: tenantUsers.email, role: tenantUsers.role, metadata: tenantUsers.metadata, createdAt: tenantUsers.createdAt });

  // ONE Date is the source of truth: it is stored in the session row AND becomes the JWT `exp`
  const sessionId = randomUUID();
  const expiresAt = core.sessionExpiry();
  const token = await core.issueToken(secret(), { userId: user.id, appId, sessionId, expiresAt });
  await db.insert(tenantSessions).values({ id: sessionId, appId, userId: user.id, tokenHash: core.hashToken(secret(), token), expiresAt });

  return { ok: true, token, expiresAt, user };
}

export type ResolvedSession = { user: TenantUserView; session: { id: string; expiresAt: Date } };

/**
 * The full check behind GET /auth/me. The token must verify (signature, HS256, issuer, audience, expiry),
 * belong to THIS tenant, and match a live session row whose user row still exists. Always reads the
 * database (no cache), so a logout or an owner revocation takes effect on the very next call.
 */
export async function resolveSession(appId: string, jwt: string): Promise<ResolvedSession | null> {
  const claims = await core.verifyToken(secret(), jwt);
  if (!claims || claims.appId !== appId) return null;

  const [row] = await getDb()
    .select({
      sessionId: tenantSessions.id,
      expiresAt: tenantSessions.expiresAt,
      tokenHash: tenantSessions.tokenHash,
      userId: tenantUsers.id,
      email: tenantUsers.email,
      role: tenantUsers.role,
      metadata: tenantUsers.metadata,
      createdAt: tenantUsers.createdAt,
    })
    .from(tenantSessions)
    // the inner join is the "user still exists" check: no tenant_users row, no 200
    .innerJoin(tenantUsers, and(eq(tenantUsers.id, tenantSessions.userId), eq(tenantUsers.appId, tenantSessions.appId)))
    .where(
      and(
        eq(tenantSessions.id, claims.sessionId),
        eq(tenantSessions.appId, appId),
        eq(tenantSessions.userId, claims.userId),
        isNull(tenantSessions.revokedAt),
        gt(tenantSessions.expiresAt, new Date()),
      ),
    );

  if (!row) return null;
  if (!core.tokenHashMatches(secret(), jwt, row.tokenHash)) return null;
  if (Math.floor(row.expiresAt.getTime() / 1000) !== claims.exp) return null; // token and row must agree on expiry

  return {
    user: { id: row.userId, email: row.email, role: row.role, metadata: row.metadata, createdAt: row.createdAt },
    session: { id: row.sessionId, expiresAt: row.expiresAt },
  };
}

/** Revokes the session a token belongs to (idempotent). false = the token is not valid for this tenant. */
export async function revokeSession(appId: string, jwt: string): Promise<boolean> {
  const claims = await core.verifyToken(secret(), jwt);
  if (!claims || claims.appId !== appId) return false;

  const db = getDb();
  const [session] = await db
    .select({ tokenHash: tenantSessions.tokenHash, revokedAt: tenantSessions.revokedAt })
    .from(tenantSessions)
    .where(and(eq(tenantSessions.id, claims.sessionId), eq(tenantSessions.appId, appId), eq(tenantSessions.userId, claims.userId)));
  if (!session || !core.tokenHashMatches(secret(), jwt, session.tokenHash)) return false;

  if (!session.revokedAt) {
    await db
      .update(tenantSessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(tenantSessions.id, claims.sessionId), eq(tenantSessions.appId, appId), isNull(tenantSessions.revokedAt)));
  }
  return true;
}

/* ---------- housekeeping ---------- */

const PRUNE_EVERY_MS = 10 * 60 * 1000;
const g = globalThis as typeof globalThis & { __tenantAuthLastPrune?: number };

/** Opportunistic cleanup, at most once per 10 min per instance: codes older than a day, sessions expired 30+ days ago. */
export async function maybePruneTenantAuth() {
  const now = Date.now();
  if (now - (g.__tenantAuthLastPrune ?? 0) < PRUNE_EVERY_MS) return;
  g.__tenantAuthLastPrune = now;
  const db = getDb();
  await db.execute(sql`DELETE FROM tenant_otps WHERE created_at < now() - interval '1 day'`);
  await db.execute(sql`DELETE FROM tenant_sessions WHERE expires_at < now() - interval '30 days'`);
}
