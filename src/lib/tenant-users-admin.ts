import "server-only";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { apps, tenantSessions, tenantUsers } from "@/db/schema";
import { verifyOwner } from "@/lib/dal";

// Owner-only view of each tenant's end-users. Re-verifies the session itself, is scoped by app_id, and
// only ever touches `client` tenants. There is no hub endpoint that exposes any of this.

export const USERS_PER_APP = 25;

export type DirectoryUser = {
  id: string;
  email: string;
  role: string;
  /** Rendered as text only, never as HTML. */
  metadata: Record<string, unknown>;
  createdAt: Date;
  activeSessions: number;
};

export type AppDirectory = {
  totalUsers: number;
  usersWithSession: number;
  activeSessions: number;
  users: DirectoryUser[];
};

const empty = (): AppDirectory => ({ totalUsers: 0, usersWithSession: 0, activeSessions: 0, users: [] });

type UserRow = { id: string; app_id: string; email: string; role: string; metadata: Record<string, unknown>; created_at: Date | string; active_sessions: number | string };
type CountRow = { app_id: string; total: number | string; with_session: number | string; sessions: number | string };

export async function listTenantDirectories(appIds: string[]): Promise<Map<string, AppDirectory>> {
  await verifyOwner();
  const byApp = new Map<string, AppDirectory>(appIds.map((id) => [id, empty()]));
  if (appIds.length === 0) return byApp;

  const db = getDb();
  const idList = sql.join(appIds.map((id) => sql`${id}::uuid`), sql`, `);

  const counts = await db.execute(sql`
    SELECT u.app_id,
           count(DISTINCT u.id) AS total,
           count(DISTINCT s.user_id) AS with_session,
           count(s.id) AS sessions
    FROM tenant_users u
    LEFT JOIN tenant_sessions s ON s.user_id = u.id AND s.revoked_at IS NULL AND s.expires_at > now()
    WHERE u.app_id IN (${idList})
    GROUP BY u.app_id
  `);
  for (const r of counts.rows as CountRow[]) {
    const d = byApp.get(r.app_id);
    if (d) Object.assign(d, { totalUsers: Number(r.total), usersWithSession: Number(r.with_session), activeSessions: Number(r.sessions) });
  }

  const users = await db.execute(sql`
    SELECT t.id, t.app_id, t.email, t.role, t.metadata, t.created_at, t.active_sessions
    FROM (
      SELECT u.*,
             (SELECT count(*) FROM tenant_sessions s WHERE s.user_id = u.id AND s.revoked_at IS NULL AND s.expires_at > now()) AS active_sessions,
             row_number() OVER (PARTITION BY u.app_id ORDER BY u.created_at DESC) AS rn
      FROM tenant_users u WHERE u.app_id IN (${idList})
    ) t
    WHERE t.rn <= ${USERS_PER_APP}
    ORDER BY t.created_at DESC
  `);
  for (const r of users.rows as UserRow[]) {
    byApp.get(r.app_id)?.users.push({
      id: r.id,
      email: r.email,
      role: r.role,
      metadata: r.metadata ?? {},
      createdAt: new Date(r.created_at),
      activeSessions: Number(r.active_sessions),
    });
  }
  return byApp;
}

const clientApps = () => getDb().select({ id: apps.id }).from(apps).where(eq(apps.kind, "client"));

/** Signs one user out everywhere. Returns how many live sessions were revoked. */
export async function revokeUserSessions(userId: string): Promise<number> {
  await verifyOwner();
  const revoked = await getDb()
    .update(tenantSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(tenantSessions.userId, userId), isNull(tenantSessions.revokedAt), inArray(tenantSessions.appId, clientApps())))
    .returning({ id: tenantSessions.id });
  return revoked.length;
}

/** Removes the user; their sessions go with them (cascade). Only for client tenants. */
export async function deleteTenantUser(userId: string): Promise<boolean> {
  await verifyOwner();
  const deleted = await getDb()
    .delete(tenantUsers)
    .where(and(eq(tenantUsers.id, userId), inArray(tenantUsers.appId, clientApps())))
    .returning({ id: tenantUsers.id });
  return deleted.length > 0;
}
