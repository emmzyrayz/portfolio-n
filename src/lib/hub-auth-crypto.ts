import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

// Cryptographic core of the tenant auth engine. Pure: the secret is a parameter and there is no
// server-only import, so it can be unit-tested. src/lib/hub-auth.ts binds it to HUB_JWT_SECRET.

export const OTP_TTL_SECONDS = 10 * 60;
export const OTP_MAX_ATTEMPTS = 5;
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export const TOKEN_ISSUER = "portfolio-hub";
export const TOKEN_AUDIENCE = "hub-tenant";

/** 6 digits from a CSPRNG (never Math.random). */
export function generateOtp() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

const hmac = (secret: string, data: string) => createHmac("sha256", secret).update(data).digest("hex");

function safeEqualHex(a: string, b: string) {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

/** Bound to one tenant AND one email: a code can never be replayed under another tenant or address. */
// JSON-array encoding keeps the input unambiguous whatever characters the fields contain
// (a ':'-joined string would hash ("a:b","c") and ("a","b:c") identically).
export const hashOtp = (secret: string, appId: string, email: string, code: string) => hmac(secret, JSON.stringify(["tenant-otp", appId, email, code]));

export function otpMatches(secret: string, appId: string, email: string, code: string, expectedHash: string) {
  return safeEqualHex(hashOtp(secret, appId, email, code), expectedHash);
}

/** Stored instead of the token itself, so a database leak reveals no usable token. */
export const hashToken = (secret: string, jwt: string) => hmac(secret, `tenant-token:${jwt}`);

export const tokenHashMatches = (secret: string, jwt: string, expectedHash: string) => safeEqualHex(hashToken(secret, jwt), expectedHash);

/**
 * One Date is the single source of truth for a session's expiry: it is truncated to whole seconds (a JWT
 * `exp` has no sub-second part) and the SAME value is written to tenant_sessions.expires_at and to the
 * token's `exp`, so the two can never drift apart.
 */
export function sessionExpiry(now = Date.now()) {
  return new Date(Math.floor((now + SESSION_TTL_SECONDS * 1000) / 1000) * 1000);
}

export type TokenClaims = { userId: string; appId: string; sessionId: string; expiresAt: Date };

export async function issueToken(secret: string, claims: TokenClaims): Promise<string> {
  return new SignJWT({ app: claims.appId, sid: claims.sessionId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(claims.userId)
    .setIssuer(TOKEN_ISSUER)
    .setAudience(TOKEN_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(Math.floor(claims.expiresAt.getTime() / 1000)) // exact unix timestamp of expiresAt
    .sign(new TextEncoder().encode(secret));
}

/** Signature, algorithm (HS256 only: no `none`), issuer, audience and expiry. null for anything else. */
export async function verifyToken(secret: string, jwt: string): Promise<{ userId: string; appId: string; sessionId: string; exp: number } | null> {
  try {
    const { payload } = await jwtVerify(jwt, new TextEncoder().encode(secret), {
      algorithms: ["HS256"],
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
    });
    if (typeof payload.sub !== "string" || typeof payload.app !== "string" || typeof payload.sid !== "string" || typeof payload.exp !== "number") return null;
    return { userId: payload.sub, appId: payload.app, sessionId: payload.sid, exp: payload.exp };
  } catch {
    return null;
  }
}
