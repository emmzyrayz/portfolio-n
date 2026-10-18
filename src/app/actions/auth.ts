"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { otpCodes, users } from "@/db/schema";
import { getDefaultAppId } from "@/lib/app";
import { isMailConfigured, sendMail } from "@/lib/mail";
import {
  OTP_MAX_ATTEMPTS,
  OTP_TTL_MS,
  generateOtp,
  hashOtp,
  isOwnerEmail,
  normalizeEmail,
  otpMatches,
} from "@/lib/otp";
import { rateLimited } from "@/lib/rate-limit";
import { createSession, destroySession } from "@/lib/session";

export type AuthState = {
  status: "idle" | "sent" | "error";
  email?: string;
  message?: string;
};

const WINDOW_MS = 10 * 60 * 1000;
const emailSchema = z.email().max(200);
const codeSchema = z.string().regex(/^\d{6}$/);

const SENT_MESSAGE = "If that address can sign in, a 6-digit code is on its way. It expires in 10 minutes.";
const INVALID_CODE = "That code is invalid or has expired.";
const TOO_MANY = "Too many attempts. Please try again in a few minutes.";

async function clientIp() {
  return (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

async function deliverCode(to: string, code: string) {
  try {
    if (isMailConfigured()) {
      await sendMail({
        to,
        subject: "Your sign-in code",
        text: `Your sign-in code is ${code}. It expires in 10 minutes. If you didn't request it, ignore this email.`,
      });
    } else if (process.env.NODE_ENV === "development") {
      console.log(`[dev only] OTP for ${to}: ${code}`);
    } else {
      console.error("OTP not delivered: SMTP is not configured");
    }
  } catch (error) {
    console.error("OTP email failed:", error);
  }
}

/**
 * Identical response for every address (no account enumeration). Only the owner
 * gets a code; the send runs in after() so timing doesn't reveal which path ran.
 */
export async function requestOtp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = emailSchema.safeParse(String(formData.get("email") ?? "").trim());
  if (!parsed.success) return { status: "error", message: "Please enter a valid email address." };

  const email = normalizeEmail(parsed.data);
  const ip = await clientIp();
  if (
    (await rateLimited(`otp-send:ip:${ip}`, 10, WINDOW_MS)) ||
    (await rateLimited(`otp-send:email:${email}`, 3, WINDOW_MS))
  ) {
    return { status: "error", message: TOO_MANY };
  }

  if (isOwnerEmail(email)) {
    const db = getDb();
    const appId = await getDefaultAppId();
    const code = generateOtp();
    // Only the newest code is ever valid.
    await db
      .update(otpCodes)
      .set({ consumedAt: new Date() })
      .where(and(eq(otpCodes.appId, appId), eq(otpCodes.email, email), isNull(otpCodes.consumedAt)));
    await db.insert(otpCodes).values({
      appId,
      email,
      codeHash: hashOtp(email, code),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
      ip,
    });
    after(() => deliverCode(email, code));
  }

  return { status: "sent", email, message: SENT_MESSAGE };
}

export async function verifyOtp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const code = codeSchema.safeParse(String(formData.get("code") ?? "").trim());
  const retry = { status: "error", email, message: INVALID_CODE } as const;

  if (!emailSchema.safeParse(email).success || !code.success) return retry;

  const ip = await clientIp();
  if (
    (await rateLimited(`otp-verify:ip:${ip}`, 20, WINDOW_MS)) ||
    (await rateLimited(`otp-verify:email:${email}`, 10, WINDOW_MS))
  ) {
    return { ...retry, message: TOO_MANY };
  }

  if (!isOwnerEmail(email)) return retry;

  const db = getDb();
  const appId = await getDefaultAppId();

  // Atomically burn one attempt on the newest live code. Codes with 5 attempts used are dead.
  const claimed = await db.execute(sql`
    UPDATE otp_codes SET attempts = attempts + 1
    WHERE id = (
      SELECT id FROM otp_codes
      WHERE app_id = ${appId} AND email = ${email} AND consumed_at IS NULL
        AND expires_at > now() AND attempts < ${OTP_MAX_ATTEMPTS}
      ORDER BY created_at DESC LIMIT 1
    )
    AND consumed_at IS NULL AND expires_at > now() AND attempts < ${OTP_MAX_ATTEMPTS}
    RETURNING id, code_hash
  `);
  const row = claimed.rows[0] as { id: string; code_hash: string } | undefined;
  if (!row || !otpMatches(email, code.data, row.code_hash)) return retry;

  // Single use, even under concurrent submissions.
  const consumed = await db
    .update(otpCodes)
    .set({ consumedAt: new Date() })
    .where(and(eq(otpCodes.id, row.id), isNull(otpCodes.consumedAt)))
    .returning({ id: otpCodes.id });
  if (consumed.length === 0) return retry;

  const [user] = await db
    .insert(users)
    .values({ appId, email, role: "owner" })
    .onConflictDoUpdate({ target: [users.appId, users.email], set: { role: "owner" } })
    .returning({ id: users.id });

  await createSession(user.id, appId);
  redirect("/dashboard");
}

export async function logout() {
  await destroySession();
  redirect("/");
}
