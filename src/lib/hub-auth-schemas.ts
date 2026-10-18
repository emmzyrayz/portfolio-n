import { z } from "zod";

// Pure (no I/O, no server-only): used by the hub auth endpoints and by unit tests.

/** No CR, LF or NUL: SMTP header-injection vectors (the address ends up in a To header). */
const noControl = /^[^\r\n\0]*$/;

export const emailSchema = z.string().trim().toLowerCase().max(254).regex(noControl).pipe(z.email());

export const otpRequestSchema = z.strictObject({ email: emailSchema });

/** The code is exactly six digits; anything else is rejected before it touches the database. */
export const otpVerifySchema = z.strictObject({ email: emailSchema, code: z.string().regex(/^\d{6}$/) });

/** Header carrying the end-user's token (Authorization is already used by the tenant API key). */
export const USER_TOKEN_HEADER = "x-user-token";
export const MAX_TOKEN_LENGTH = 2048;
const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/** The token from the header, or null if missing/oversized/not even shaped like a JWT. */
export function readUserToken(value: string | null): string | null {
  const token = value?.trim();
  return token && token.length <= MAX_TOKEN_LENGTH && JWT_SHAPE.test(token) ? token : null;
}

/** Field names only, never submitted values or internal messages. Whole-body problems report "body". */
export function invalidFields(issues: { path: PropertyKey[] }[]): string[] {
  return [...new Set(issues.map((i) => (typeof i.path[0] === "string" ? i.path[0] : "body")))];
}
