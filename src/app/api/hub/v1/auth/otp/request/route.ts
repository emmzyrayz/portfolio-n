import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { withHub } from "@/lib/hub";
import { AUTH_WINDOW_MS, OTP_TTL_SECONDS, REQUEST_LIMIT, createOtp, emailCounterKey, maybePruneTenantAuth } from "@/lib/hub-auth";
import { invalidFields, otpRequestSchema } from "@/lib/hub-auth-schemas";
import { isMailAvailable, sendMail } from "@/lib/mail";
import { describeSendError, releaseMailQuota, reserveMailQuota, safeDisplayName, writeMailLogs } from "@/lib/mail-hub";
import { hitRateLimit } from "@/lib/rate-limit";

// Starts a passwordless sign-in for one of the tenant's end-users. The response is identical for every
// address (nothing to enumerate). Order matters: validation, per-email limit, mail availability, then the
// mail budget is RESERVED, and only after that is the code stored, so a refused request never leaves a
// dead code behind.
const MAX_BODY_BYTES = 1024;

const invalidRequest = (fields: string[]) =>
  Response.json({ error: { code: "invalid_request", message: "The request body is invalid.", fields } }, { status: 400 });

export const POST = withHub(async ({ app, key }, request) => {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return invalidRequest(["content-type"]);

  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
    return Response.json({ error: { code: "payload_too_large", message: "The request body is too large." } }, { status: 413 });
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return invalidRequest(["body"]);
  }
  const parsed = otpRequestSchema.safeParse(json);
  if (!parsed.success) return invalidRequest(invalidFields(parsed.error.issues));
  const { email } = parsed.data;

  if (!isMailAvailable()) {
    return Response.json({ error: { code: "mail_unavailable", message: "Sign-in email is not available right now." } }, { status: 503 });
  }

  const limit = await hitRateLimit(emailCounterKey("req", app.id, email), REQUEST_LIMIT, AUTH_WINDOW_MS);
  if (limit.limited) {
    return Response.json(
      { error: { code: "rate_limited", message: "Too many sign-in requests. Try again later." } },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  // 1) reserve the mail budget, 2) only then store the code
  const quota = await reserveMailQuota(app.id, 1);
  if (!quota.ok) {
    return Response.json(
      { error: { code: "quota_exceeded", message: "Sign-in email capacity is temporarily exhausted. Try again later." } },
      { status: 429, headers: { "Retry-After": String(quota.retryAfterSeconds) } },
    );
  }

  let code: string;
  try {
    code = await createOtp(app.id, email);
  } catch (error) {
    await releaseMailQuota(app.id, 1).catch(() => {}); // nothing will be sent, so nothing is spent
    console.error("hub auth: could not store code", error instanceof Error ? error.message : error);
    return Response.json({ error: { code: "internal_error", message: "Something went wrong." } }, { status: 500 });
  }

  const tenantName = safeDisplayName(app.name);
  const subject = `Your sign-in code for ${tenantName}`;
  const mailId = randomUUID();
  after(async () => {
    let status: "sent" | "failed" = "sent";
    let errorMessage: string | undefined;
    try {
      await sendMail({
        to: email,
        subject,
        fromName: tenantName,
        text: `Your sign-in code is ${code}\n\nIt expires in ${OTP_TTL_SECONDS / 60} minutes. If you did not request it, you can ignore this email.`,
        html: `<p>Your sign-in code is</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p><p>It expires in ${OTP_TTL_SECONDS / 60} minutes. If you did not request it, you can ignore this email.</p>`,
      });
    } catch (error) {
      status = "failed";
      errorMessage = describeSendError(error);
      console.error("hub auth: send failed", errorMessage); // never the code
    }
    try {
      await writeMailLogs([{ id: mailId, appId: app.id, keyId: key.id, recipient: email, subject, status, errorMessage }]);
      await maybePruneTenantAuth();
    } catch (error) {
      console.error("hub auth: bookkeeping failed", error instanceof Error ? error.message : error);
    }
  });

  return Response.json({ ok: true, expiresInSeconds: OTP_TTL_SECONDS }, { status: 202 });
});
