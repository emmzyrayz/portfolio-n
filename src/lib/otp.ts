import "server-only";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;

export function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("SESSION_SECRET must be set (32+ characters)");
  return value;
}

export function generateOtp() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashOtp(email: string, code: string) {
  return createHmac("sha256", secret()).update(`otp:${email}:${code}`).digest("hex");
}

export function otpMatches(email: string, code: string, expectedHash: string) {
  const a = Buffer.from(hashOtp(email, code), "hex");
  const b = Buffer.from(expectedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isOwnerEmail(email: string) {
  const owner = process.env.OWNER_EMAIL;
  return Boolean(owner) && normalizeEmail(owner!) === email;
}
