import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { withHub } from "@/lib/hub";
import { isMailAvailable, sendMail } from "@/lib/mail";
import { describeSendError, reserveMailQuota, writeMailLogs, type MailLogRow } from "@/lib/mail-hub";
import { MAX_REQUEST_BYTES, invalidFields, mailSendSchema } from "@/lib/mail-schemas";

// Sends transactional email on behalf of an authenticated tenant, through the shared sendMail().
// The sender address is always MAIL_FROM; the display name is the tenant's name. Nothing in the request
// can choose another tenant or another sender. Each recipient gets their own message.
export const maxDuration = 30; // SMTP can be slow; the quota/DB work around it is not

const invalidRequest = (fields: string[]) =>
  Response.json({ error: { code: "invalid_request", message: "The request body is invalid.", fields } }, { status: 400 });

/** Display name from the tenant's app name, stripped of anything that could break a header. */
const safeName = (name: string) => name.replace(/[\r\n\0<>"]/g, "").trim().slice(0, 80) || "Mail";

export const POST = withHub(async ({ app, key }, request) => {
  if (!isMailAvailable()) {
    return Response.json({ error: { code: "mail_unavailable", message: "Mail delivery is not available right now." } }, { status: 503 });
  }

  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return invalidRequest(["content-type"]);

  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_REQUEST_BYTES) {
    return Response.json({ error: { code: "payload_too_large", message: "The request body is too large." } }, { status: 413 });
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return invalidRequest(["body"]);
  }

  // Generic 400: field names only. Invalid requests use no quota and are not logged.
  const parsed = mailSendSchema.safeParse(json);
  if (!parsed.success) return invalidRequest(invalidFields(parsed.error.issues));
  const { to: recipients, subject, text, html, replyTo } = parsed.data;

  const quota = await reserveMailQuota(app.id, recipients.length);
  if (!quota.ok) {
    return Response.json(
      { error: { code: "quota_exceeded", message: quota.scope === "tenant" ? "Hourly email quota reached for this project." : "Email capacity is temporarily exhausted. Try again later." } },
      { status: 429, headers: { "Retry-After": String(quota.retryAfterSeconds) } },
    );
  }

  // Sent synchronously so the caller gets a truthful result. One message per recipient.
  const results: { id: string; to: string; status: "sent" | "failed" }[] = [];
  const logs: MailLogRow[] = [];
  for (const to of recipients) {
    const id = randomUUID();
    try {
      await sendMail({ to, subject, text, html, replyTo, fromName: safeName(app.name) });
      results.push({ id, to, status: "sent" });
      logs.push({ id, appId: app.id, keyId: key.id, recipient: to, subject, status: "sent" });
    } catch (error) {
      console.error("hub mail: send failed", describeSendError(error)); // never the raw error, never the body
      results.push({ id, to, status: "failed" });
      logs.push({ id, appId: app.id, keyId: key.id, recipient: to, subject, status: "failed", errorMessage: describeSendError(error) });
    }
  }

  after(async () => {
    try {
      await writeMailLogs(logs);
    } catch (error) {
      console.error("hub mail: could not write logs", error instanceof Error ? error.message : error);
    }
  });

  const sent = results.filter((r) => r.status === "sent").length;
  if (sent === 0) {
    // Clients only learn that delivery failed, never why (SMTP details stay in the owner's log).
    return Response.json({ error: { code: "delivery_failed", message: "The message could not be delivered." }, results }, { status: 502 });
  }
  return Response.json({ ok: sent === results.length, results }, { status: sent === results.length ? 200 : 207 });
});
