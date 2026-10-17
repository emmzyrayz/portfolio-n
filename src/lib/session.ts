import "server-only";
import { cookies, headers } from "next/headers";
import { jwtVerify, SignJWT } from "jose";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { sessions } from "@/db/schema";
import { secret } from "@/lib/otp";

export const SESSION_COOKIE = "session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const key = () => new TextEncoder().encode(secret());

/** Creates the DB session row and sets the signed httpOnly cookie. */
export async function createSession(userId: string, appId: string) {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const userAgent = (await headers()).get("user-agent")?.slice(0, 300) ?? null;
  const [row] = await getDb()
    .insert(sessions)
    .values({ userId, appId, expiresAt, userAgent })
    .returning({ id: sessions.id });

  const token = await new SignJWT({ sid: row.id })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(key());

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/** Session id from the signed cookie, or null if missing/invalid/expired. */
export async function readSessionId() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    return typeof payload.sid === "string" ? payload.sid : null;
  } catch {
    return null;
  }
}

export async function destroySession() {
  const sid = await readSessionId();
  if (sid) await getDb().update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sid));
  (await cookies()).delete(SESSION_COOKIE);
}
