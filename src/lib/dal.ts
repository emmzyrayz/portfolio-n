import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { sessions, users } from "@/db/schema";
import { readSessionId } from "@/lib/session";

/**
 * Data access layer: the authoritative session check. Call it from every
 * dashboard page and Server Action (proxy.ts only does an optimistic check).
 * Reads cookies, so with cacheComponents it must run under <Suspense>.
 */
export const verifySession = cache(async () => {
  const sid = await readSessionId();
  if (!sid) redirect("/login");

  const [row] = await getDb()
    .select({ userId: users.id, email: users.email, appId: users.appId, role: users.role })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, sid), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())));

  if (!row) redirect("/login");
  return row;
});
